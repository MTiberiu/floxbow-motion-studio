import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";
import { renderProject } from "../packages/renderer/src/render";
import { mediaRegistrySchema } from "@motion/project-loader/media";

const built = process.argv.includes("--built");
const id = `golden-starter-${Date.now()}`;
const createdIds = [id];
const projectPath = path.join(projectsDir, id);
let renderedStill: string | undefined;
const audioFixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "flox-media-smoke-"));
const audioFixturePath = path.join(audioFixtureDirectory, "flox-smoke-audio.wav");
const audioFixture = Buffer.alloc(46);
audioFixture.write("RIFF", 0, "ascii");
audioFixture.writeUInt32LE(38, 4);
audioFixture.write("WAVEfmt ", 8, "ascii");
audioFixture.writeUInt32LE(16, 16);
audioFixture.writeUInt16LE(1, 20);
audioFixture.writeUInt16LE(1, 22);
audioFixture.writeUInt32LE(8_000, 24);
audioFixture.writeUInt32LE(16_000, 28);
audioFixture.writeUInt16LE(2, 32);
audioFixture.writeUInt16LE(16, 34);
audioFixture.write("data", 36, "ascii");
audioFixture.writeUInt32LE(2, 40);
audioFixture.writeInt16LE(0, 44);
await writeFile(audioFixturePath, audioFixture);
let pickerCalls = 0;
let markSecondPickerStarted!: () => void;
let releaseSecondPicker!: (selectedPath: string | undefined) => void;
const secondPickerStarted = new Promise<void>((resolve) => {
  markSecondPickerStarted = resolve;
});
const servers = await startServers(built, 10, {
  audioFilePicker: async () => {
    pickerCalls += 1;
    if (pickerCalls === 2) {
      markSecondPickerStarted();
      return new Promise((resolve) => {
        releaseSecondPicker = resolve;
      });
    }
    return audioFixturePath;
  },
});
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE",
  ),
) as Record<string, string>;
env.STUDIO_URL = servers.url;

let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [path.join(root, "apps/desktop/electron/main.cjs")],
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => console.error("Electron renderer error:", error));
  await page.evaluate(() => {
    localStorage.removeItem("motion-project");
    for (const key of Object.keys(localStorage))
      if (key.startsWith("motion-draft-v1:")) localStorage.removeItem(key);
  });
  await page.reload();
  await expect(page.getByText("A CLEAN WORKSPACE")).toBeVisible();
  await expect(page.getByText("Create your first video project")).toBeVisible();

  await page.getByRole("button", { name: "Explore capabilities" }).click();
  await expect(page.getByRole("region", { name: "Capabilities explorer" })).toBeVisible();
  await expect(page.locator(".capability-preview")).toBeVisible();
  await page.getByRole("tab", { name: "Developer / AI" }).click();
  await expect(page.getByText("Public API", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Read docs\// }).click();
  await expect(page.getByLabel("Documentation")).toBeVisible();
  await expect(page.locator(".capability-resource pre")).not.toBeEmpty();

  const firstPanelRequest = {
    panelId: "timeline" as const,
    projectId: id,
    sessionId: randomUUID(),
  };
  const panelApi = await page.evaluate(async (request) => {
    const api = window.floxBowWindows;
    if (!api) throw new Error("Electron window API is missing");
    return {
      keys: Object.keys(api).sort(),
      context: await api.getContext(),
      result: await api.openPanel(request),
      nodeDisabled: !("require" in window) && typeof process === "undefined",
    };
  }, firstPanelRequest);
  expect(panelApi.context).toEqual({ role: "primary", panelId: null });
  expect(panelApi.keys).toEqual([
    "closePanel", "getContext", "onPanelClosed", "onTimelineCommand",
    "onTimelineCommandResult", "onTimelineFrame", "onTimelineSnapshot",
    "onTimelineSnapshotRequest", "openPanel", "publishTimelineFrame",
    "publishTimelineSnapshot", "requestTimelineSnapshot", "sendTimelineCommand",
    "sendTimelineCommandResult",
  ]);
  expect(panelApi.result.status).toBe("opened");
  expect(panelApi.nodeDisabled).toBe(true);
  await expect.poll(async () => (await app!.windows()).length).toBe(2);
  let panelPage = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
  expect(panelPage).toBeTruthy();
  await expect(panelPage!.getByRole("heading", { name: "Connecting Timeline…" })).toBeVisible();
  await expect(panelPage!.locator("iframe")).toHaveCount(0);
  await expect(panelPage!.locator(".timeline-editor")).toHaveCount(0);
  const panelContext = await panelPage!.evaluate(() => window.floxBowWindows!.getContext());
  expect(panelContext).toMatchObject({
    role: "panel",
    panelId: "timeline",
    projectId: id,
    sessionId: firstPanelRequest.sessionId,
    instanceId: panelApi.result.instanceId,
  });
  const duplicatePanelResult = await page.evaluate(
    (request) => window.floxBowWindows!.openPanel(request),
    firstPanelRequest,
  );
  expect(duplicatePanelResult).toMatchObject({
    status: "focused",
    instanceId: panelApi.result.instanceId,
  });
  const deniedPanelOpen = await panelPage!.evaluate(async (request) => {
    try {
      await window.floxBowWindows!.openPanel(request);
      return false;
    } catch {
      return true;
    }
  }, firstPanelRequest);
  expect(deniedPanelOpen).toBe(true);
  const malformedPanelOpen = await page.evaluate(async () => {
    try {
      await window.floxBowWindows!.openPanel({ panelId: "file", path: "C:/private" } as never);
      return false;
    } catch {
      return true;
    }
  });
  expect(malformedPanelOpen).toBe(true);

  const replacementRequest = { ...firstPanelRequest, sessionId: randomUUID() };
  const replacedPanelResult = await page.evaluate(
    (request) => window.floxBowWindows!.openPanel(request),
    replacementRequest,
  );
  expect(replacedPanelResult.status).toBe("opened");
  expect(replacedPanelResult.instanceId).not.toBe(panelApi.result.instanceId);
  await expect.poll(async () => (await app!.windows()).length).toBe(2);
  panelPage = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
  expect(panelPage).toBeTruthy();
  await expect(panelPage!.getByRole("heading", { name: "Connecting Timeline…" })).toBeVisible();
  await expect(panelPage!.locator("iframe")).toHaveCount(0);
  await expect(panelPage!.getByText(/snapshot did not arrive/i)).toBeVisible({ timeout: 10_000 });
  await expect(panelPage!.getByRole("button", { name: "Retry sync", exact: true })).toBeEnabled();
  await expect(panelPage!.getByRole("button", { name: "Attach Timeline", exact: true })).toBeEnabled();
  const panelClosed = page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Panel close notification timed out")), 10_000);
        const unsubscribe = window.floxBowWindows!.onPanelClosed((event) => {
          window.clearTimeout(timeout);
          unsubscribe();
          resolve(event);
        });
      }),
  );
  await panelPage!.close();
  expect(await panelClosed).toMatchObject({
    panelId: "timeline",
    projectId: id,
    sessionId: replacementRequest.sessionId,
    instanceId: replacedPanelResult.instanceId,
  });
  await expect.poll(async () => (await app!.windows()).length).toBe(1);

  if (built) {
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create Project" })).toBeDisabled();
    console.log("PASS built: empty starter, capability metadata, real preview and docs.");
  } else {
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByLabel("Project name").fill(id);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();

    const authoritativeSessionId = await page
      .locator(".timeline-editor")
      .getAttribute("data-editor-session-id");
    expect(authoritativeSessionId).toBeTruthy();
    await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const editorPanelPage = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
    expect(editorPanelPage).toBeTruthy();
    await expect(page.locator(".timeline-editor")).toHaveCount(1);
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(1);
    await expect(editorPanelPage!.locator(".timeline-editor")).toHaveCount(0);
    await expect(editorPanelPage!.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".timeline-detached-placeholder")).toBeVisible();
    await expect(page.locator(".timeline-dock")).toHaveCount(0);
    await expect(editorPanelPage!.locator(".timeline-dock")).toHaveCount(1);
    await expect(editorPanelPage!.locator(".detached-timeline-window")).toHaveAttribute(
      "data-editor-session-id", authoritativeSessionId!,
    );
    await editorPanelPage!.getByRole("button", { name: "Attach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);

    // Native close is another attach path and must restore the main editor view.
    await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const closePanelPage = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
    expect(closePanelPage).toBeTruthy();
    await closePanelPage!.close();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);

    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project media" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Audio" })).toBeEnabled();
    await page.getByRole("button", { name: "Add Audio" }).click();
    await expect(page.getByText("flox-smoke-audio", { exact: true })).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    const mediaFile = path.join(projectPath, "media.json");
    const registeredMedia = JSON.parse(await readFile(mediaFile, "utf8"));
    expect(registeredMedia.assets).toHaveLength(1);
    expect(registeredMedia.assets[0].source.path).toBe(audioFixturePath);
    expect((await stat(audioFixturePath)).size).toBe(audioFixture.length);

    const mediaUrl = new URL(`/api/media/${id}`, servers.url).toString();
    const publicState = await fetch(mediaUrl).then((response) => response.text());
    const mediaSnapshot = JSON.parse(publicState);
    expect(publicState.includes(audioFixturePath)).toBe(false);
    const rejectedOrigin = await fetch(mediaUrl, {
      method: "POST",
      headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: mediaSnapshot.revision }),
    });
    expect(rejectedOrigin.status).toBe(403);
    const rejectedPath = await fetch(mediaUrl, {
      method: "POST",
      headers: { Origin: new URL(servers.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: mediaSnapshot.revision, path: "C:\\private\\not-selected.wav" }),
    });
    expect(rejectedPath.status).toBe(400);
    expect(pickerCalls).toBe(1);

    await page.reload();
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(page.getByText("flox-smoke-audio", { exact: true })).toBeVisible();
    const externalRegistry = {
      ...registeredMedia,
      assets: [
        ...registeredMedia.assets,
        {
          id: "external-agent-audio",
          type: "audio",
          displayName: "Added by external agent",
          source: { kind: "external-file", path: audioFixturePath },
        },
      ],
    };
    await writeFile(mediaFile, `${JSON.stringify(externalRegistry, null, 2)}\n`);
    await expect(page.getByText("Added by external agent", { exact: true })).toBeVisible();

    const removeUrl = new URL(`/api/media/${id}/assets/external-agent-audio`, servers.url).toString();
    const currentMedia = await fetch(mediaUrl).then((response) => response.json());
    const rejectedRemoveOrigin = await fetch(removeUrl, {
      method: "DELETE",
      headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: currentMedia.revision }),
    });
    expect(rejectedRemoveOrigin.status).toBe(403);
    const rejectedRemovePayload = await fetch(removeUrl, {
      method: "DELETE",
      headers: { Origin: new URL(servers.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: currentMedia.revision, path: "C:\\private\\do-not-delete.wav" }),
    });
    expect(rejectedRemovePayload.status).toBe(400);
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(2);

    await page.getByRole("button", { name: "Add Audio" }).click();
    await Promise.race([
      secondPickerStarted,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Audio picker did not open")), 10_000)),
    ]);
    const concurrentRegistry = {
      ...externalRegistry,
      assets: [
        ...externalRegistry.assets,
        {
          id: "agent-edit-during-picker",
          type: "audio",
          displayName: "Agent change during file selection",
          source: { kind: "external-file", path: audioFixturePath },
        },
      ],
    };
    await writeFile(mediaFile, `${JSON.stringify(concurrentRegistry, null, 2)}\n`);
    releaseSecondPicker(audioFixturePath);
    await expect(page.getByRole("alert")).toContainText("CONFLICT: The media registry changed");
    await expect(page.getByText("Agent change during file selection", { exact: true })).toBeVisible();
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(3);

    let confirmationText = "";
    const uiRemovedAsset = page.getByRole("listitem").filter({ hasText: "Added by external agent" });
    page.once("dialog", async (dialog) => {
      confirmationText = dialog.message();
      await dialog.accept();
    });
    await uiRemovedAsset.getByRole("button", { name: "Remove from Project" }).click();
    await expect(page.getByRole("status")).toContainText("The original audio file was not deleted");
    expect(confirmationText).toContain("The original audio file will NOT be deleted");
    const afterUiRemoval = mediaRegistrySchema.parse(JSON.parse(await readFile(mediaFile, "utf8")));
    expect(afterUiRemoval.assets.map((asset) => asset.id)).toEqual([
      registeredMedia.assets[0].id,
      "agent-edit-during-picker",
    ]);
    expect((await stat(audioFixturePath)).size).toBe(audioFixture.length);

    // Simulate an external coding agent removing the requested stable ID from the canonical file.
    const beforeAgentRemoval = mediaRegistrySchema.parse(JSON.parse(await readFile(mediaFile, "utf8")));
    const agentEdited = {
      ...beforeAgentRemoval,
      assets: beforeAgentRemoval.assets.filter((asset) => asset.id !== "agent-edit-during-picker"),
    };
    mediaRegistrySchema.parse(agentEdited);
    const agentTemporaryFile = `${mediaFile}.agent-tmp`;
    await writeFile(agentTemporaryFile, `${JSON.stringify(agentEdited, null, 2)}\n`, { flag: "wx" });
    await rename(agentTemporaryFile, mediaFile);
    await expect(page.getByText("Agent change during file selection", { exact: true })).toHaveCount(0);
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets.map((asset: { id: string }) => asset.id)).toEqual([
      registeredMedia.assets[0].id,
    ]);

    const agentValidContents = await readFile(mediaFile, "utf8");
    await writeFile(mediaFile, "{invalid registry", "utf8");
    await expect(page.getByRole("alert")).toContainText(/JSON|property/i);
    expect(await readFile(mediaFile, "utf8")).toBe("{invalid registry");
    const repairedTemporaryFile = `${mediaFile}.repair-tmp`;
    await writeFile(repairedTemporaryFile, agentValidContents, { flag: "wx" });
    await rename(repairedTemporaryFile, mediaFile);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await unlink(audioFixturePath);
    const missingAudio = page.getByRole("listitem").filter({ hasText: "flox-smoke-audio" });
    await expect(missingAudio.getByText("Missing file", { exact: true })).toBeVisible();
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(1);

    let missingRemovalConfirmed = false;
    page.once("dialog", async (dialog) => {
      missingRemovalConfirmed = dialog.message().includes("will NOT be deleted");
      await dialog.accept();
    });
    await missingAudio.getByRole("button", { name: "Remove from Project" }).click();
    await expect(page.getByText("No audio is registered for this project yet.")).toBeVisible();
    expect(missingRemovalConfirmed).toBe(true);
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(0);

    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add subtitle" })).toBeEnabled();
    await expect(page.locator('[data-editor-view="canvas"]')).toHaveCount(1);
    await expect(page.locator('[data-editor-view="timeline"]')).toHaveCount(1);
    await expect(page.locator('[data-editor-view="inspector"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Add subtitle" }).click();
    await expect(page.getByRole("button", { name: /^Clip subtitle-/ })).toBeVisible();
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    const preview = page.frameLocator('[data-panel-id="editor"] iframe');
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("New subtitle");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Human edited caption");

    await page.getByRole("button", { name: "Duplicate clip", exact: true }).click();
    await expect(page.locator(".timeline-clip")).toHaveCount(2);
    const duplicateClipId = await page
      .locator(".timeline-clip.is-selected")
      .getAttribute("data-clip-id");
    expect(duplicateClipId).toBeTruthy();
    await page.getByLabel("Text", { exact: true }).fill("Second selected caption");
    await page.getByLabel("Playhead frame", { exact: true }).fill("120");
    await expect(preview.getByText("Second selected caption", { exact: true })).toBeVisible();
    const originalClip = page
      .locator(".timeline-clip")
      .filter({ hasText: "Human edited caption" })
      .first();
    await originalClip.click();
    await expect(originalClip).toHaveClass(/is-selected/);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Human edited caption");
    await page.getByLabel("Playhead frame", { exact: true }).fill("60");
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    await page.locator(`.timeline-clip[data-clip-id="${duplicateClipId}"]`).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Second selected caption");
    await page.getByRole("button", { name: "Delete clip", exact: true }).click();
    await expect(page.locator(".timeline-clip")).toHaveCount(1);
    await originalClip.click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Human edited caption");

    const detachedClipId = await page.locator(".timeline-clip.is-selected").getAttribute("data-clip-id");
    expect(detachedClipId).toBeTruthy();
    const attachedLayout = await page.locator(".timeline-editor").evaluate((editor) => {
      const root = getComputedStyle(editor);
      return {
        configuredTimelineHeight: Number.parseFloat(
          root.getPropertyValue("--timeline-height"),
        ),
        timelineHeight: editor
          .querySelector(".timeline-location")!
          .getBoundingClientRect().height,
        canvasHeight: editor
          .querySelector(".editor-columns")!
          .getBoundingClientRect().height,
      };
    });
    expect(
      Math.abs(
        attachedLayout.timelineHeight - attachedLayout.configuredTimelineHeight,
      ),
    ).toBeLessThan(2);
    await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const detachedPage = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
    expect(detachedPage).toBeTruthy();
    const detachedLayout = await page
      .locator(".timeline-editor")
      .evaluate((editor) => ({
        detached: editor.classList.contains("timeline-detached"),
        timelineHeight: editor
          .querySelector(".timeline-location")!
          .getBoundingClientRect().height,
        canvasHeight: editor
          .querySelector(".editor-columns")!
          .getBoundingClientRect().height,
      }));
    expect(detachedLayout.detached).toBe(true);
    expect(detachedLayout.timelineHeight).toBeLessThan(80);
    expect(detachedLayout.canvasHeight).toBeGreaterThan(
      attachedLayout.canvasHeight + 100,
    );
    await expect(
      page.getByRole("button", { name: "Attach Timeline", exact: true }),
    ).toBeVisible();
    const detachedClip = detachedPage!.locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`);
    await expect(detachedClip).toBeVisible();
    await expect(page.locator(".timeline-dock")).toHaveCount(0);
    await expect(detachedPage!.locator(".timeline-dock")).toHaveCount(1);
    await expect(page.locator("[data-panel-id='editor'] iframe")).toHaveCount(1);
    await expect(detachedPage!.locator("iframe")).toHaveCount(0);
    await detachedClip.click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Human edited caption");
    await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).fill("60");
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    const frameBeforePlayback = Number(
      await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).inputValue(),
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(
      await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).inputValue(),
    )).not.toBe(frameBeforePlayback);
    const frameDuringPlayback = Number(
      await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).inputValue(),
    );
    await page.waitForTimeout(1200);
    expect(Number(
      await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).inputValue(),
    )).toBeGreaterThan(frameDuringPlayback);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(async () =>
      detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).inputValue(),
    ).toBe(await page.getByLabel("Playhead frame", { exact: true }).inputValue());

    const detachedPlayhead = detachedPage!.getByLabel("Timeline playhead frame", { exact: true });
    for (const frame of [121, 37, 83]) await detachedPlayhead.fill(String(frame));
    await expect(detachedPlayhead).toHaveValue("83");
    await expect(page.getByLabel("Playhead frame", { exact: true })).toHaveValue("83");

    const originalRange = await detachedClip.locator("small").innerText();
    await detachedClip.focus();
    await detachedPage!.keyboard.press("ArrowRight");
    await expect.poll(() => detachedClip.locator("small").innerText()).not.toBe(originalRange);
    const movedRange = await detachedClip.locator("small").innerText();
    await detachedPage!.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(detachedClip.locator("small")).toHaveText(originalRange);
    await detachedPage!.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(detachedClip.locator("small")).toHaveText(movedRange);

    const beforeTrim = await detachedClip.locator("small").innerText();
    const resizeHandle = await detachedClip.locator(".resize-handle.right").boundingBox();
    expect(resizeHandle).toBeTruthy();
    await detachedPage!.mouse.move(resizeHandle!.x + resizeHandle!.width / 2, resizeHandle!.y + resizeHandle!.height / 2);
    await detachedPage!.mouse.down();
    await detachedPage!.mouse.move(resizeHandle!.x + resizeHandle!.width / 2 + 32, resizeHandle!.y + resizeHandle!.height / 2, { steps: 4 });
    await detachedPage!.mouse.up();
    await expect.poll(() => detachedClip.locator("small").innerText()).not.toBe(beforeTrim);
    await detachedPage!.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(detachedClip.locator("small")).toHaveText(movedRange);
    await detachedPage!.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(detachedClip.locator("small")).toHaveText(originalRange);

    await page.getByLabel("Text", { exact: true }).fill("Detached Inspector edit");
    await expect(detachedClip.locator(".clip-title")).toHaveText("Detached Inspector edit");
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    await detachedPage!.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Detached Inspector edit");
    await detachedPage!.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Human edited caption");
    await detachedPage!.getByLabel("Timeline playhead frame", { exact: true }).fill("90");
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    await detachedPage!.getByRole("button", { name: "Add track", exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText("4 tracks");
    await detachedPage!.getByRole("button", { name: "Add subtitle", exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(detachedPage!.locator(".timeline-clip")).toHaveCount(3);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("New subtitle");
    await detachedPage!.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(detachedPage!.locator(".timeline-clip")).toHaveCount(2);
    await detachedPage!.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(detachedPage!.locator(".timeline-clip")).toHaveCount(3);
    const selectedBeforeAttach = await detachedPage!.locator(".timeline-clip.is-selected").getAttribute("data-clip-id");
    expect(selectedBeforeAttach).toBeTruthy();
    const staleResult = await detachedPage!.evaluate(async () => {
      const api = window.floxBowWindows!;
      const context = await api.getContext();
      if (context.role !== "panel") throw new Error("Expected the registered Timeline window");
      const stateVersion = Number(document.querySelector(".detached-timeline-window")?.getAttribute("data-state-version"));
      const commandId = `${context.instanceId}:${context.commandSequence + 1}`;
      const result = new Promise<{ status: string; message: string }>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Stale command was not acknowledged")), 5000);
        const unsubscribe = api.onTimelineCommandResult((value) => {
          if (value.commandId !== commandId) return;
          window.clearTimeout(timeout);
          unsubscribe();
          resolve(value);
        });
      });
      await api.sendTimelineCommand({
        panelId: "timeline",
        projectId: context.projectId,
        sessionId: context.sessionId,
        instanceId: context.instanceId,
        commandId,
        stateVersion: stateVersion + 50,
        command: { type: "seek", frame: 10 },
      });
      return result;
    });
    expect(staleResult.status).toBe("rejected");
    expect(staleResult.message).toContain("changed elsewhere");
    await detachedPage!.getByRole("button", { name: "Attach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);
    const reattachedLayout = await page
      .locator(".timeline-editor")
      .evaluate((editor) => ({
        detached: editor.classList.contains("timeline-detached"),
        configuredTimelineHeight: Number.parseFloat(
          getComputedStyle(editor).getPropertyValue("--timeline-height"),
        ),
        timelineHeight: editor
          .querySelector(".timeline-location")!
          .getBoundingClientRect().height,
      }));
    expect(reattachedLayout.detached).toBe(false);
    expect(reattachedLayout.configuredTimelineHeight).toBe(
      attachedLayout.configuredTimelineHeight,
    );
    expect(
      Math.abs(reattachedLayout.timelineHeight - attachedLayout.timelineHeight),
    ).toBeLessThan(2);
    await expect(page.locator(".timeline-clip.is-selected")).toHaveAttribute("data-clip-id", selectedBeforeAttach!);
    await expect(page.getByLabel("Playhead frame", { exact: true })).toHaveValue("90");
    const originalPrimaryClip = page.locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`);
    await originalPrimaryClip.focus();
    await page.keyboard.press("Enter");

    let markSaveStarted!: () => void;
    let markResponseFulfilled!: () => void;
    let releaseSaveResponse!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const responseFulfilled = new Promise<void>((resolve) => {
      markResponseFulfilled = resolve;
    });
    const responseGate = new Promise<void>((resolve) => {
      releaseSaveResponse = resolve;
    });
    await page.route(`**/api/edit/${id}`, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      markSaveStarted();
      await responseGate;
      await route.fulfill({ response });
      markResponseFulfilled();
    });
    try {
      await page
        .getByRole("button", { name: "Save project", exact: true })
        .click();
      await saveStarted;
      await page
        .getByLabel("Text", { exact: true })
        .fill("Newer concurrent draft");
    } finally {
      releaseSaveResponse();
    }
    await responseFulfilled;
    await page.unroute(`**/api/edit/${id}`);
    await expect(
      page.getByText("Saved earlier edits. Newer changes are still unsaved.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Newer concurrent draft",
    );
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeEnabled();
    expect(
      JSON.parse(
        await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
      ).clips[0].content.text,
    ).toBe("Human edited caption");
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"));
    expect(saved.clips).toHaveLength(3);
    expect(saved.clips[0].content.text).toBe("Newer concurrent draft");
    expect(saved.clips.filter((clip: { componentId: string }) => clip.componentId === "subtitles")).toHaveLength(3);
    expect(saved.tracks.map((track: { name: string }) => track.name)).toEqual(["Visuals", "Captions", "Track 3", "Track 4"]);
    renderedStill = await renderProject(root, id, true);
    expect((await stat(renderedStill)).size).toBeGreaterThan(1024);

    // Scenario B: an external process updates the saved timeline while the editor is clean.
    const editPath = path.join(projectPath, "edit-timeline.json");
    const externalUpdate = structuredClone(saved);
    externalUpdate.clips[0].content.text = "Updated by external agent";
    await writeFile(editPath, `${JSON.stringify(externalUpdate, null, 2)}\n`);
    await expect(preview.getByText("Updated by external agent", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Updated by external agent");

    // Scenario C: preserve both versions when external edits arrive during an unsaved UI draft.
    await page.getByLabel("Text", { exact: true }).fill("Unsaved human draft");
    const concurrentExternal = structuredClone(externalUpdate);
    concurrentExternal.clips[0].content.text = "External version to protect";
    await writeFile(editPath, `${JSON.stringify(concurrentExternal, null, 2)}\n`);
    await expect(page.locator(".timeline-editor .error")).toContainText("project changed on disk while you were editing");
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Unsaved human draft");
    await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeDisabled();
    expect(JSON.parse(await readFile(editPath, "utf8")).clips[0].content.text).toBe("External version to protect");

    await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const conflictTimeline = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
    expect(conflictTimeline).toBeTruthy();
    await expect(conflictTimeline!.locator(".detached-timeline-toolbar")).toContainText("Unsaved edits in main editor");
    await expect(conflictTimeline!.locator(".detached-timeline-toolbar")).toContainText("Revision conflict");
    await conflictTimeline!.getByRole("button", { name: "Attach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);

    await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("External version to protect");
    await expect(preview.getByText("External version to protect", { exact: true })).toBeVisible();

    // Hiding and switching panels keeps one editor mounted with its draft, selection and transport state.
    const activeClip = page.locator(".timeline-clip.is-selected");
    const activeClipId = await activeClip.getAttribute("data-clip-id");
    expect(activeClipId).toBeTruthy();
    const editorSessionId = await page.locator(".timeline-editor").getAttribute("data-editor-session-id");
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(1);
    await page.getByLabel("Text", { exact: true }).fill("Draft survives panel changes");
    await page.getByLabel("Playhead frame", { exact: true }).fill("42");
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project media" })).toBeVisible();
    await expect(page.locator('[data-panel-id="editor"]')).toBeHidden();
    await expect(page.locator('[data-panel-id="editor"] .transport button').nth(1)).toHaveText("Play");
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Draft survives panel changes");
    await expect(page.getByLabel("Playhead frame", { exact: true })).toHaveValue("42");
    await expect(page.locator(`.timeline-clip[data-clip-id="${activeClipId}"]`)).toHaveClass(/is-selected/);
    await expect(page.locator('[data-panel-id="editor"] .timeline-editor')).toHaveCount(1);
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(1);
    await expect(page.locator(".timeline-editor")).toHaveAttribute("data-editor-session-id", editorSessionId!);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hide Editor panel" }).click();
    await expect(page.getByRole("region", { name: "Project media" })).toBeVisible();
    await expect(page.locator('[data-panel-id="editor"] .transport button').nth(1)).toHaveText("Play");
    await page.locator(".workspace-view-menu summary").click();
    await page.getByRole("button", { name: "Show Editor", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Draft survives panel changes");
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(page.locator('[data-panel-id="editor"] .timeline-editor')).toHaveCount(1);
    await expect(page.locator(".timeline-editor")).toHaveAttribute("data-editor-session-id", editorSessionId!);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("External version to protect");

    // Three independent project IDs can be created and switched without sharing editor state.
    const secondId = `${id}-two`;
    const thirdId = `${id}-three`;
    async function selectProject(projectId: string) {
      const buttons = page!.locator(".project");
      await expect(buttons).toHaveCount(3);
      const button = page!.locator(`.project[data-project-id="${projectId}"]`);
      await expect(button).toHaveCount(1);
      await button.click();
      await expect(button).toHaveClass(/active/);
    }
    for (const [projectId, caption] of [
      [secondId, "Caption belongs to project two"],
      [thirdId, "Caption belongs to project three"],
    ]) {
      createdIds.push(projectId);
      await page.getByRole("button", { name: "+ Create", exact: true }).click();
      const nameField = page.getByLabel("Project name");
      await expect(nameField).toBeVisible();
      await nameField.fill(projectId);
      await expect(nameField).toHaveValue(projectId);
      await page.getByRole("button", { name: "Create project", exact: true }).click();
      const projectButton = page.locator(`.project[data-project-id="${projectId}"]`);
      await expect(projectButton).toBeVisible();
      await expect(projectButton).toHaveClass(/active/);
      await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add subtitle" })).toBeEnabled({ timeout: 15_000 });
      await page.getByRole("button", { name: "Add subtitle" }).click();
      await page.getByLabel("Text", { exact: true }).fill(caption);
      await page.getByRole("button", { name: "Save project", exact: true }).click();
      await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
      const savedProject = JSON.parse(await readFile(path.join(projectsDir, projectId, "edit-timeline.json"), "utf8"));
      expect(savedProject.clips[0].content.text).toBe(caption);
    }
    await selectProject(id);
    await expect(page.frameLocator('[data-panel-id="editor"] iframe').getByText("External version to protect", { exact: true })).toBeVisible();
    await selectProject(secondId);
    await expect(page.frameLocator('[data-panel-id="editor"] iframe').getByText("Caption belongs to project two", { exact: true })).toBeVisible();
    await selectProject(thirdId);
    await expect(page.locator(".timeline-clip").filter({ hasText: "Caption belongs to project three" })).toBeVisible();
    await expect(page.frameLocator('[data-panel-id="editor"] iframe').getByText("Caption belongs to project three", { exact: true })).toBeVisible();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
      await expect.poll(async () => (await app!.windows()).length).toBe(2);
      const cycleWindow = (await app.windows()).find((candidate) => candidate.url().includes("#studio-panel=timeline"));
      expect(cycleWindow).toBeTruthy();
      await expect(cycleWindow!.locator(".timeline-dock")).toHaveCount(1);
      if (cycle % 2 === 0) await cycleWindow!.close();
      else await cycleWindow!.getByRole("button", { name: "Attach Timeline", exact: true }).click();
      await expect.poll(async () => (await app!.windows()).length).toBe(1);
      await expect(page.locator(".timeline-dock")).toHaveCount(1);
      const recoveredLayout = await page
        .locator(".timeline-editor")
        .evaluate((editor) => ({
          detached: editor.classList.contains("timeline-detached"),
          timelineHeight: editor
            .querySelector(".timeline-location")!
            .getBoundingClientRect().height,
          configuredTimelineHeight: Number.parseFloat(
            getComputedStyle(editor).getPropertyValue("--timeline-height"),
          ),
        }));
      expect(recoveredLayout.detached).toBe(false);
      expect(
        Math.abs(
          recoveredLayout.timelineHeight - recoveredLayout.configuredTimelineHeight,
        ),
      ).toBeLessThan(2);
    }
    await page.getByRole("button", { name: "Detach Timeline", exact: true }).click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    await selectProject(id);
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Detach Timeline", exact: true })).toBeVisible();
    console.log("PASS development: detached Timeline commands, preview sync, attach/close recovery, single preview, conflict protection and project-session invalidation.");
  }
} catch (error) {
  if (app) {
    const page = await app.firstWindow().catch(() => undefined);
    if (page) console.error("UI:", await page.locator("body").innerText().catch(() => "unavailable"));
  }
  throw error;
} finally {
  await app?.close().catch(() => undefined);
  await servers.close();
  await rm(audioFixtureDirectory, { recursive: true, force: true });
  if (renderedStill) await rm(renderedStill, { force: true });
  if (!built)
    await Promise.all(createdIds.map((projectId) => rm(path.join(projectsDir, projectId), { recursive: true, force: true })));
}
