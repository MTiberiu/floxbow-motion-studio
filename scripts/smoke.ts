import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";
import { renderProject } from "../packages/renderer/src/render";

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

  if (built) {
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create Project" })).toBeDisabled();
    console.log("PASS built: empty starter, capability metadata, real preview and docs.");
  } else {
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByLabel("Project name").fill(id);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();

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

    await unlink(audioFixturePath);
    const missingAudio = page.getByRole("listitem").filter({ hasText: "flox-smoke-audio" });
    await expect(missingAudio.getByText("Missing file", { exact: true })).toBeVisible();
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(3);

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add subtitle" })).toBeEnabled();
    await page.getByRole("button", { name: "Add subtitle" }).click();
    await expect(page.getByRole("button", { name: /^Clip subtitle-/ })).toBeVisible();
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    const preview = page.frameLocator("iframe");
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"));
    expect(saved.clips).toHaveLength(1);
    expect(saved.clips[0].content.text).toBe("Human edited caption");
    expect(saved.tracks.map((track: { name: string }) => track.name)).toEqual(["Visuals", "Captions"]);
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

    await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("External version to protect");
    await expect(preview.getByText("External version to protect", { exact: true })).toBeVisible();

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
      await page.getByRole("button", { name: "Add subtitle" }).click();
      await page.getByLabel("Text", { exact: true }).fill(caption);
      await page.getByRole("button", { name: "Save project", exact: true }).click();
      await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
      const savedProject = JSON.parse(await readFile(path.join(projectsDir, projectId, "edit-timeline.json"), "utf8"));
      expect(savedProject.clips[0].content.text).toBe(caption);
    }
    await selectProject(id);
    await expect(page.frameLocator("iframe").getByText("External version to protect", { exact: true })).toBeVisible();
    await selectProject(secondId);
    await expect(page.frameLocator("iframe").getByText("Caption belongs to project two", { exact: true })).toBeVisible();
    await selectProject(thirdId);
    await expect(page.frameLocator("iframe").getByText("Caption belongs to project three", { exact: true })).toBeVisible();
    console.log("PASS development: clean starter, Explorer, three isolated projects, project switching, human save, external reload and conflict protection.");
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
