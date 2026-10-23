import {
  _electron as electron,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";
import { renderProject } from "../packages/renderer/src/render";
import { mediaRegistrySchema } from "@motion/project-loader/media";
const execFileAsync = promisify(execFile);

async function findSmokePortOffset() {
  const isPortAvailable = (port: number) =>
    new Promise<boolean>((resolve) => {
      const server = createNetServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
  for (let offset = 10; offset < 10_000; offset += 1) {
    const ports = [5173, 5174, 24680, 24681].map((port) => port + offset);
    let available = true;
    for (const port of ports) {
      if (!(await isPortAvailable(port))) {
        available = false;
        break;
      }
    }
    if (available) return offset;
  }
  throw new Error(
    "Could not find a free port range for the Electron smoke test.",
  );
}

async function setFrameFromUiTime(page: Page, label: string, frame: number) {
  const input = page.getByLabel(label, { exact: true });
  const fps = Number(await input.getAttribute("data-fps"));
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error(`The ${label} input does not expose its project FPS.`);
  await input.fill((frame / fps).toFixed(3));
}

async function readFrameFromUiTime(page: Page, label: string) {
  const input = page.getByLabel(label, { exact: true });
  const fps = Number(await input.getAttribute("data-fps"));
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error(`The ${label} input does not expose its project FPS.`);
  return Math.round(Number(await input.inputValue()) * fps);
}

async function setClipRangeTime(page: Page, label: string, frame: number) {
  await setFrameFromUiTime(page, label, frame);
}

async function readClipRangeTime(page: Page, label: string) {
  return readFrameFromUiTime(page, label);
}

async function readClipFrameRange(clip: Locator) {
  return clip.evaluate(
    (element) =>
      [
        Number(element.getAttribute("data-from-frame")),
        Number(element.getAttribute("data-end-frame")),
      ] as const,
  );
}

async function verifyTimelineZoom(page: Page) {
  const zoom = page.getByLabel("Timeline zoom", { exact: true });
  const scroll = page.locator(".timeline-scroll");
  await zoom.selectOption("1");
  const buttonAnchorX = await page.locator(".time-ruler").evaluate((ruler) => {
    const rect = ruler.getBoundingClientRect();
    const viewport = ruler.closest(".timeline-scroll")!.getBoundingClientRect();
    return Math.max(
      Math.max(rect.left, viewport.left),
      Math.min(
        Math.min(rect.right, viewport.right),
        viewport.left + viewport.width / 2,
      ),
    );
  });
  const frameAtAnchor = (x: number) =>
    page.locator(".time-ruler").evaluate((ruler, x) => {
      const rect = ruler.getBoundingClientRect();
      const duration = Number(ruler.getAttribute("aria-valuemax")) + 1;
      return ((x - rect.left) / rect.width) * duration;
    }, x);
  const beforeButtonZoom = await frameAtAnchor(buttonAnchorX);
  await page.getByRole("button", { name: "Zoom Timeline in" }).click();
  await expect(zoom).toHaveValue("1.25");
  const afterButtonZoom = await frameAtAnchor(buttonAnchorX);
  expect(
    Math.abs(afterButtonZoom - beforeButtonZoom),
    `button zoom anchor ${beforeButtonZoom} -> ${afterButtonZoom}`,
  ).toBeLessThan(1);
  await expect
    .poll(() =>
      scroll.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);

  const wheelAnchorX = await page.locator(".time-ruler").evaluate((ruler) => {
    const rect = ruler.getBoundingClientRect();
    return rect.left + Math.min(rect.width * 0.68, rect.right - rect.left - 8);
  });
  const beforeWheelZoom = await frameAtAnchor(wheelAnchorX);
  await scroll.evaluate((element, x) => {
    element.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -100,
        ctrlKey: true,
        clientX: x,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, wheelAnchorX);
  await expect(zoom).toHaveValue("1.5");
  const afterWheelZoom = await frameAtAnchor(wheelAnchorX);
  expect(
    Math.abs(afterWheelZoom - beforeWheelZoom),
    `wheel zoom anchor ${beforeWheelZoom} -> ${afterWheelZoom}`,
  ).toBeLessThan(1);
  await zoom.selectOption("1");
}

const built = process.argv.includes("--built");
const id = `golden-starter-${Date.now()}`;
const createdIds = [id];
const projectPath = path.join(projectsDir, id);
let renderedStill: string | undefined;
let renderedVideo: string | undefined;
let standaloneTextVideo: string | undefined;
const audioFixtureDirectory = await mkdtemp(
  path.join(os.tmpdir(), "flox-media-smoke-"),
);
const audioFixturePath = path.join(
  audioFixtureDirectory,
  "flox-smoke-audio.wav",
);
const imageFixturePath = path.join(audioFixtureDirectory, "flox-smoke.png");
function sineWaveWav(seconds: number) {
  const sampleRate = 8_000;
  const samples = sampleRate * seconds;
  const output = Buffer.alloc(44 + samples * 2);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVEfmt ", 8, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1)
    output.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 12_000),
      44 + index * 2,
    );
  return output;
}
function solidPng(red: number, green: number, blue: number, size = 16) {
  const crc32 = (bytes: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name, "ascii");
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = red;
    row[2 + x * 3] = green;
    row[3 + x * 3] = blue;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      deflateSync(Buffer.concat(Array.from({ length: size }, () => row))),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const audioFixture = sineWaveWav(8);
await writeFile(audioFixturePath, audioFixture);
await writeFile(imageFixturePath, solidPng(255, 96, 12));
let pickerCalls = 0;
let whisperHostAudioPath = "";
let markSecondPickerStarted!: () => void;
let releaseSecondPicker!: (selectedPath: string | undefined) => void;
const secondPickerStarted = new Promise<void>((resolve) => {
  markSecondPickerStarted = resolve;
});
async function pickAudioFixture() {
  pickerCalls += 1;
  if (pickerCalls === 2) {
    markSecondPickerStarted();
    return new Promise<string | undefined>((resolve) => {
      releaseSecondPicker = resolve;
    });
  }
  return audioFixturePath;
}
const servers = await startServers(built, await findSmokePortOffset(), {
  transcribeAudio: async (audioPath) => {
    whisperHostAudioPath = audioPath;
    return {
      text: "Human edited caption Generated lyric",
      segments: [
        { start: 0, end: 5, text: "Human edited caption" },
        { start: 5, end: 6, text: "Generated lyric" },
      ],
    };
  },
  audioFilePicker: pickAudioFixture,
  mediaFilePicker: async (type) => {
    if (type === "image") return imageFixturePath;
    return pickAudioFixture();
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
  page.on("pageerror", (error) =>
    console.error("Electron renderer error:", error),
  );
  await page.evaluate(() => {
    localStorage.removeItem("motion-project");
    localStorage.removeItem("motion-preview-playback-end");
    for (const key of Object.keys(localStorage))
      if (key.startsWith("motion-draft-v1:")) localStorage.removeItem(key);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("A CLEAN WORKSPACE")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Create your first video project")).toBeVisible();

  await page.getByRole("button", { name: "Explore capabilities" }).click();
  await expect(
    page.getByRole("region", { name: "Capabilities explorer" }),
  ).toBeVisible();
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
    "closePanel",
    "getContext",
    "onPanelClosed",
    "onTimelineCommand",
    "onTimelineCommandResult",
    "onTimelineFrame",
    "onTimelineSnapshot",
    "onTimelineSnapshotRequest",
    "openPanel",
    "publishTimelineFrame",
    "publishTimelineSnapshot",
    "requestTimelineSnapshot",
    "sendTimelineCommand",
    "sendTimelineCommandResult",
  ]);
  expect(panelApi.result.status).toBe("opened");
  expect(panelApi.nodeDisabled).toBe(true);
  await expect.poll(async () => (await app!.windows()).length).toBe(2);
  let panelPage = (await app.windows()).find((candidate) =>
    candidate.url().includes("#studio-panel=timeline"),
  );
  expect(panelPage).toBeTruthy();
  await expect(
    panelPage!.getByRole("heading", { name: "Connecting Timeline…" }),
  ).toBeVisible();
  await expect(panelPage!.locator("iframe")).toHaveCount(0);
  await expect(panelPage!.locator(".timeline-editor")).toHaveCount(0);
  const panelContext = await panelPage!.evaluate(() =>
    window.floxBowWindows!.getContext(),
  );
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
      await window.floxBowWindows!.openPanel({
        panelId: "file",
        path: "C:/private",
      } as never);
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
  panelPage = (await app.windows()).find((candidate) =>
    candidate.url().includes("#studio-panel=timeline"),
  );
  expect(panelPage).toBeTruthy();
  await expect(
    panelPage!.getByRole("heading", { name: "Connecting Timeline…" }),
  ).toBeVisible();
  await expect(panelPage!.locator("iframe")).toHaveCount(0);
  await expect(panelPage!.getByText(/snapshot did not arrive/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    panelPage!.getByRole("button", { name: "Retry sync", exact: true }),
  ).toBeEnabled();
  await expect(
    panelPage!.getByRole("button", { name: "Attach Timeline", exact: true }),
  ).toBeEnabled();
  const panelClosed = page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Panel close notification timed out")),
          10_000,
        );
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
    await expect(
      page.getByRole("button", { name: "Create Project" }),
    ).toBeDisabled();
    console.log(
      "PASS built: empty starter, capability metadata, real preview and docs.",
    );
  } else {
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByLabel("Project name").fill(id);
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Composition" }),
    ).toBeVisible();

    const authoritativeSessionId = await page
      .locator(".timeline-editor")
      .getAttribute("data-editor-session-id");
    expect(authoritativeSessionId).toBeTruthy();
    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const editorPanelPage = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
    expect(editorPanelPage).toBeTruthy();
    await expect(page.locator(".timeline-editor")).toHaveCount(1);
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(
      1,
    );
    await expect(editorPanelPage!.locator(".timeline-editor")).toHaveCount(0);
    await expect(editorPanelPage!.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".timeline-detached-placeholder")).toBeVisible();
    await expect(page.locator(".timeline-dock")).toHaveCount(0);
    await expect(editorPanelPage!.locator(".timeline-dock")).toHaveCount(1);
    await expect(
      editorPanelPage!.locator(".detached-timeline-window"),
    ).toHaveAttribute("data-editor-session-id", authoritativeSessionId!);
    await editorPanelPage!
      .getByRole("button", { name: "Attach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);

    // Native close is another attach path and must restore the main editor view.
    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const closePanelPage = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
    expect(closePanelPage).toBeTruthy();
    await closePanelPage!.close();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);

    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Project media" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Audio" })).toBeEnabled();
    await page.getByRole("button", { name: "Add Audio" }).click();
    await expect(
      page.getByText("flox-smoke-audio", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    const mediaFile = path.join(projectPath, "media.json");
    const registeredMedia = JSON.parse(await readFile(mediaFile, "utf8"));
    expect(registeredMedia.assets).toHaveLength(1);
    expect(registeredMedia.assets[0].source.path).toBe(audioFixturePath);
    expect((await stat(audioFixturePath)).size).toBe(audioFixture.length);

    await page
      .getByRole("button", { name: "Use as soundtrack", exact: true })
      .click();
    const dockedSoundtrack = page.locator(".timeline-clip.audio-clip");
    await expect(dockedSoundtrack).toBeVisible();
    await expect(dockedSoundtrack).toHaveAttribute("data-range-locked", "true");
    await expect(dockedSoundtrack).toHaveAttribute("title", /timing is fixed/);
    await expect(dockedSoundtrack.locator(".resize-handle")).toHaveCount(0);
    const dockedAudioRange = await dockedSoundtrack
      .locator("small")
      .innerText();
    await dockedSoundtrack.focus();
    await page.keyboard.press("ArrowRight");
    await expect(dockedSoundtrack.locator("small")).toHaveText(
      dockedAudioRange,
    );
    const dockedAudioBox = await dockedSoundtrack.boundingBox();
    expect(dockedAudioBox).toBeTruthy();
    await page.mouse.move(
      dockedAudioBox!.x + dockedAudioBox!.width / 2,
      dockedAudioBox!.y + dockedAudioBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dockedAudioBox!.x + dockedAudioBox!.width / 2 + 40,
      dockedAudioBox!.y + dockedAudioBox!.height / 2,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect(dockedSoundtrack.locator("small")).toHaveText(
      dockedAudioRange,
    );
    await expect(
      page.getByText(/Soundtrack added to the Audio track/),
    ).toBeVisible();
    const selectedTimeline = JSON.parse(
      await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
    );
    expect(selectedTimeline.clips).toHaveLength(0); // selection remains an unsaved EditorSession draft
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const audioProject = JSON.parse(
      await readFile(path.join(projectPath, "project.json"), "utf8"),
    );
    const audioTimeline = JSON.parse(
      await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
    );
    expect(audioProject.durationInFrames).toBe(240);
    expect(audioTimeline.durationInFrames).toBe(240);
    expect(
      audioTimeline.tracks.map((track: { name: string }) => track.name),
    ).toContain("Audio");
    expect(
      audioTimeline.clips.find(
        (clip: { componentId: string }) => clip.componentId === "soundtrack",
      ),
    ).toMatchObject({
      from: 0,
      durationInFrames: 240,
      content: { assetId: registeredMedia.assets[0].id },
    });
    const soundtrackPreview = page.frameLocator(
      '[data-panel-id="editor"] iframe',
    );
    await expect
      .poll(async () => {
        try {
          return await soundtrackPreview.locator("body").innerText();
        } catch {
          return "";
        }
      })
      .not.toBe("");
    const audioElement = soundtrackPreview
      .locator('audio[src*="/api/media/"]')
      .first();
    await expect
      .poll(() =>
        soundtrackPreview.locator('audio[src*="/api/media/"]').count(),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        () =>
          audioElement.evaluate(
            (element: HTMLAudioElement) =>
              !element.paused && element.readyState >= 2,
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => element.paused),
      )
      .toBe(true);
    await setFrameFromUiTime(page, "Playhead time (seconds)", 150);
    await expect
      .poll(() =>
        audioElement.evaluate(
          (element: HTMLAudioElement) => element.currentTime,
        ),
      )
      .toBeGreaterThan(4.9);
    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const audioTimelineWindow = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
    expect(audioTimelineWindow).toBeTruthy();
    const detachedSoundtrack = audioTimelineWindow!.locator(
      ".timeline-clip.audio-clip",
    );
    await expect(detachedSoundtrack).toBeVisible();
    await expect(detachedSoundtrack).toHaveAttribute(
      "data-range-locked",
      "true",
    );
    await expect(detachedSoundtrack.locator(".resize-handle")).toHaveCount(0);
    const detachedAudioRange = await detachedSoundtrack
      .locator("small")
      .innerText();
    await detachedSoundtrack.focus();
    await audioTimelineWindow!.keyboard.press("ArrowLeft");
    await expect(detachedSoundtrack.locator("small")).toHaveText(
      detachedAudioRange,
    );
    const detachedAudioBox = await detachedSoundtrack.boundingBox();
    expect(detachedAudioBox).toBeTruthy();
    await audioTimelineWindow!.mouse.move(
      detachedAudioBox!.x + detachedAudioBox!.width / 2,
      detachedAudioBox!.y + detachedAudioBox!.height / 2,
    );
    await audioTimelineWindow!.mouse.down();
    await audioTimelineWindow!.mouse.move(
      detachedAudioBox!.x + detachedAudioBox!.width / 2 - 40,
      detachedAudioBox!.y + detachedAudioBox!.height / 2,
      { steps: 3 },
    );
    await audioTimelineWindow!.mouse.up();
    await expect(detachedSoundtrack.locator("small")).toHaveText(
      detachedAudioRange,
    );
    await audioTimelineWindow!
      .getByRole("button", { name: "Play Timeline playback", exact: true })
      .click();
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => !element.paused),
      )
      .toBe(true);
    await setFrameFromUiTime(
      audioTimelineWindow!,
      "Timeline playhead time (seconds)",
      90,
    );
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => !element.paused),
      )
      .toBe(true);
    await audioTimelineWindow!
      .getByRole("button", { name: "Pause Timeline playback", exact: true })
      .click();
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => element.paused),
      )
      .toBe(true);
    await setFrameFromUiTime(
      audioTimelineWindow!,
      "Timeline playhead time (seconds)",
      165,
    );
    await expect
      .poll(() =>
        audioElement.evaluate(
          (element: HTMLAudioElement) => element.currentTime,
        ),
      )
      .toBeGreaterThan(5.4);
    await audioTimelineWindow!
      .getByRole("button", { name: "Play Timeline playback", exact: true })
      .click();
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => !element.paused),
      )
      .toBe(true);
    await audioTimelineWindow!
      .getByRole("button", { name: "Pause Timeline playback", exact: true })
      .click();
    await expect
      .poll(() =>
        audioElement.evaluate((element: HTMLAudioElement) => element.paused),
      )
      .toBe(true);
    const lockedBeginResult = await audioTimelineWindow!.evaluate(
      async (clipId) => {
        const api = window.floxBowWindows!;
        const context = await api.getContext();
        if (context.role !== "panel")
          throw new Error("Expected the registered Timeline window");
        if (!clipId) throw new Error("Expected the soundtrack clip ID");
        const stateVersion = Number(
          document
            .querySelector(".detached-timeline-window")
            ?.getAttribute("data-state-version"),
        );
        const commandId = `${context.instanceId}:${context.commandSequence + 1}`;
        const result = new Promise<{ status: string; message: string }>(
          (resolve, reject) => {
            const timeout = window.setTimeout(
              () =>
                reject(
                  new Error("Locked soundtrack command was not acknowledged"),
                ),
              5000,
            );
            const unsubscribe = api.onTimelineCommandResult((value) => {
              if (value.commandId !== commandId) return;
              window.clearTimeout(timeout);
              unsubscribe();
              resolve(value);
            });
          },
        );
        await api.sendTimelineCommand({
          panelId: "timeline",
          projectId: context.projectId,
          sessionId: context.sessionId,
          instanceId: context.instanceId,
          commandId,
          stateVersion,
          command: {
            type: "beginClipGesture",
            gestureId: crypto.randomUUID(),
            clipId,
          },
        });
        return result;
      },
      await detachedSoundtrack.getAttribute("data-clip-id"),
    );
    expect(lockedBeginResult.status).toBe("rejected");
    expect(lockedBeginResult.message).toContain("cannot be moved or trimmed");
    const changedAudioTimeline = structuredClone(audioTimeline);
    const soundtrackForMutation = changedAudioTimeline.clips.find(
      (clip: { componentId: string }) => clip.componentId === "soundtrack",
    );
    soundtrackForMutation.from = 1;
    soundtrackForMutation.durationInFrames -= 1;
    const lockedEditResult = await audioTimelineWindow!.evaluate(
      async (documentToEdit) => {
        const api = window.floxBowWindows!;
        const context = await api.getContext();
        if (context.role !== "panel")
          throw new Error("Expected the registered Timeline window");
        const stateVersion = Number(
          document
            .querySelector(".detached-timeline-window")
            ?.getAttribute("data-state-version"),
        );
        const commandId = `${context.instanceId}:${context.commandSequence + 1}`;
        const result = new Promise<{ status: string; message: string }>(
          (resolve, reject) => {
            const timeout = window.setTimeout(
              () =>
                reject(
                  new Error("Locked soundtrack edit was not acknowledged"),
                ),
              5000,
            );
            const unsubscribe = api.onTimelineCommandResult((value) => {
              if (value.commandId !== commandId) return;
              window.clearTimeout(timeout);
              unsubscribe();
              resolve(value);
            });
          },
        );
        await api.sendTimelineCommand({
          panelId: "timeline",
          projectId: context.projectId,
          sessionId: context.sessionId,
          instanceId: context.instanceId,
          commandId,
          stateVersion,
          command: {
            type: "editTimeline",
            document: documentToEdit,
            checkpoint: true,
          },
        });
        return result;
      },
      changedAudioTimeline,
    );
    expect(lockedEditResult.status).toBe("rejected");
    expect(lockedEditResult.message).toContain("Soundtrack timing is fixed");
    await expect(detachedSoundtrack.locator("small")).toHaveText(
      "0:00.000–0:08.000",
    );
    await audioTimelineWindow!
      .getByRole("button", { name: "Attach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    const audioStreamUrl = new URL(
      `/api/media/${id}/assets/${registeredMedia.assets[0].id}/stream`,
      servers.previewOrigin,
    );
    const audioRange = await fetch(audioStreamUrl, {
      headers: { Range: "bytes=0-63" },
    });
    expect(audioRange.status).toBe(206);
    expect(audioRange.headers.get("content-type")).toBe("audio/wav");
    expect((await audioRange.arrayBuffer()).byteLength).toBe(64);

    const mediaUrl = new URL(`/api/media/${id}`, servers.url).toString();
    const publicState = await fetch(mediaUrl).then((response) =>
      response.text(),
    );
    const mediaSnapshot = JSON.parse(publicState);
    expect(publicState.includes(audioFixturePath)).toBe(false);
    const rejectedOrigin = await fetch(mediaUrl, {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ revision: mediaSnapshot.revision }),
    });
    expect(rejectedOrigin.status).toBe(403);
    const rejectedPath = await fetch(mediaUrl, {
      method: "POST",
      headers: {
        Origin: new URL(servers.url).origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        revision: mediaSnapshot.revision,
        path: "C:\\private\\not-selected.wav",
      }),
    });
    expect(rejectedPath.status).toBe(400);
    expect(pickerCalls).toBe(1);

    await page.reload();
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(
      page.getByText("flox-smoke-audio", { exact: true }),
    ).toBeVisible();
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
    await writeFile(
      mediaFile,
      `${JSON.stringify(externalRegistry, null, 2)}\n`,
    );
    await expect(
      page.getByText("Added by external agent", { exact: true }),
    ).toBeVisible();

    const removeUrl = new URL(
      `/api/media/${id}/assets/external-agent-audio`,
      servers.url,
    ).toString();
    const currentMedia = await fetch(mediaUrl).then((response) =>
      response.json(),
    );
    const rejectedRemoveOrigin = await fetch(removeUrl, {
      method: "DELETE",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ revision: currentMedia.revision }),
    });
    expect(rejectedRemoveOrigin.status).toBe(403);
    const rejectedRemovePayload = await fetch(removeUrl, {
      method: "DELETE",
      headers: {
        Origin: new URL(servers.url).origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        revision: currentMedia.revision,
        path: "C:\\private\\do-not-delete.wav",
      }),
    });
    expect(rejectedRemovePayload.status).toBe(400);
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(
      2,
    );

    await page.getByRole("button", { name: "Add Audio" }).click();
    await Promise.race([
      secondPickerStarted,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Audio picker did not open")),
          10_000,
        ),
      ),
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
    await writeFile(
      mediaFile,
      `${JSON.stringify(concurrentRegistry, null, 2)}\n`,
    );
    releaseSecondPicker(audioFixturePath);
    await expect(page.getByRole("alert")).toContainText(
      "CONFLICT: The media registry changed",
    );
    await expect(
      page.getByText("Agent change during file selection", { exact: true }),
    ).toBeVisible();
    expect(JSON.parse(await readFile(mediaFile, "utf8")).assets).toHaveLength(
      3,
    );

    let confirmationText = "";
    const uiRemovedAsset = page
      .getByRole("listitem")
      .filter({ hasText: "Added by external agent" });
    page.once("dialog", async (dialog) => {
      confirmationText = dialog.message();
      await dialog.accept();
    });
    await uiRemovedAsset
      .getByRole("button", { name: "Remove from Project" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "The original file was not deleted",
    );
    expect(confirmationText).toContain("The original file will NOT be deleted");
    const afterUiRemoval = mediaRegistrySchema.parse(
      JSON.parse(await readFile(mediaFile, "utf8")),
    );
    expect(afterUiRemoval.assets.map((asset) => asset.id)).toEqual([
      registeredMedia.assets[0].id,
      "agent-edit-during-picker",
    ]);
    expect((await stat(audioFixturePath)).size).toBe(audioFixture.length);

    // Simulate an external coding agent removing the requested stable ID from the canonical file.
    const beforeAgentRemoval = mediaRegistrySchema.parse(
      JSON.parse(await readFile(mediaFile, "utf8")),
    );
    const agentEdited = {
      ...beforeAgentRemoval,
      assets: beforeAgentRemoval.assets.filter(
        (asset) => asset.id !== "agent-edit-during-picker",
      ),
    };
    mediaRegistrySchema.parse(agentEdited);
    const agentTemporaryFile = `${mediaFile}.agent-tmp`;
    await writeFile(
      agentTemporaryFile,
      `${JSON.stringify(agentEdited, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(agentTemporaryFile, mediaFile);
    await expect(
      page.getByText("Agent change during file selection", { exact: true }),
    ).toHaveCount(0);
    expect(
      JSON.parse(await readFile(mediaFile, "utf8")).assets.map(
        (asset: { id: string }) => asset.id,
      ),
    ).toEqual([registeredMedia.assets[0].id]);

    const agentValidContents = await readFile(mediaFile, "utf8");
    await writeFile(mediaFile, "{invalid registry", "utf8");
    await expect(page.getByRole("alert")).toContainText(/JSON|property/i);
    expect(await readFile(mediaFile, "utf8")).toBe("{invalid registry");
    const repairedTemporaryFile = `${mediaFile}.repair-tmp`;
    await writeFile(repairedTemporaryFile, agentValidContents, { flag: "wx" });
    await rename(repairedTemporaryFile, mediaFile);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Add subtitle" }),
    ).toBeEnabled();
    await expect(page.locator('[data-editor-view="canvas"]')).toHaveCount(1);
    await expect(page.locator('[data-editor-view="timeline"]')).toHaveCount(1);
    await expect(page.locator('[data-editor-view="inspector"]')).toHaveCount(1);
    await expect(page.getByLabel("Playback ends", { exact: true })).toHaveValue(
      "content",
    );
    await page
      .getByLabel("Playback ends", { exact: true })
      .selectOption("project");
    await expect(page.getByLabel("Playback ends", { exact: true })).toHaveValue(
      "project",
    );
    await page
      .getByLabel("Playback ends", { exact: true })
      .selectOption("content");
    await expect(page.locator(".timeline-review summary")).toBeVisible();
    await verifyTimelineZoom(page);
    await page.getByRole("button", { name: "Add subtitle" }).click();
    await expect(
      page.getByRole("button", { name: /^Clip subtitle-/ }),
    ).toBeVisible();
    const initialClipStart = await page
      .getByLabel("Clip start time (seconds)", { exact: true })
      .inputValue();
    const initialClipEnd = await page
      .getByLabel("Clip end time (seconds)", { exact: true })
      .inputValue();
    await setClipRangeTime(page, "Clip start time (seconds)", 0);
    await setClipRangeTime(page, "Clip end time (seconds)", 30);
    await setFrameFromUiTime(page, "Playhead time (seconds)", 239);
    await page.getByRole("button", { name: "Add subtitle" }).click();
    const review = page.locator(".timeline-review");
    await expect(review.locator("summary")).toContainText("long gap");
    await expect(review.getByText(/Long gap on Captions:/)).toBeVisible();
    await review
      .getByRole("button", { name: /^Locate / })
      .last()
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "New subtitle",
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".timeline-clip.subtitle-clip")).toHaveCount(1);
    await page.locator(".timeline-clip.subtitle-clip").first().click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page.getByLabel("Clip start time (seconds)", { exact: true }),
    ).toHaveValue(initialClipStart);
    await expect(
      page.getByLabel("Clip end time (seconds)", { exact: true }),
    ).toHaveValue(initialClipEnd);
    await setFrameFromUiTime(page, "Playhead time (seconds)", 90);
    const soundtrackTrackId = await page
      .locator(".audio-clip")
      .evaluate((element) => element.parentElement?.getAttribute("data-track"));
    const generatedCaptionTrackId = await page
      .locator(".timeline-clip.subtitle-clip")
      .first()
      .evaluate((element) => element.parentElement?.getAttribute("data-track"));
    expect(generatedCaptionTrackId).not.toBe(soundtrackTrackId);
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    const preview = page.frameLocator('[data-panel-id="editor"] iframe');
    await expect(
      preview.getByText("Human edited caption", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "New subtitle",
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );

    await page
      .getByRole("button", { name: "Duplicate clip", exact: true })
      .click();
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      2,
    );
    const duplicateClipId = await page
      .locator(".timeline-clip.is-selected")
      .getAttribute("data-clip-id");
    expect(duplicateClipId).toBeTruthy();
    await page
      .getByLabel("Text", { exact: true })
      .fill("Second selected caption");
    await setFrameFromUiTime(page, "Playhead time (seconds)", 120);
    await expect(
      preview.getByText("Second selected caption", { exact: true }),
    ).toBeVisible();
    const originalClip = page
      .locator(".timeline-clip")
      .filter({ hasText: "Human edited caption" })
      .first();
    await originalClip.click();
    await expect(originalClip).toHaveClass(/is-selected/);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );
    await setFrameFromUiTime(page, "Playhead time (seconds)", 60);
    await expect(
      preview.getByText("Human edited caption", { exact: true }),
    ).toBeVisible();
    await page
      .locator(`.timeline-clip[data-clip-id="${duplicateClipId}"]`)
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Second selected caption",
    );
    await page
      .getByRole("button", { name: "Delete clip", exact: true })
      .click();
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      1,
    );
    await originalClip.click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );

    await originalClip.focus();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      2,
    );
    await page.keyboard.press("Control+z");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      1,
    );
    await page.keyboard.press("Control+y");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      2,
    );

    const dragSource = page.locator(".timeline-clip:not(.audio-clip)").first();
    const dragSourceId = await dragSource.getAttribute("data-clip-id");
    const dragBox = await dragSource.boundingBox();
    expect(dragBox).toBeTruthy();
    await page.keyboard.down("Control");
    await page.mouse.move(
      dragBox!.x + dragBox!.width / 2,
      dragBox!.y + dragBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dragBox!.x + dragBox!.width / 2 + 80,
      dragBox!.y + dragBox!.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      3,
    );
    const dragCopyId = await page
      .locator(".timeline-clip.is-selected")
      .getAttribute("data-clip-id");
    expect(dragCopyId).toBeTruthy();
    expect(dragCopyId).not.toBe(dragSourceId);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      2,
    );
    await page.keyboard.press("Control+y");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      3,
    );
    await page.keyboard.press("Control+z");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      2,
    );
    await page.keyboard.press("Control+z");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      1,
    );
    await originalClip.click();

    const detachedClipId = await page
      .locator(".timeline-clip.is-selected")
      .getAttribute("data-clip-id");
    expect(detachedClipId).toBeTruthy();
    const attachedLayout = await page
      .locator(".timeline-editor")
      .evaluate((editor) => {
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
    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const detachedPage = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
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
    const detachedClip = detachedPage!.locator(
      `.timeline-clip[data-clip-id="${detachedClipId}"]`,
    );
    await expect(detachedClip).toBeVisible();
    await expect(page.locator(".timeline-dock")).toHaveCount(0);
    await expect(detachedPage!.locator(".timeline-dock")).toHaveCount(1);
    await verifyTimelineZoom(detachedPage!);
    await expect(page.locator("[data-panel-id='editor'] iframe")).toHaveCount(
      1,
    );
    await expect(detachedPage!.locator("iframe")).toHaveCount(0);
    await detachedClip.click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );
    await setFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
      60,
    );
    await expect(
      preview.getByText("Human edited caption", { exact: true }),
    ).toBeVisible();
    const frameBeforePlayback = await readFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        readFrameFromUiTime(detachedPage!, "Timeline playhead time (seconds)"),
      )
      .not.toBe(frameBeforePlayback);
    const frameDuringPlayback = await readFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
    );
    await page.waitForTimeout(1200);
    expect(
      await readFrameFromUiTime(
        detachedPage!,
        "Timeline playhead time (seconds)",
      ),
    ).toBeGreaterThan(frameDuringPlayback);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(() =>
        readFrameFromUiTime(detachedPage!, "Timeline playhead time (seconds)"),
      )
      .toBe(await readFrameFromUiTime(page, "Playhead time (seconds)"));

    for (const frame of [121, 37, 83]) {
      await setFrameFromUiTime(
        detachedPage!,
        "Timeline playhead time (seconds)",
        frame,
      );
      await expect
        .poll(() =>
          readFrameFromUiTime(
            detachedPage!,
            "Timeline playhead time (seconds)",
          ),
        )
        .toBe(frame);
      await expect
        .poll(() => readFrameFromUiTime(page, "Playhead time (seconds)"))
        .toBe(frame);
    }

    const originalRange = await detachedClip.locator("small").innerText();
    await detachedClip.focus();
    await detachedPage!.keyboard.press("ArrowRight");
    await expect
      .poll(() => detachedClip.locator("small").innerText())
      .not.toBe(originalRange);
    const movedRange = await detachedClip.locator("small").innerText();
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(originalRange);
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(movedRange);

    const beforeTrim = await detachedClip.locator("small").innerText();
    const resizeHandle = await detachedClip
      .locator(".resize-handle.right")
      .boundingBox();
    expect(resizeHandle).toBeTruthy();
    await detachedPage!.mouse.move(
      resizeHandle!.x + resizeHandle!.width / 2,
      resizeHandle!.y + resizeHandle!.height / 2,
    );
    await detachedPage!.mouse.down();
    await expect(detachedPage!.locator(".timeline-dock")).toHaveAttribute(
      "data-drag-active",
      "true",
    );
    await detachedPage!.mouse.move(
      resizeHandle!.x + resizeHandle!.width / 2 + 32,
      resizeHandle!.y + resizeHandle!.height / 2,
      { steps: 4 },
    );
    await detachedPage!.mouse.up();
    await expect
      .poll(() => detachedClip.locator("small").innerText())
      .not.toBe(beforeTrim);
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(movedRange);
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(originalRange);

    const rangeBeforeEdgeDrag = await detachedClip.locator("small").innerText();
    const durationBeforeEdgeDrag =
      Number(
        await detachedPage!
          .locator(".time-ruler")
          .getAttribute("aria-valuemax"),
      ) + 1;
    await detachedPage!
      .getByLabel("Timeline zoom", { exact: true })
      .selectOption("8");
    const timelineScroll = detachedPage!.locator(".timeline-scroll");
    const initialClipLeft = await detachedClip.evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    await timelineScroll.evaluate((element, clipLeft) => {
      element.scrollLeft = Math.max(0, clipLeft - 200);
    }, initialClipLeft);
    const edgeClipBox = await detachedClip.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    });
    const timelineViewport = await timelineScroll.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    });
    expect(edgeClipBox).toBeTruthy();
    expect(timelineViewport).toBeTruthy();
    await detachedClip.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: edgeClipBox!.x + Math.min(edgeClipBox!.width / 2, 24),
      clientY: edgeClipBox!.y + edgeClipBox!.height / 2,
    });
    await expect(detachedPage!.locator(".timeline-dock")).toHaveAttribute(
      "data-drag-active",
      "true",
    );
    await detachedPage!.waitForTimeout(100);
    await detachedPage!.evaluate(() => {
      const viewport = document.querySelector(".timeline-scroll")!;
      const rect = viewport.getBoundingClientRect();
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: rect.right - 4,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
        }),
      );
    });
    await expect
      .poll(() =>
        detachedPage!
          .locator(".timeline-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await readClipFrameRange(detachedClip))[0])
      .toBeGreaterThan(0);
    await detachedPage!.waitForTimeout(6500);
    await detachedPage!.evaluate(() => {
      window.dispatchEvent(
        new MouseEvent("mouseup", { buttons: 0, bubbles: true }),
      );
    });
    await expect(detachedPage!.locator(".timeline-dock")).not.toHaveAttribute(
      "data-drag-active",
      "true",
    );
    await expect(
      detachedPage!.locator(".detached-timeline-window"),
    ).not.toHaveAttribute("data-command-busy", "true");
    await expect
      .poll(async () => {
        const [start, end] = await readClipFrameRange(detachedClip);
        const [authoritativeStart, authoritativeEnd] = await Promise.all([
          readClipRangeTime(page, "Clip start time (seconds)"),
          readClipRangeTime(page, "Clip end time (seconds)"),
        ]);
        return start === authoritativeStart && end === authoritativeEnd;
      })
      .toBe(true);
    const rangeAfterEdgeDrag = await detachedClip.locator("small").innerText();
    const [, endFrameAfterEdgeDrag] = await readClipFrameRange(detachedClip);
    const durationAfterEdgeDrag =
      Number(
        await detachedPage!
          .locator(".time-ruler")
          .getAttribute("aria-valuemax"),
      ) + 1;
    expect(endFrameAfterEdgeDrag).toBeGreaterThan(durationBeforeEdgeDrag);
    expect(durationAfterEdgeDrag).toBeGreaterThan(durationBeforeEdgeDrag);
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(rangeBeforeEdgeDrag);
    await expect
      .poll(() =>
        detachedPage!.locator(".time-ruler").getAttribute("aria-valuemax"),
      )
      .toBe(String(durationBeforeEdgeDrag - 1));
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(detachedClip.locator("small")).toHaveText(rangeAfterEdgeDrag);
    await expect
      .poll(() =>
        detachedPage!.locator(".time-ruler").getAttribute("aria-valuemax"),
      )
      .toBe(String(durationAfterEdgeDrag - 1));
    await page
      .getByRole("button", { name: "Delete clip", exact: true })
      .click();
    await expect(
      detachedPage!.locator(`[data-clip-id="${detachedClipId}"]`),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        detachedPage!.locator(".time-ruler").getAttribute("aria-valuemax"),
      )
      .toBe(String(durationAfterEdgeDrag - 1));
    await page
      .getByLabel("Playback ends", { exact: true })
      .selectOption("content");
    await setFrameFromUiTime(page, "Playhead time (seconds)", 0);
    const canvas = page.locator('[data-editor-view="canvas"]');
    await canvas.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      canvas.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible({ timeout: 12_000 });
    const contentEndFrame = Number(
      (await canvas.getByTestId("frame-readout").innerText()).split("/")[0],
    );
    expect(contentEndFrame).toBeLessThan(durationAfterEdgeDrag - 1);
    await setFrameFromUiTime(page, "Playhead time (seconds)", 0);
    await canvas.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      canvas.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await setFrameFromUiTime(
      page,
      "Playhead time (seconds)",
      durationAfterEdgeDrag - 10,
    );
    await expect(
      canvas.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    const tailSeekFrame = Number(
      (await canvas.getByTestId("frame-readout").innerText()).split("/")[0],
    );
    expect(tailSeekFrame).toBeGreaterThanOrEqual(durationAfterEdgeDrag - 2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      detachedPage!.locator(`[data-clip-id="${detachedClipId}"]`),
    ).toHaveCount(1);
    await detachedPage!.locator(`[data-clip-id="${detachedClipId}"]`).click();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const extendedProject = JSON.parse(
      await readFile(path.join(projectPath, "project.json"), "utf8"),
    );
    const extendedTimeline = JSON.parse(
      await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
    );
    expect(extendedProject.durationInFrames).toBe(durationAfterEdgeDrag);
    expect(extendedTimeline.durationInFrames).toBe(durationAfterEdgeDrag);
    const reloadTimelineResponse = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === `/api/edit/${id}` &&
        request.method() === "GET"
      );
    });
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await reloadTimelineResponse;
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );
    await expect(page.getByText("Loaded the file on disk.")).toBeVisible();
    await expect(detachedClip.locator("small")).toHaveText(rangeAfterEdgeDrag);
    await expect
      .poll(() =>
        detachedPage!.locator(".time-ruler").getAttribute("aria-valuemax"),
      )
      .toBe(String(durationAfterEdgeDrag - 1));

    await page
      .getByLabel("Text", { exact: true })
      .fill("Detached Inspector edit");
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Detached Inspector edit",
    );
    await expect(detachedClip.locator(".clip-title")).toHaveText(
      "Detached Inspector edit",
    );
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    await expect(detachedClip.locator(".clip-title")).toHaveText(
      "Human edited caption",
    );
    const detachedUndo = detachedPage!.getByRole("button", {
      name: "Undo",
      exact: true,
    });
    await expect(detachedUndo).toBeEnabled();
    await detachedUndo.click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Detached Inspector edit",
    );
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Human edited caption",
    );
    const [rangeStartFrame] = await readClipFrameRange(detachedClip);
    await setFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
      rangeStartFrame,
    );
    await expect(
      preview.getByText("Human edited caption", { exact: true }),
    ).toBeVisible();
    await setFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
      90,
    );
    await detachedPage!
      .getByRole("button", { name: "Add track", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
      "5 tracks",
    );
    await detachedPage!
      .getByRole("button", { name: "Add subtitle", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await expect(
      detachedPage!.locator(".timeline-clip:not(.audio-clip)"),
    ).toHaveCount(3);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "New subtitle",
    );
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(
      detachedPage!.locator(".timeline-clip:not(.audio-clip)"),
    ).toHaveCount(2);
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(
      detachedPage!.locator(".timeline-clip:not(.audio-clip)"),
    ).toHaveCount(3);
    const selectedBeforeAttach = await detachedPage!
      .locator(".timeline-clip.is-selected")
      .getAttribute("data-clip-id");
    expect(selectedBeforeAttach).toBeTruthy();
    const staleResult = await detachedPage!.evaluate(async () => {
      const api = window.floxBowWindows!;
      const context = await api.getContext();
      if (context.role !== "panel")
        throw new Error("Expected the registered Timeline window");
      const stateVersion = Number(
        document
          .querySelector(".detached-timeline-window")
          ?.getAttribute("data-state-version"),
      );
      const commandId = `${context.instanceId}:${context.commandSequence + 1}`;
      const result = new Promise<{ status: string; message: string }>(
        (resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("Stale command was not acknowledged")),
            5000,
          );
          const unsubscribe = api.onTimelineCommandResult((value) => {
            if (value.commandId !== commandId) return;
            window.clearTimeout(timeout);
            unsubscribe();
            resolve(value);
          });
        },
      );
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
    await detachedPage!
      .getByRole("button", { name: "Attach Timeline", exact: true })
      .click();
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
    await expect(page.locator(".timeline-clip.is-selected")).toHaveAttribute(
      "data-clip-id",
      selectedBeforeAttach!,
    );
    await expect
      .poll(() => readFrameFromUiTime(page, "Playhead time (seconds)"))
      .toBe(90);
    const originalPrimaryClip = page.locator(
      `.timeline-clip[data-clip-id="${detachedClipId}"]`,
    );
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
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeEnabled();
    expect(
      JSON.parse(
        await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
      ).clips[0].content.text,
    ).toBe("Human edited caption");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    expect(
      JSON.parse(
        await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
      ).clips[0].content.text,
    ).toBe("Newer concurrent draft");
    if (!built) {
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Generate Subtitles", exact: true })
        .click();
      await expect(
        page.getByText(/2 unverified subtitles added/),
      ).toBeVisible();
      expect(whisperHostAudioPath).toBe(audioFixturePath);
      await expect(page.locator(".timeline-clip.subtitle-clip")).toHaveCount(2);
      await expect(
        page
          .frameLocator('[data-panel-id="editor"] iframe')
          .getByText("Human edited caption", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save project", exact: true })
        .click();
      await expect(
        page.getByText("Saved to the project. Renders use these edits."),
      ).toBeVisible();
    }
    const saved = JSON.parse(
      await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
    );
    expect(saved.clips).toHaveLength(built ? 4 : 3);
    expect(saved.clips[0].content.text).toBe(
      built ? "Newer concurrent draft" : "Human edited caption",
    );
    expect(
      saved.clips.filter(
        (clip: { componentId: string }) => clip.componentId === "subtitles",
      ),
    ).toHaveLength(built ? 3 : 2);
    expect(saved.tracks.map((track: { name: string }) => track.name)).toEqual([
      "Visuals",
      "Captions",
      "Audio",
      "Track 4",
      "Track 5",
    ]);
    expect(
      saved.clips.find(
        (clip: { componentId: string }) => clip.componentId === "soundtrack",
      ),
    ).toMatchObject({ from: 0, durationInFrames: 240 });
    renderedStill = await renderProject(root, id, true);
    expect((await stat(renderedStill)).size).toBeGreaterThan(1024);
    renderedVideo = await renderProject(root, id, false);
    expect((await stat(renderedVideo)).size).toBeGreaterThan(10_000);
    const probedVideo = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "json",
        renderedVideo,
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    expect(
      JSON.parse(probedVideo.stdout).streams.some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ),
    ).toBe(true);
    const duringSoundtrack = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "info",
        "-ss",
        "0.2",
        "-i",
        renderedVideo,
        "-t",
        "0.5",
        "-vn",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    const meanVolume = (output: string) =>
      Number(output.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? -Infinity);
    expect(meanVolume(duringSoundtrack.stderr)).toBeGreaterThan(-25);
    const captionFrame = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        "3.5",
        "-i",
        renderedVideo,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      {
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
        encoding: "buffer",
      },
    );
    const captionPixels = Buffer.from(captionFrame.stdout);
    let brightCaptionPixels = 0;
    for (let index = 0; index + 2 < captionPixels.length; index += 3) {
      if (
        captionPixels[index] > 190 &&
        captionPixels[index + 1] > 190 &&
        captionPixels[index + 2] > 190
      )
        brightCaptionPixels += 1;
    }
    expect(brightCaptionPixels).toBeGreaterThan(100);
    const decodedAudioPath = path.join(
      audioFixtureDirectory,
      "rendered-audio.wav",
    );
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        renderedVideo,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-c:a",
        "pcm_s16le",
        decodedAudioPath,
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    const decodedAudio = await readFile(decodedAudioPath);
    const sampleCount = Math.floor((decodedAudio.length - 44) / 2);
    let peak = 0;
    let energy = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = decodedAudio.readInt16LE(44 + index * 2);
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    expect(peak).toBeGreaterThan(100);
    expect(Math.sqrt(energy / sampleCount)).toBeGreaterThan(50);
    // Scenario B: an external process updates the saved timeline while the editor is clean.
    const editPath = path.join(projectPath, "edit-timeline.json");
    const externalUpdate = structuredClone(saved);
    externalUpdate.clips[0].content.text = "Updated by external agent";
    await writeFile(editPath, `${JSON.stringify(externalUpdate, null, 2)}\n`);
    await expect(
      preview.getByText("Updated by external agent", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Updated by external agent",
    );

    // Scenario C: preserve both versions when external edits arrive during an unsaved UI draft.
    await page.getByLabel("Text", { exact: true }).fill("Unsaved human draft");
    const concurrentExternal = structuredClone(externalUpdate);
    concurrentExternal.clips[0].content.text = "External version to protect";
    await writeFile(
      editPath,
      `${JSON.stringify(concurrentExternal, null, 2)}\n`,
    );
    await expect(page.locator(".timeline-editor .error")).toContainText(
      "project changed on disk while you were editing",
    );
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Unsaved human draft",
    );
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    expect(
      JSON.parse(await readFile(editPath, "utf8")).clips[0].content.text,
    ).toBe("External version to protect");

    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    const conflictTimeline = (await app.windows()).find((candidate) =>
      candidate.url().includes("#studio-panel=timeline"),
    );
    expect(conflictTimeline).toBeTruthy();
    await expect(
      conflictTimeline!.locator(".detached-timeline-toolbar"),
    ).toContainText("Unsaved edits in main editor");
    await expect(
      conflictTimeline!.locator(".detached-timeline-toolbar"),
    ).toContainText("Revision conflict");
    await conflictTimeline!
      .getByRole("button", { name: "Attach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(1);

    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "External version to protect",
    );
    await expect(
      preview.getByText("External version to protect", { exact: true }),
    ).toBeVisible();

    // Hiding and switching panels keeps one editor mounted with its draft, selection and transport state.
    const activeClip = page.locator(".timeline-clip.is-selected");
    const activeClipId = await activeClip.getAttribute("data-clip-id");
    expect(activeClipId).toBeTruthy();
    const editorSessionId = await page
      .locator(".timeline-editor")
      .getAttribute("data-editor-session-id");
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(
      1,
    );
    await page
      .getByLabel("Text", { exact: true })
      .fill("Draft survives panel changes");
    await setFrameFromUiTime(page, "Playhead time (seconds)", 42);
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Project media" }),
    ).toBeVisible();
    await expect(page.locator('[data-panel-id="editor"]')).toBeHidden();
    await expect(
      page.locator('[data-panel-id="editor"] .transport button').nth(1),
    ).toHaveText("Play");
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Draft survives panel changes",
    );
    await expect
      .poll(() => readFrameFromUiTime(page, "Playhead time (seconds)"))
      .toBe(42);
    await expect(
      page.locator(`.timeline-clip[data-clip-id="${activeClipId}"]`),
    ).toHaveClass(/is-selected/);
    await expect(
      page.locator('[data-panel-id="editor"] .timeline-editor'),
    ).toHaveCount(1);
    await expect(page.locator('[data-panel-id="editor"] iframe')).toHaveCount(
      1,
    );
    await expect(page.locator(".timeline-editor")).toHaveAttribute(
      "data-editor-session-id",
      editorSessionId!,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hide Editor panel" }).click();
    await expect(
      page.getByRole("region", { name: "Project media" }),
    ).toBeVisible();
    await expect(
      page.locator('[data-panel-id="editor"] .transport button').nth(1),
    ).toHaveText("Play");
    await page.locator(".workspace-view-menu summary").click();
    await page
      .getByRole("button", { name: "Show Editor", exact: true })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "Draft survives panel changes",
    );
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('[data-panel-id="editor"] .timeline-editor'),
    ).toHaveCount(1);
    await expect(page.locator(".timeline-editor")).toHaveAttribute(
      "data-editor-session-id",
      editorSessionId!,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "External version to protect",
    );

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
      await page
        .getByRole("button", { name: "Create project", exact: true })
        .click();
      const projectButton = page.locator(
        `.project[data-project-id="${projectId}"]`,
      );
      await expect(projectButton).toBeVisible();
      await expect(projectButton).toHaveClass(/active/);
      await expect(
        page.getByRole("heading", { name: "Composition" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add subtitle" }),
      ).toBeEnabled({ timeout: 15_000 });
      await page.getByRole("button", { name: "Add subtitle" }).click();
      await page.getByLabel("Text", { exact: true }).fill(caption);
      const previewSubtitle = page
        .frameLocator('[data-panel-id="editor"] iframe')
        .locator("[data-subtitle-id]");
      await expect(previewSubtitle).toHaveText(caption);
      await page
        .getByRole("button", { name: "Save project", exact: true })
        .click();
      await expect(
        page.getByText("Saved to the project. Renders use these edits."),
      ).toBeVisible();
      const savedProject = JSON.parse(
        await readFile(
          path.join(projectsDir, projectId, "edit-timeline.json"),
          "utf8",
        ),
      );
      expect(savedProject.clips[0].content.text).toBe(caption);
    }

    // A core Text clip round-trips through the same Timeline JSON, Inspector,
    // live preview and Remotion renderer without a project module registration.
    const textProjectPath = path.join(projectsDir, thirdId);
    await page.getByRole("button", { name: "Add Text", exact: true }).click();
    const textClip = page.locator('.timeline-clip[data-clip-id^="text-"]');
    await expect(textClip).toBeVisible();
    const textClipId = await textClip.getAttribute("data-clip-id");
    expect(textClipId).toBeTruthy();
    const inspectorText = page.getByLabel("Text", { exact: true });
    const textPreview = page
      .frameLocator('[data-panel-id="editor"] iframe')
      .locator(`[data-standalone-text-id="${textClipId}"]`);
    const previewFrame = page.locator('[data-panel-id="editor"] iframe');
    await inspectorText.fill("AI editable title");
    await expect(textPreview).toHaveText("AI editable title");
    await page.getByLabel("Position X (%)").fill("68");
    await page.getByLabel("Position Y (%)").fill("24");
    await page.getByLabel("Font size", { exact: true }).fill("84");
    await page.getByLabel("Color", { exact: true }).fill("#00ff00");
    await page.getByLabel("Alignment", { exact: true }).selectOption("right");
    await expect(textPreview).toHaveText("AI editable title");
    await expect(textPreview).toHaveCSS("color", "rgb(0, 255, 0)");
    await expect(textPreview).toHaveCSS("text-align", "right");
    const textHitbox = page.locator(`[data-canvas-element-id="${textClipId}"]`);
    const textBounds = await textHitbox.boundingBox();
    expect(textBounds).toBeTruthy();
    await page.mouse.move(
      textBounds!.x + textBounds!.width / 2,
      textBounds!.y + textBounds!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      textBounds!.x + textBounds!.width / 2 + 36,
      textBounds!.y + textBounds!.height / 2 + 10,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Position X (%)").inputValue()),
      )
      .toBeGreaterThan(68);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Position X (%)")).toHaveValue("68");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Position X (%)").inputValue()),
      )
      .toBeGreaterThan(68);
    await page.getByLabel("Position X (%)").fill("68");
    await page.getByLabel("Position Y (%)").fill("24");
    const subtitleClipId = await page
      .locator(".subtitle-clip")
      .first()
      .getAttribute("data-clip-id");
    expect(subtitleClipId).toBeTruthy();
    const subtitleHitbox = page.locator(
      `[data-canvas-element-id="${subtitleClipId}"]`,
    );
    await subtitleHitbox.click({ modifiers: ["Shift"] });
    await expect(
      page.getByText("2 elements selected", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".timeline-clip.is-selected")).toHaveCount(2);

    // Rotation uses rendered Canvas geometry and must keep the full selection.
    await textHitbox.click();
    await page.getByLabel("Anchor", { exact: true }).selectOption("top-left");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("25");
    await subtitleHitbox.click({ modifiers: ["Shift"] });
    await expect(
      page.getByText("2 elements selected", { exact: true }),
    ).toBeVisible();
    const selectedBounds = await page
      .getByTestId("canvas-selection-bounds")
      .boundingBox();
    const rotationHandle = await page
      .getByRole("button", { name: "Rotate selection" })
      .boundingBox();
    expect(selectedBounds).toBeTruthy();
    expect(rotationHandle).toBeTruthy();
    const rotationStart = {
      x: rotationHandle!.x + rotationHandle!.width / 2,
      y: rotationHandle!.y + rotationHandle!.height / 2,
    };
    const rotationCenter = {
      x: selectedBounds!.x + selectedBounds!.width / 2,
      y: selectedBounds!.y + selectedBounds!.height / 2,
    };
    const textCanvasTransformBefore = await textHitbox.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    const subtitleCanvasTransformBefore = await subtitleHitbox.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    const rotationRadius = Math.max(24, selectedBounds!.height / 2);
    await page.mouse.move(rotationStart.x, rotationStart.y);
    await page.mouse.down();
    await page.mouse.move(rotationCenter.x + rotationRadius, rotationCenter.y, {
      steps: 5,
    });
    await page.mouse.up();
    await expect
      .poll(async () => {
        return textHitbox.evaluate(
          (element) => getComputedStyle(element).transform,
        );
      })
      .not.toBe(textCanvasTransformBefore);
    await expect
      .poll(async () => {
        return subtitleHitbox.evaluate(
          (element) => getComputedStyle(element).transform,
        );
      })
      .not.toBe(subtitleCanvasTransformBefore);

    await textHitbox.click();
    await page.getByLabel("Anchor", { exact: true }).selectOption("center");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("0");
    await page.getByLabel("Position X (%)", { exact: true }).fill("68");
    await page.getByLabel("Position Y (%)", { exact: true }).fill("24");
    await expect(inspectorText).toHaveValue("AI editable title");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const standaloneTextPath = path.join(textProjectPath, "edit-timeline.json");
    const readTextClip = async () => {
      const document = JSON.parse(await readFile(standaloneTextPath, "utf8"));
      return {
        document,
        clip: document.clips.find(
          (item: { id: string }) => item.id === textClipId,
        ),
      };
    };
    let standaloneSaved = await readTextClip();
    expect(standaloneSaved.document.version).toBe(1);
    expect(standaloneSaved.clip).toMatchObject({
      componentId: "text",
      content: { text: "AI editable title" },
      props: {
        x: 68,
        y: 24,
        fontSize: 84,
        color: "#00ff00",
        alignment: "right",
      },
    });

    const beforeSavedReload = await previewFrame.getAttribute(
      "data-preview-generation",
    );
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(previewFrame).not.toHaveAttribute(
      "data-preview-generation",
      beforeSavedReload ?? "",
    );
    await expect(inspectorText).toHaveValue("AI editable title");
    await expect(textPreview).toHaveText("AI editable title");
    await expect(page.getByLabel("Position X (%)")).toHaveValue("68");
    await expect(page.getByLabel("Position Y (%)")).toHaveValue("24");
    await expect(page.getByLabel("Font size", { exact: true })).toHaveValue(
      "84",
    );
    await expect(page.getByLabel("Color", { exact: true })).toHaveValue(
      "#00ff00",
    );
    await expect(page.getByLabel("Alignment", { exact: true })).toHaveValue(
      "right",
    );

    const writeExternalTextUpdate = async (
      change: (clip: Record<string, any>) => void,
    ) => {
      const { document, clip } = await readTextClip();
      change(clip);
      const temporary = `${standaloneTextPath}.agent-${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        flag: "wx",
      });
      await rename(temporary, standaloneTextPath);
    };
    await writeExternalTextUpdate((clip) => {
      clip.content.text = "External agent title";
      clip.props.x = 35;
      clip.props.y = 30;
      clip.props.color = "#ff3300";
      clip.props.alignment = "left";
    });
    await expect(inspectorText).toHaveValue("External agent title");
    await expect(page.getByLabel("Position X (%)")).toHaveValue("35");
    await expect(textPreview).toHaveText("External agent title");
    await expect(textPreview).toHaveCSS("color", "rgb(255, 51, 0)");

    await inspectorText.fill("Human unsaved title");
    await writeExternalTextUpdate((clip) => {
      clip.content.text = "New external title";
      clip.props.alignment = "right";
    });
    await expect(page.locator(".timeline-editor .error")).toContainText(
      "project changed on disk while you were editing",
    );
    await expect(inspectorText).toHaveValue("Human unsaved title");
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    standaloneSaved = await readTextClip();
    expect(standaloneSaved.clip.content.text).toBe("New external title");
    const beforeConflictReload = await previewFrame.getAttribute(
      "data-preview-generation",
    );
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(inspectorText).toHaveValue("New external title");
    await expect(previewFrame).not.toHaveAttribute(
      "data-preview-generation",
      beforeConflictReload ?? "",
    );
    await expect(textPreview).toHaveText("New external title");
    await expect(page.getByLabel("Alignment", { exact: true })).toHaveValue(
      "right",
    );

    await inspectorText.fill("Final title from Inspector");
    await expect(textPreview).toHaveText("Final title from Inspector");
    await page.getByLabel("Position X (%)").fill("50");
    await page.getByLabel("Position Y (%)").fill("40");
    await page.getByLabel("Font size", { exact: true }).fill("84");
    await page.getByLabel("Color", { exact: true }).fill("#00ff00");
    await page.getByLabel("Alignment", { exact: true }).selectOption("center");
    await expect(page.getByLabel("Position X (%)")).toHaveValue("50");
    await expect(textPreview).toHaveAttribute("style", /left:\s*50%/);
    await expect(textPreview).toHaveText("Final title from Inspector");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    standaloneSaved = await readTextClip();
    expect(standaloneSaved.clip).toMatchObject({
      content: { text: "Final title from Inspector" },
      props: {
        x: 50,
        y: 40,
        fontSize: 84,
        color: "#00ff00",
        alignment: "center",
      },
    });
    expect(standaloneSaved.clip.from).toBeLessThanOrEqual(75);
    expect(
      standaloneSaved.clip.from + standaloneSaved.clip.durationInFrames,
    ).toBeGreaterThan(75);

    await page.getByRole("button", { name: "Media", exact: true }).click();
    await page.getByRole("button", { name: "Add PNG", exact: true }).click();
    const imageAsset = page
      .getByRole("listitem")
      .filter({ hasText: "flox-smoke" });
    await expect(
      imageAsset.getByText("Available", { exact: true }),
    ).toBeVisible();
    const imageAssetText = await imageAsset.locator("small").innerText();
    const imageId = imageAssetText.split("·").at(-1)?.trim();
    expect(imageId).toMatch(/^image-[a-f0-9-]{36}$/);
    await imageAsset
      .getByRole("button", { name: /Add .* to Timeline/ })
      .click();
    const imageClip = page.locator('.timeline-clip[data-clip-id^="image-"]');
    await expect(imageClip).toBeVisible();
    const imageClipId = await imageClip.getAttribute("data-clip-id");
    expect(imageClipId).toBeTruthy();
    const imagePreview = page
      .frameLocator('[data-panel-id="editor"] iframe')
      .locator(`img[data-image-asset-id="${imageId}"]`);
    await expect(imagePreview).toBeVisible();
    const initialPreviewGeneration = await previewFrame.getAttribute(
      "data-preview-generation",
    );
    await imageClip.click();
    const imageInspectorX = page.getByLabel("Position X (%)", { exact: true });
    const imageInspectorY = page.getByLabel("Position Y (%)", { exact: true });
    const imageInspectorWidth = page.getByLabel("Width (%)", { exact: true });
    const imageInspectorHeight = page.getByLabel("Height (%)", { exact: true });
    await imageInspectorX.fill("15");
    await imageInspectorY.fill("70");
    await imageInspectorWidth.fill("24");
    await imageInspectorHeight.fill("20");
    await page
      .getByLabel("Anchor", { exact: true })
      .selectOption("bottom-right");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("35");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();

    // The same Canvas interaction layer operates an Image clip through the
    // public visual-element contract, without a separate Image drag system.
    const imageHitbox = page.locator(
      `[data-canvas-element-id="${imageClipId}"]`,
    );
    await expect(imageHitbox).toBeVisible();
    const imageBounds = await imageHitbox.boundingBox();
    expect(imageBounds).toBeTruthy();
    const imageCenter = {
      x: imageBounds!.x + imageBounds!.width / 2,
      y: imageBounds!.y + imageBounds!.height / 2,
    };

    // Canceling a live pointer gesture must restore its starting document and
    // remove the gesture's provisional undo checkpoint.
    await page.evaluate(() => {
      window.addEventListener(
        "pointerdown",
        (event) => {
          (
            window as typeof window & { __smokePointerId?: number }
          ).__smokePointerId = event.pointerId;
        },
        { capture: true, once: true },
      );
    });
    await page.mouse.move(imageCenter.x, imageCenter.y);
    await page.mouse.down();
    await page.mouse.move(imageCenter.x + 42, imageCenter.y + 18, { steps: 3 });
    const activePointerId = await page.evaluate(
      () =>
        (window as typeof window & { __smokePointerId?: number })
          .__smokePointerId,
    );
    expect(activePointerId).toBeDefined();
    await page.evaluate(
      ({ id, pointerId }) => {
        document
          .querySelector<HTMLElement>(`[data-canvas-element-id="${id}"]`)
          ?.dispatchEvent(
            new PointerEvent("pointercancel", {
              bubbles: true,
              cancelable: true,
              pointerId,
            }),
          );
      },
      { id: imageClipId, pointerId: activePointerId! },
    );
    await page.mouse.up();
    await expect(imageInspectorX).toHaveValue("15");
    await expect(imageInspectorY).toHaveValue("70");
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();

    // Resize is based on the rendered rotated bounds, while preserving the
    // element's non-center anchor and existing rotation.
    const rotatedImageResizeHandle = page.getByRole("button", {
      name: "Resize selection right bottom",
    });
    const resizeBounds = await rotatedImageResizeHandle.boundingBox();
    expect(resizeBounds).toBeTruthy();
    await page.mouse.move(
      resizeBounds!.x + resizeBounds!.width / 2,
      resizeBounds!.y + resizeBounds!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeBounds!.x + resizeBounds!.width / 2 + 36,
      resizeBounds!.y + resizeBounds!.height / 2 + 24,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => Number(await imageInspectorWidth.inputValue()))
      .not.toBe(24);
    await expect
      .poll(async () => Number(await imageInspectorHeight.inputValue()))
      .not.toBe(20);
    await expect(page.getByLabel("Rotation (°)", { exact: true })).toHaveValue(
      "35",
    );
    await expect(page.getByLabel("Anchor", { exact: true })).toHaveValue(
      "bottom-right",
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(imageInspectorWidth).toHaveValue("24");
    await expect(imageInspectorHeight).toHaveValue("20");

    await page.getByLabel("Anchor", { exact: true }).selectOption("center");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("0");
    const centeredImageBounds = await imageHitbox.boundingBox();
    expect(centeredImageBounds).toBeTruthy();
    const centeredImage = {
      x: centeredImageBounds!.x + centeredImageBounds!.width / 2,
      y: centeredImageBounds!.y + centeredImageBounds!.height / 2,
    };
    await page.mouse.move(centeredImage.x, centeredImage.y);
    await page.mouse.down();
    await page.mouse.move(centeredImage.x + 48, centeredImage.y + 12, {
      steps: 4,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await imageInspectorX.inputValue()))
      .toBeGreaterThan(15);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(imageInspectorX).toHaveValue("15");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(async () => Number(await imageInspectorX.inputValue()))
      .toBeGreaterThan(15);

    // Keep the rendered Image separate from the green Text so both outputs
    // can be verified in the same exported frame.
    await imageInspectorX.fill("15");
    await imageInspectorY.fill("70");
    await imageInspectorWidth.fill("24");
    await imageInspectorHeight.fill("20");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const imageTimelinePath = path.join(textProjectPath, "edit-timeline.json");
    const readImageClip = async () => {
      const document = JSON.parse(await readFile(imageTimelinePath, "utf8"));
      return {
        document,
        clip: document.clips.find(
          (item: { id: string }) => item.id === imageClipId,
        ),
      };
    };
    let savedImage = await readImageClip();
    expect(savedImage.clip).toMatchObject({
      componentId: "image",
      content: { assetId: imageId },
      props: { x: 15, y: 70, width: 24, height: 20 },
    });
    const writeExternalImageUpdate = async (
      change: (clip: Record<string, any>) => void,
    ) => {
      const { document, clip } = await readImageClip();
      change(clip);
      const temporary = `${imageTimelinePath}.agent-${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        flag: "wx",
      });
      await rename(temporary, imageTimelinePath);
    };
    await writeExternalImageUpdate((clip) => {
      clip.props.x = 35;
      clip.props.y = 42;
      clip.props.width = 30;
      clip.props.height = 25;
    });
    await expect(imageInspectorX).toHaveValue("35");
    await expect(
      page.getByText("Updated from project files.", { exact: true }),
    ).toBeVisible();
    await expect(previewFrame).not.toHaveAttribute(
      "data-preview-generation",
      initialPreviewGeneration ?? "",
    );
    await expect(imagePreview).toBeVisible();
    const pausePlayback = page.getByRole("button", { name: "Pause" });
    if (await pausePlayback.isVisible()) await pausePlayback.click();
    await setFrameFromUiTime(page, "Playhead time (seconds)", 2.5 * 30);
    await expect(page.getByTestId("frame-readout")).toContainText("75 /");
    await expect(imageInspectorX).toHaveValue("35");
    await expect(imageInspectorY).toHaveValue("42");
    await expect
      .poll(() =>
        imagePreview.evaluate(
          (element) => (element as HTMLImageElement).style.left,
        ),
      )
      .toBe("35%");
    await expect
      .poll(() =>
        imagePreview.evaluate(
          (element) => (element as HTMLImageElement).style.top,
        ),
      )
      .toBe("42%");
    await imageInspectorX.fill("15");
    await imageInspectorY.fill("70");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    savedImage = await readImageClip();
    expect(savedImage.clip.props).toMatchObject({ x: 15, y: 70 });

    standaloneTextVideo = await renderProject(root, thirdId, false);
    const diagnosticFramePath = path.join(
      audioFixtureDirectory,
      "rendered-text-frame.png",
    );
    await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        "2.5",
        "-i",
        standaloneTextVideo,
        "-frames:v",
        "1",
        diagnosticFramePath,
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    const renderedTextFrame = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        diagnosticFramePath,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      {
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
        encoding: "buffer",
      },
    );
    const renderedTextPixels = Buffer.from(renderedTextFrame.stdout);
    let greenTextPixels = 0;
    for (let index = 0; index + 2 < renderedTextPixels.length; index += 3) {
      if (
        renderedTextPixels[index] < 100 &&
        renderedTextPixels[index + 1] > 150 &&
        renderedTextPixels[index + 2] < 100
      )
        greenTextPixels += 1;
    }
    expect(greenTextPixels).toBeGreaterThan(100);
    let orangeImagePixels = 0;
    for (let index = 0; index + 2 < renderedTextPixels.length; index += 3) {
      if (
        renderedTextPixels[index] > 180 &&
        renderedTextPixels[index + 1] > 45 &&
        renderedTextPixels[index + 1] < 150 &&
        renderedTextPixels[index + 2] < 60
      )
        orangeImagePixels += 1;
    }
    expect(orangeImagePixels).toBeGreaterThan(1_000);

    await selectProject(id);
    await expect(
      page
        .frameLocator('[data-panel-id="editor"] iframe')
        .getByText("External version to protect", { exact: true }),
    ).toBeVisible();
    await selectProject(secondId);
    await expect(
      page
        .frameLocator('[data-panel-id="editor"] iframe')
        .getByText("Caption belongs to project two", { exact: true }),
    ).toBeVisible();
    await selectProject(thirdId);
    await expect(
      page
        .locator(".timeline-clip")
        .filter({ hasText: "Caption belongs to project three" }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('[data-panel-id="editor"] iframe')
        .getByText("Caption belongs to project three", { exact: true }),
    ).toBeVisible();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page
        .getByRole("button", { name: "Detach Timeline", exact: true })
        .click();
      await expect.poll(async () => (await app!.windows()).length).toBe(2);
      const cycleWindow = (await app.windows()).find((candidate) =>
        candidate.url().includes("#studio-panel=timeline"),
      );
      expect(cycleWindow).toBeTruthy();
      await expect(cycleWindow!.locator(".timeline-dock")).toHaveCount(1);
      if (cycle % 2 === 0) await cycleWindow!.close();
      else
        await cycleWindow!
          .getByRole("button", { name: "Attach Timeline", exact: true })
          .click();
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
          recoveredLayout.timelineHeight -
            recoveredLayout.configuredTimelineHeight,
        ),
      ).toBeLessThan(2);
    }
    await page
      .getByRole("button", { name: "Detach Timeline", exact: true })
      .click();
    await expect.poll(async () => (await app!.windows()).length).toBe(2);
    await selectProject(id);
    await expect.poll(async () => (await app!.windows()).length).toBe(1);
    await expect(page.locator(".timeline-dock")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Detach Timeline", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await unlink(audioFixturePath);
    const missingAudio = page
      .getByRole("listitem")
      .filter({ hasText: "flox-smoke-audio" });
    await expect(
      missingAudio.getByText("Missing file", { exact: true }),
    ).toBeVisible();
    let missingRemovalConfirmed = false;
    page.once("dialog", async (dialog) => {
      missingRemovalConfirmed = dialog
        .message()
        .includes("will NOT be deleted");
      await dialog.accept();
    });
    await missingAudio
      .getByRole("button", { name: "Remove from Project" })
      .click();
    expect(missingRemovalConfirmed).toBe(true);
    await expect
      .poll(async () => {
        const assets = JSON.parse(await readFile(mediaFile, "utf8")).assets;
        return assets.map(({ id }: { id: string }) => id);
      })
      .toEqual([]);
    const remainingMedia = JSON.parse(await readFile(mediaFile, "utf8")).assets;
    expect(remainingMedia).toHaveLength(0);
    const otherProjectMedia = JSON.parse(
      await readFile(path.join(textProjectPath, "media.json"), "utf8"),
    ).assets;
    expect(
      otherProjectMedia.some(
        (asset: { id: string; type: string }) =>
          asset.id === imageId && asset.type === "image",
      ),
    ).toBe(true);
    await expect(
      page.getByText("No media is registered for this project yet.", {
        exact: true,
      }),
    ).toBeVisible();
    console.log(
      "PASS development: detached Timeline commands, preview sync, attach/close recovery, single preview, conflict protection and project-session invalidation.",
    );
  }
} catch (error) {
  if (app) {
    const page = await app.firstWindow().catch(() => undefined);
    if (page)
      console.error(
        "UI:",
        await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
      );
    const previewFrame = page
      ?.frames()
      .find((frame) => frame.url().includes("/preview.html?"));
    if (previewFrame)
      console.error(
        "PREVIEW:",
        await previewFrame
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
      );
  }
  throw error;
} finally {
  await app?.close().catch(() => undefined);
  await servers.close();
  await rm(audioFixtureDirectory, { recursive: true, force: true });
  if (renderedStill) await rm(renderedStill, { force: true });
  if (renderedVideo) await rm(renderedVideo, { force: true });
  if (standaloneTextVideo) await rm(standaloneTextVideo, { force: true });
  if (!built)
    await Promise.all(
      createdIds.map((projectId) =>
        rm(path.join(projectsDir, projectId), { recursive: true, force: true }),
      ),
    );
}
