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
import { transcribeVideoClipAudio } from "./video-transcription";
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
  await expect
    .poll(() => readFrameFromUiTime(page, label))
    .toBe(frame);
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

async function findCanvasHitPoint(hitbox: Locator) {
  return hitbox.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const canvas = element.parentElement!.getBoundingClientRect();
    const left = Math.max(bounds.left, canvas.left);
    const right = Math.min(bounds.right, canvas.right);
    const top = Math.max(bounds.top, canvas.top);
    const bottom = Math.min(bounds.bottom, canvas.bottom);
    const stepX = Math.max(0.5, (right - left) / 100);
    const stepY = Math.max(0.5, (bottom - top) / 100);
    for (let y = top + stepY / 2; y < bottom; y += stepY) {
      for (let x = left + stepX / 2; x < right; x += stepX) {
        const target = document.elementFromPoint(x, y);
        if (target === element || (target && element.contains(target))) {
          return { x, y };
        }
      }
    }
    return undefined;
  });
}

async function inspectNarrowTimelineClip(clip: Locator) {
  return clip.evaluate((element) => {
    const originalWidth = element.style.width;
    element.style.width = "22px";
    const body = element.querySelector<HTMLElement>(".clip-body")!;
    const handle = element.querySelector<HTMLElement>(".resize-handle")!;
    const result = {
      clipWidth: element.getBoundingClientRect().width,
      contentWidth: body.getBoundingClientRect().width,
      contentPadding: Number.parseFloat(getComputedStyle(body).paddingLeft),
      handleFill: getComputedStyle(handle).backgroundColor,
      handleInteriorWidth: Math.max(
        0,
        Math.min(
          handle.getBoundingClientRect().right,
          element.getBoundingClientRect().right,
        ) - element.getBoundingClientRect().left,
      ),
      label: body.textContent?.trim() ?? "",
    };
    element.style.width = originalWidth;
    return result;
  });
}

async function verifyTimelineZoom(page: Page) {
  const zoom = page.getByLabel("Timeline zoom", { exact: true });
  const scroll = page.locator(".timeline-scroll");
  const waitForLayout = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
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
      const duration = Number(ruler.getAttribute("data-range-frames"));
      return ((x - rect.left) / rect.width) * duration;
    }, x);
  const anchorGeometry = (x: number) =>
    page.locator(".time-ruler").evaluate((ruler, x) => {
      const rect = ruler.getBoundingClientRect();
      const viewport = ruler
        .closest(".timeline-scroll")!
        .getBoundingClientRect();
      return {
        rulerLeft: rect.left,
        rulerWidth: rect.width,
        viewportLeft: viewport.left,
        viewportWidth: viewport.width,
        scrollLeft: ruler.closest<HTMLElement>(".timeline-scroll")!.scrollLeft,
        pointOffset: x - rect.left,
      };
    }, x);
  const buttonGeometryBefore = await anchorGeometry(buttonAnchorX);
  const beforeButtonZoom = await frameAtAnchor(buttonAnchorX);
  await page.getByRole("button", { name: "Zoom Timeline in" }).click();
  await expect(zoom).toHaveValue("1.25");
  await waitForLayout();
  const afterButtonZoom = await frameAtAnchor(buttonAnchorX);
  const buttonGeometryAfter = await anchorGeometry(buttonAnchorX);
  expect(
    Math.abs(afterButtonZoom - beforeButtonZoom),
    `button zoom anchor ${beforeButtonZoom} -> ${afterButtonZoom}; ${JSON.stringify({ buttonGeometryBefore, buttonGeometryAfter })}`,
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
  await waitForLayout();
  const afterWheelZoom = await frameAtAnchor(wheelAnchorX);
  expect(
    Math.abs(afterWheelZoom - beforeWheelZoom),
    `wheel zoom anchor ${beforeWheelZoom} -> ${afterWheelZoom}`,
  ).toBeLessThan(1);
  await zoom.selectOption("1");
}

async function verifyTimelinePlayheadLeftBoundary(page: Page) {
  const zoom = page.getByLabel("Timeline zoom", { exact: true });
  const scroll = page.locator(".timeline-scroll");
  const ruler = page.locator(".time-ruler");
  const originalZoom = await zoom.inputValue();
  const originalFrame = Number(await ruler.getAttribute("aria-valuenow"));
  const originalScrollLeft = await scroll.evaluate(
    (element) => element.scrollLeft,
  );
  await zoom.selectOption("4");
  await expect
    .poll(() =>
      scroll.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);

  const geometry = await scroll.evaluate((element) => {
    const label = element.querySelector<HTMLElement>(
      ".ruler-row .track-label",
    )!;
    return {
      left: element.getBoundingClientRect().left + element.clientLeft,
      labelWidth: label.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth + 100);
  await scroll.evaluate((element) => {
    element.scrollLeft = Math.min(
      600,
      element.scrollWidth - element.clientWidth,
    );
  });
  const before = await scroll.evaluate((element) => element.scrollLeft);
  const startX = geometry.left + geometry.labelWidth + 80;
  const rulerBox = await ruler.boundingBox();
  if (!rulerBox) throw new Error("Timeline ruler is not visible");
  const startY = rulerBox.y + rulerBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const rulerEdgeX = geometry.left + geometry.labelWidth + 1;
  await page.mouse.move(rulerEdgeX, startY);
  const frameAtRulerEdge = await ruler.evaluate((element, x) => {
    const rect = element.getBoundingClientRect();
    const duration = Number(element.getAttribute("data-range-frames"));
    const maxFrame = Number(element.getAttribute("aria-valuemax"));
    return Math.min(
      maxFrame,
      Math.round(((x - rect.left) / rect.width) * duration),
    );
  }, rulerEdgeX);
  await expect
    .poll(() => ruler.getAttribute("aria-valuenow"))
    .toBe(String(frameAtRulerEdge));
  await page.mouse.move(geometry.left + geometry.labelWidth / 2, startY, {
    steps: 1,
  });
  await page.mouse.up();
  const after = await scroll.evaluate((element) => element.scrollLeft);
  const frameAfterLeftDrag = Number(await ruler.getAttribute("aria-valuenow"));
  expect(
    after,
    "dragging over the track controls should scroll left",
  ).toBeLessThan(before);
  expect(
    frameAfterLeftDrag,
    "the playhead should not enter the track controls",
  ).toBe(frameAtRulerEdge);

  await scroll.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const visibleRulerBox = await ruler.boundingBox();
  if (!visibleRulerBox)
    throw new Error("Timeline ruler is not visible at scroll origin");
  await page.mouse.move(visibleRulerBox.x + 150, startY);
  await page.mouse.down();
  await page.mouse.move(geometry.left + geometry.labelWidth / 2, startY, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(ruler).toHaveAttribute("aria-valuenow", "0");
  await zoom.selectOption(originalZoom);
  await scroll.evaluate((element, value) => {
    element.scrollLeft = value;
  }, originalScrollLeft);
  const restoreBox = await ruler.boundingBox();
  if (!restoreBox)
    throw new Error("Timeline ruler is not visible after restoring zoom");
  const restoreRangeFrames = Number(
    await ruler.getAttribute("data-range-frames"),
  );
  const restoreX =
    restoreBox.x +
    (originalFrame / Math.max(1, restoreRangeFrames)) * restoreBox.width;
  await page.mouse.click(restoreX, restoreBox.y + restoreBox.height / 2);
  await expect(ruler).toHaveAttribute("aria-valuenow", String(originalFrame));
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
const videoFixturePath = path.join(audioFixtureDirectory, "flox-smoke.mp4");
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
await execFileAsync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=64x64:r=30",
    "-i",
    audioFixturePath,
    "-t",
    "2",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    videoFixturePath,
  ],
  { windowsHide: true, timeout: 60_000 },
);
let pickerCalls = 0;
let whisperHostAudioPath = "";
let extractedVideoAudio = { start: -1, duration: -1, size: 0 };
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
  transcribeVideoAudio: async (
    videoPath,
    sourceStartSeconds,
    durationSeconds,
  ) =>
    transcribeVideoClipAudio(
      videoPath,
      sourceStartSeconds,
      durationSeconds,
      undefined,
      async (audioPath) => {
        extractedVideoAudio = {
          start: sourceStartSeconds,
          duration: durationSeconds,
          size: (await stat(audioPath)).size,
        };
        return {
          text: "Video audio caption",
          segments: [
            {
              start: 0.2,
              end: 0.7,
              text: "Video audio caption",
              words: [{ start: 0.25, end: 0.6, word: "caption" }],
            },
          ],
        };
      },
    ),
  audioFilePicker: pickAudioFixture,
  mediaFilePicker: async (type) => {
    if (type === "image") return imageFixturePath;
    if (type === "video") return videoFixturePath;
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
  await expect
    .poll(
      async () =>
        (await page.locator(".project").count()) > 0 ||
        (await page.getByText("A CLEAN WORKSPACE").count()) > 0,
      { timeout: 20_000 },
    )
    .toBe(true);
  if ((await page.locator(".project").count()) === 0)
    await expect(
      page.getByText("Create your first video project"),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Create", exact: true }),
  ).toBeVisible();

  const exploreCapabilities = page.getByRole("button", {
    name: "Explore capabilities",
  });
  if ((await exploreCapabilities.count()) > 0) {
    await exploreCapabilities.click();
    await expect(
      page.getByRole("region", { name: "Capabilities explorer" }),
    ).toBeVisible();
    await expect(page.locator(".capability-preview")).toBeVisible();
    await page.getByRole("tab", { name: "Developer / AI" }).click();
    await expect(page.getByText("Public API", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Read docs\// }).click();
    await expect(page.getByLabel("Documentation")).toBeVisible();
    await expect(page.locator(".capability-resource pre")).not.toBeEmpty();
  }

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
      page.getByRole("button", { name: "+ Create", exact: true }),
    ).toBeDisabled();
    console.log(
      "PASS built: empty starter, capability metadata, real preview and docs.",
    );
  } else {
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByRole("button", { name: "+ Create", exact: true }).click();
    await page.getByLabel("Project name").fill(id);
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Composition" }),
    ).toBeVisible();

    const canvasFormat = page.getByLabel("Canvas format", { exact: true });
    await canvasFormat.selectOption("9:16");
    await expect
      .poll(async () => {
        const project = JSON.parse(
          await readFile(path.join(projectPath, "project.json"), "utf8"),
        );
        return [project.width, project.height];
      })
      .toEqual([1080, 1920]);
    await expect
      .poll(() =>
        page
          .locator(".canvas-surface")
          .evaluate((surface) => [
            Number.parseFloat(getComputedStyle(surface).width),
            Number.parseFloat(getComputedStyle(surface).height),
          ]),
      )
      .toEqual([1080, 1920]);
    await canvasFormat.selectOption("21:9");
    await expect
      .poll(async () => {
        const project = JSON.parse(
          await readFile(path.join(projectPath, "project.json"), "utf8"),
        );
        return [project.width, project.height];
      })
      .toEqual([2560, 1080]);
    await canvasFormat.selectOption("16:9");
    await expect
      .poll(async () => {
        const project = JSON.parse(
          await readFile(path.join(projectPath, "project.json"), "utf8"),
        );
        return [project.width, project.height];
      })
      .toEqual([1920, 1080]);

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

    await expect(
      page.getByRole("region", { name: "Project media" }),
    ).toBeVisible();
    const addAudioButton = page.getByRole("button", {
      name: "Add Audio",
      exact: true,
    });
    await expect(addAudioButton).toBeEnabled();
    await addAudioButton.click();
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
    const selectedTimelineSave = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/edit/${id}`) &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await selectedTimelineSave;
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
    const masterVolume = page.getByLabel("Application preview volume");
    const originalMasterVolume = Number(await masterVolume.inputValue());
    const volumeStep = originalMasterVolume >= 0.01 ? -0.01 : 0.01;
    const expectedMasterVolume =
      Math.round((originalMasterVolume + volumeStep) * 100) / 100;
    await masterVolume.focus();
    await page.keyboard.press(volumeStep < 0 ? "ArrowLeft" : "ArrowRight");
    await expect(masterVolume).toHaveValue(String(expectedMasterVolume));
    await expect
      .poll(() =>
        soundtrackPreview
          .locator("[data-preview-master-volume]")
          .getAttribute("data-preview-master-volume"),
      )
      .toBe(String(expectedMasterVolume));
    await page.keyboard.press(volumeStep < 0 ? "ArrowRight" : "ArrowLeft");

    await page.getByRole("button", { name: "Add audio track" }).click();
    const audioRows = page.locator(".track-row.is-audio-track");
    await expect(audioRows).toHaveCount(2);
    const secondAudioRow = audioRows.last();
    await secondAudioRow.scrollIntoViewIfNeeded();
    const secondAudioBox = await secondAudioRow.boundingBox();
    const soundtrackBox = await dockedSoundtrack.boundingBox();
    expect(secondAudioBox).toBeTruthy();
    expect(soundtrackBox).toBeTruthy();
    await page.mouse.move(
      soundtrackBox!.x + soundtrackBox!.width / 2,
      soundtrackBox!.y + soundtrackBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      soundtrackBox!.x + soundtrackBox!.width / 2,
      secondAudioBox!.y + secondAudioBox!.height / 2,
      { steps: 5 },
    );
    await expect(secondAudioRow).toHaveClass(/is-drop-target/);
    await page.mouse.up();
    await expect(secondAudioRow.locator(".audio-clip")).toHaveCount(1);
    await dockedSoundtrack.click();
    await page.locator('select[aria-label="Audio track"]').selectOption({
      label: "Audio",
    });
    await expect(audioRows.first().locator(".audio-clip")).toHaveCount(1);
    await expect(secondAudioRow.locator(".audio-clip")).toHaveCount(0);
    await page.locator('select[aria-label="Audio track"]').selectOption({
      label: "Audio 2",
    });
    await expect(secondAudioRow.locator(".audio-clip")).toHaveCount(1);
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
    await dockedSoundtrack.click();
    await page.getByRole("button", { name: "Delete audio" }).click();
    await expect(page.locator(".timeline-clip.audio-clip")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".timeline-clip.audio-clip")).toHaveCount(1);
    await dockedSoundtrack.click();
    await page.getByRole("button", { name: "Delete audio" }).click();
    await expect(page.locator(".timeline-clip.audio-clip")).toHaveCount(0);
    const deletedAudioRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith(`/api/edit/${id}`) && request.method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    const saveRequest = await deletedAudioRequest;
    const submittedTimeline = saveRequest.postDataJSON().timeline;
    expect(
      submittedTimeline.clips.some(
        (clip: { componentId: string }) => clip.componentId === "soundtrack",
      ),
    ).toBe(false);
    const deletedAudioResponse = await saveRequest.response();
    expect(deletedAudioResponse?.ok()).toBe(true);
    const deletedAudioProject = JSON.parse(
      await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"),
    );
    expect(
      deletedAudioProject.clips.some(
        (clip: { componentId: string }) => clip.componentId === "soundtrack",
      ),
    ).toBe(false);
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

    await page.getByRole("button", { name: "Add Audio", exact: true }).click();
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
    await expect(
      page.locator(".media-panel-sidebar [role='alert']"),
    ).toContainText("CONFLICT: The media registry changed");
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
    await expect(
      page.locator(".media-panel-sidebar .media-notice[role='status']"),
    ).toContainText("The original file was not deleted");
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
    await expect(
      page.locator(".media-panel-sidebar [role='alert']"),
    ).toContainText(/JSON|property/i);
    expect(await readFile(mediaFile, "utf8")).toBe("{invalid registry");
    const repairedTemporaryFile = `${mediaFile}.repair-tmp`;
    await writeFile(repairedTemporaryFile, agentValidContents, { flag: "wx" });
    await rename(repairedTemporaryFile, mediaFile);
    await expect(
      page.locator(".media-panel-sidebar [role='alert']"),
    ).toHaveCount(0);

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
    await verifyTimelinePlayheadLeftBoundary(page);
    await verifyTimelineZoom(page);
    await page.getByRole("button", { name: "Add subtitle" }).click();
    await expect(
      page.getByRole("button", { name: /^Clip subtitle-/ }),
    ).toBeVisible();
    const firstSubtitleClip = page
      .locator(".timeline-clip.subtitle-clip")
      .first();
    await expect(firstSubtitleClip.locator(".resize-handle")).toHaveCount(2);
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
    const subtitleClips = page.locator(".timeline-clip.subtitle-clip");
    await expect(subtitleClips.last().locator(".resize-handle")).toHaveCount(2);
    await expect(subtitleClips.first().locator(".resize-handle")).toHaveCount(
      0,
    );
    const lastVisualClipEnd = await page
      .locator(".timeline-clip:not(.audio-clip)")
      .evaluateAll((elements) =>
        Math.max(
          ...elements.map((element) =>
            Number(element.getAttribute("data-end-frame")),
          ),
        ),
      );
    await setFrameFromUiTime(
      page,
      "Playhead time (seconds)",
      lastVisualClipEnd - 2,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() => readFrameFromUiTime(page, "Playhead time (seconds)"))
      .toBeGreaterThanOrEqual(lastVisualClipEnd - 2);
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() => readFrameFromUiTime(page, "Playhead time (seconds)"))
      .toBeLessThan(5);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const review = page.locator(".timeline-review");
    await expect(review.locator("summary")).toContainText("gap");
    await expect(review).not.toHaveAttribute("open");
    await review.locator("summary").click();
    await expect(
      review.getByText(/(?:Long empty visual interval|Empty visual interval):/),
    ).toBeVisible();
    const warningRows = review.locator("li");
    const warningCount = await warningRows.count();
    await review
      .getByRole("button", { name: /^Locate / })
      .last()
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      "New subtitle",
    );
    await warningRows
      .first()
      .getByRole("button", {
        name: "Dismiss empty visual interval warning",
      })
      .click();
    await expect(warningRows).toHaveCount(warningCount - 1);
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
    await page
      .getByRole("button", { name: "Use as soundtrack", exact: true })
      .click();
    await expect(page.locator(".timeline-clip.audio-clip")).toHaveCount(1);
    const soundtrackTrackId = await page
      .locator(".audio-clip")
      .evaluate((element) => element.parentElement?.getAttribute("data-track"));
    const generatedCaptionTrackId = await page
      .locator(".timeline-clip.subtitle-clip")
      .first()
      .evaluate((element) => element.parentElement?.getAttribute("data-track"));
    expect(generatedCaptionTrackId).not.toBe(soundtrackTrackId);
    await page.locator(".timeline-clip.subtitle-clip").first().click();
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    const preview = page.frameLocator('[data-panel-id="editor"] iframe');
    await expect
      .poll(async () =>
        preview
          .locator("[data-preview-master-volume]")
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(0);
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
    await timelineScroll.evaluate((viewport, clipId) => {
      const clip = viewport.querySelector<HTMLElement>(
        `[data-clip-id="${CSS.escape(clipId)}"]`,
      );
      if (!clip) throw new Error("Detached Timeline clip is not rendered.");
      const viewportRect = viewport.getBoundingClientRect();
      const clipRect = clip.getBoundingClientRect();
      const clipCenter = clipRect.left + clipRect.width / 2;
      const viewportCenter = viewportRect.left + viewport.clientWidth / 2;
      const before = {
        scrollLeft: viewport.scrollLeft,
        scrollWidth: viewport.scrollWidth,
        clientWidth: viewport.clientWidth,
        clipLeft: clipRect.left,
        clipRight: clipRect.right,
        viewportLeft: viewportRect.left,
        viewportRight: viewportRect.right,
      };
      viewport.scrollLeft += clipCenter - viewportCenter;
      return {
        before,
        scrollLeft: viewport.scrollLeft,
        clipLeft: clip.getBoundingClientRect().left,
      };
    }, detachedClipId!);
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
    const edgeDragStart = {
      x: Math.max(
        timelineViewport!.x + 128,
        edgeClipBox!.x + Math.min(edgeClipBox!.width / 2, 24),
      ),
      y: edgeClipBox!.y + edgeClipBox!.height / 2,
    };
    expect(edgeDragStart.x).toBeGreaterThanOrEqual(timelineViewport!.x);
    expect(edgeDragStart.x).toBeLessThan(
      timelineViewport!.x + timelineViewport!.width,
    );
    await detachedPage!.mouse.move(edgeDragStart.x, edgeDragStart.y);
    await detachedPage!.mouse.down();
    await expect(detachedPage!.locator(".timeline-dock")).toHaveAttribute(
      "data-drag-active",
      "true",
    );
    await detachedPage!.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const scrollBeforeEdgeMove = await timelineScroll.evaluate(
      (element) => element.scrollLeft,
    );
    const edgeTarget = await timelineScroll.evaluate(
      (element, rowCenterY) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.right - 4, y: rowCenterY };
      },
      edgeClipBox!.y + edgeClipBox!.height / 2,
    );
    await detachedPage!.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 8 });
    await expect
      .poll(() =>
        detachedPage!
          .locator(".timeline-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(scrollBeforeEdgeMove);
    await expect
      .poll(async () => (await readClipFrameRange(detachedClip))[0])
      .toBeGreaterThan(0);
    await detachedPage!.waitForTimeout(6500);
    await detachedPage!.mouse.up();
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
    await expect(
      detachedPage!.locator(".detached-timeline-window"),
    ).not.toHaveAttribute("data-command-busy", "true", { timeout: 20_000 });
    await expect(detachedClip.locator("small")).toHaveText(rangeBeforeEdgeDrag);
    await expect
      .poll(() =>
        detachedPage!.locator(".time-ruler").getAttribute("aria-valuemax"),
      )
      .toBe(String(durationBeforeEdgeDrag - 1));
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(
      detachedPage!.locator(".detached-timeline-window"),
    ).not.toHaveAttribute("data-command-busy", "true", { timeout: 20_000 });
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
    await detachedPage!
      .getByLabel("Timeline zoom", { exact: true })
      .selectOption("4");
    await detachedPage!
      .getByRole("button", { name: "Fit Timeline", exact: true })
      .click();
    await expect(detachedPage!.locator(".timeline-canvas")).toHaveAttribute(
      "data-timeline-zoom",
      "1",
    );
    const fittedTimeline = await detachedPage!
      .locator(".timeline-canvas")
      .evaluate((canvas) => ({
        canvasWidth: canvas.getBoundingClientRect().width,
        viewportWidth: canvas.closest(".timeline-scroll")!.clientWidth,
        duration: Number(
          canvas.getAttribute("data-timeline-duration-in-frames"),
        ),
      }));
    expect(fittedTimeline.duration).toBeGreaterThanOrEqual(
      durationAfterEdgeDrag,
    );
    expect(fittedTimeline.canvasWidth).toBeLessThanOrEqual(
      fittedTimeline.viewportWidth + 12,
    );

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
    for (let index = 0; index < 2; index++) {
      await detachedPage!
        .locator(".timeline-actions")
        .getByRole("button", { name: "Add visual track", exact: true })
        .click();
      await expect(
        detachedPage!.locator(".detached-timeline-window"),
      ).not.toHaveAttribute("data-command-busy", "true");
    }
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
      "6 tracks",
    );
    const verticalMove = await detachedPage!
      .locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`)
      .evaluate((clip) => {
        const sourceLane = clip.closest<HTMLElement>(".track-lane")!;
        const targetRow = Array.from(
          document.querySelectorAll<HTMLElement>(".track-row.is-visual-track"),
        ).find((row) => row.dataset.trackRow !== sourceLane.dataset.track)!;
        const targetLane = targetRow.querySelector<HTMLElement>(".track-lane")!;
        const clipRect = clip.getBoundingClientRect();
        const laneRect = targetLane.getBoundingClientRect();
        return {
          sourceTrackId: sourceLane.dataset.track,
          targetTrackId: targetLane.dataset.track,
          x: Math.max(
            laneRect.left + 12,
            Math.min(clipRect.left + clipRect.width / 2, laneRect.right - 12),
          ),
          sourceY: clipRect.top + clipRect.height / 2,
          targetY: laneRect.top + laneRect.height / 2,
          targetTrackName:
            targetRow.querySelector(".track-name")?.textContent ?? "",
        };
      });
    await detachedPage!.mouse.move(verticalMove.x, verticalMove.sourceY);
    await detachedPage!.mouse.down();
    await detachedPage!.mouse.move(verticalMove.x, verticalMove.targetY, {
      steps: 5,
    });
    await detachedPage!.mouse.up();
    await expect
      .poll(() =>
        detachedPage!
          .locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`)
          .evaluate(
            (clip) => clip.closest<HTMLElement>(".track-lane")?.dataset.track,
          ),
      )
      .toBe(verticalMove.targetTrackId);
    await detachedPage!
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(
      detachedPage!.locator(".detached-timeline-window"),
    ).not.toHaveAttribute("data-command-busy", "true", { timeout: 20_000 });
    await expect
      .poll(() =>
        detachedPage!
          .locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`)
          .evaluate(
            (clip) => clip.closest<HTMLElement>(".track-lane")?.dataset.track,
          ),
      )
      .toBe(verticalMove.sourceTrackId);
    await detachedPage!
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await expect(
      detachedPage!.locator(".detached-timeline-window"),
    ).not.toHaveAttribute("data-command-busy", "true", { timeout: 20_000 });
    await expect
      .poll(() =>
        detachedPage!
          .locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`)
          .evaluate(
            (clip) => clip.closest<HTMLElement>(".track-lane")?.dataset.track,
          ),
      )
      .toBe(verticalMove.targetTrackId);
    const movedSubtitlePreview = preview.locator(
      `[data-subtitle-id="${detachedClipId}"]`,
    );
    const [movedSubtitleStart] = await readClipFrameRange(
      detachedPage!.locator(`.timeline-clip[data-clip-id="${detachedClipId}"]`),
    );
    await setFrameFromUiTime(
      page,
      "Playhead time (seconds)",
      movedSubtitleStart,
    );
    await expect(movedSubtitlePreview).toBeVisible();
    await detachedPage!
      .getByRole("button", {
        name: `Hide ${verticalMove.targetTrackName}`,
        exact: true,
      })
      .click();
    await expect(movedSubtitlePreview).toHaveCount(0);
    await detachedPage!
      .getByRole("button", {
        name: `Show ${verticalMove.targetTrackName}`,
        exact: true,
      })
      .click();
    await expect(movedSubtitlePreview).toBeVisible();
    await detachedPage!
      .getByRole("button", {
        name: `Lock ${verticalMove.targetTrackName}`,
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toBeDisabled();
    await detachedPage!
      .getByRole("button", {
        name: `Unlock ${verticalMove.targetTrackName}`,
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Text", { exact: true })).toBeEnabled();
    for (let index = 0; index < 10; index++) {
      await detachedPage!
        .locator(".timeline-actions")
        .getByRole("button", { name: "Add visual track", exact: true })
        .click();
      await expect(
        detachedPage!.locator(".detached-timeline-window"),
      ).not.toHaveAttribute("data-command-busy", "true");
    }
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
      "16 tracks",
    );
    const detachedTimelineScroll = detachedPage!.locator(".timeline-scroll");
    await detachedTimelineScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const stickyRuler = await detachedPage!
      .locator(".ruler-row")
      .evaluate((row) => {
        const scroll = row.closest(".timeline-scroll")!;
        return {
          rowTop: row.getBoundingClientRect().top,
          scrollTop: scroll.getBoundingClientRect().top,
          scrollBottom: scroll.getBoundingClientRect().bottom,
        };
      });
    expect(stickyRuler.rowTop).toBeGreaterThanOrEqual(
      stickyRuler.scrollTop - 1,
    );
    expect(stickyRuler.rowTop).toBeLessThan(stickyRuler.scrollBottom);
    for (let index = 0; index < 10; index++) {
      await detachedPage!
        .getByRole("button", { name: "Undo", exact: true })
        .click();
      await expect(
        detachedPage!.locator(".detached-timeline-window"),
      ).not.toHaveAttribute("data-command-busy", "true");
      await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
        `${15 - index} tracks`,
      );
    }
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
      "6 tracks",
    );
    await detachedPage!
      .locator(".timeline-actions")
      .getByRole("button", { name: "Add visual track", exact: true })
      .focus();
    await detachedPage!.keyboard.press("Space");
    await expect(
      detachedPage!.getByRole("button", { name: /Pause/ }),
    ).toBeVisible();
    await detachedPage!.keyboard.press("Space");
    await expect(
      detachedPage!.getByRole("button", { name: /Play/ }),
    ).toBeVisible();
    await expect(detachedPage!.locator(".timeline-actions h3")).toContainText(
      "6 tracks",
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
    // Earlier track visibility checks seek to the moved subtitle so its Canvas
    // rendering can be asserted. Restore a known playhead before Attach so the
    // lifecycle assertion below verifies preservation rather than that seek.
    await setFrameFromUiTime(
      detachedPage!,
      "Timeline playhead time (seconds)",
      90,
    );
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
      "Visual 4",
      "Visual 3",
      "Captions",
      "Visuals",
      "Audio",
      "Audio 2",
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
    await page
      .getByRole("button", { name: "Capabilities", exact: true })
      .click();
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
      await expect.poll(() => buttons.count()).toBeGreaterThanOrEqual(3);
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
    await expect(inspectorText).toHaveValue("AI editable title");
    await expect(textPreview).toHaveText("AI editable title");
    await inspectorText.focus();
    await page.keyboard.press("Space");
    await expect(inspectorText).toHaveValue("AI editable title ");
    await inspectorText.fill("AI editable title");
    await page.getByRole("button", { name: "Play", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
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
    const canvasBounds = await page
      .getByTestId("canvas-interaction-layer")
      .boundingBox();
    expect(canvasBounds).toBeTruthy();
    const dragStart = await findCanvasHitPoint(textHitbox);
    expect(dragStart).toBeTruthy();
    await page.mouse.move(
      dragStart!.x,
      dragStart!.y,
    );
    await page.mouse.down();
    await page.mouse.move(
      dragStart!.x - 36,
      dragStart!.y + 10,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Position X (%)").inputValue()),
      )
      .toBeLessThan(68);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Position X (%)")).toHaveValue("68");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Position X (%)").inputValue()),
      )
      .toBeLessThan(68);
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
    const subtitlePreview = page
      .frameLocator('[data-panel-id="editor"] iframe')
      .locator(`[data-subtitle-id="${subtitleClipId}"]`);
    await subtitleHitbox.click({ modifiers: ["Shift"] });
    await expect(
      page.getByText("2 elements selected", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".timeline-clip.is-selected")).toHaveCount(2);

    const groupedClips = page.locator(".timeline-clip.is-selected");
    const groupedStartsBefore = await groupedClips.evaluateAll((clips) =>
      clips.map((clip) => Number(clip.getAttribute("data-from-frame"))),
    );
    const groupedDragBox = await groupedClips.first().boundingBox();
    expect(groupedDragBox).toBeTruthy();
    await page.mouse.move(
      groupedDragBox!.x + groupedDragBox!.width / 2,
      groupedDragBox!.y + groupedDragBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      groupedDragBox!.x + groupedDragBox!.width / 2 + 45,
      groupedDragBox!.y + groupedDragBox!.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect(page.locator(".timeline-clip.is-selected")).toHaveCount(2);
    const groupedStartsAfter = await groupedClips.evaluateAll((clips) =>
      clips.map((clip) => Number(clip.getAttribute("data-from-frame"))),
    );
    expect(groupedStartsAfter[0]).toBeGreaterThan(groupedStartsBefore[0]);
    expect(groupedStartsAfter[1] - groupedStartsBefore[1]).toBe(
      groupedStartsAfter[0] - groupedStartsBefore[0],
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(() =>
        groupedClips.evaluateAll((clips) =>
          clips.map((clip) => Number(clip.getAttribute("data-from-frame"))),
        ),
      )
      .toEqual(groupedStartsBefore);

    // Rotation uses rendered Canvas geometry and must keep the full selection.
    await textHitbox.click();
    await page.getByLabel("Anchor", { exact: true }).selectOption("top-left");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("25");
    const rotatedSingleBounds = await page
      .getByTestId("canvas-selection-bounds")
      .boundingBox();
    const rotatedSingleHitbox = await textHitbox.boundingBox();
    expect(rotatedSingleBounds).toBeTruthy();
    expect(rotatedSingleHitbox).toBeTruthy();
    expect(rotatedSingleBounds!.x).toBeCloseTo(rotatedSingleHitbox!.x, 0);
    expect(rotatedSingleBounds!.y).toBeCloseTo(rotatedSingleHitbox!.y, 0);
    expect(rotatedSingleBounds!.width).toBeCloseTo(
      rotatedSingleHitbox!.width,
      0,
    );
    expect(rotatedSingleBounds!.height).toBeCloseTo(
      rotatedSingleHitbox!.height,
      0,
    );
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
    expect(rotationHandle!.width).toBeGreaterThanOrEqual(24);
    expect(rotationHandle!.height).toBeGreaterThanOrEqual(24);
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
    const textPreviewStyleBefore = await textPreview.evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      inlineTransform: (element as HTMLElement).style.transform,
    }));
    const subtitleCanvasTransformBefore = await subtitleHitbox.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    const subtitlePreviewTransformBefore = await subtitlePreview.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    const rotationRadius = Math.max(24, selectedBounds!.height / 2);
    await page.mouse.move(rotationStart.x, rotationStart.y);
    await page.mouse.down();
    await page.mouse.move(rotationCenter.x + rotationRadius, rotationCenter.y, {
      steps: 5,
    });
    await page.mouse.up();
    expect(textPreviewStyleBefore.transform).not.toBe("none");
    expect(textPreviewStyleBefore.inlineTransform).not.toBe("");
    await expect
      .poll(async () => {
        return textHitbox.evaluate(
          (element) => getComputedStyle(element).transform,
        );
      })
      .not.toBe(textCanvasTransformBefore);
    await expect
      .poll(async () =>
        textPreview.evaluate((element) => ({
          transform: getComputedStyle(element).transform,
          inlineTransform: (element as HTMLElement).style.transform,
        })),
      )
      .not.toEqual(textPreviewStyleBefore);
    await expect
      .poll(async () => {
        return subtitleHitbox.evaluate(
          (element) => getComputedStyle(element).transform,
        );
      })
      .not.toBe(subtitleCanvasTransformBefore);
    expect(subtitlePreviewTransformBefore).not.toBe("none");
    await expect
      .poll(async () =>
        subtitlePreview.evaluate(
          (element) => getComputedStyle(element).transform,
        ),
      )
      .not.toBe(subtitlePreviewTransformBefore);

    await textHitbox.click();
    await page.getByLabel("Anchor", { exact: true }).selectOption("center");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("0");
    await page.getByLabel("Position X (%)", { exact: true }).fill("50");
    await page.getByLabel("Position Y (%)", { exact: true }).fill("50");
    await page.getByLabel("Text box width (%)", { exact: true }).fill("40");
    await page.getByLabel("Text box height (%)", { exact: true }).fill("20");
    await expect(textHitbox).toHaveAttribute("aria-pressed", "true");
    const canvasClipCount = await page
      .locator(".timeline-clip:not(.audio-clip)")
      .count();
    const canvasSourcePositionX = Number(
      await page.getByLabel("Position X (%)", { exact: true }).inputValue(),
    );
    const duplicateDragStart = await findCanvasHitPoint(textHitbox);
    expect(duplicateDragStart).toBeTruthy();
    await page.keyboard.down("Control");
    await page.mouse.move(
      duplicateDragStart!.x,
      duplicateDragStart!.y,
    );
    await page.mouse.down();
    await page.mouse.move(
      duplicateDragStart!.x + 42,
      duplicateDragStart!.y + 8,
      { steps: 4 },
    );
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      canvasClipCount + 1,
    );
    await expect
      .poll(async () =>
        Number(
          await page.getByLabel("Position X (%)", { exact: true }).inputValue(),
        ),
      )
      .toBeGreaterThan(canvasSourcePositionX);
    const undoCanvasDuplicate = page.getByRole("button", {
      name: "Undo",
      exact: true,
    });
    await expect(undoCanvasDuplicate).toBeEnabled();
    await undoCanvasDuplicate.click();
    await expect(page.locator(".timeline-clip:not(.audio-clip)")).toHaveCount(
      canvasClipCount,
    );
    await textHitbox.click();

    const positionXBeforeShift = Number(
      await page.getByLabel("Position X (%)", { exact: true }).inputValue(),
    );
    const positionYBeforeShift = Number(
      await page.getByLabel("Position Y (%)", { exact: true }).inputValue(),
    );
    const shiftDragStart = await findCanvasHitPoint(textHitbox);
    expect(shiftDragStart).toBeTruthy();
    await page.keyboard.down("Shift");
    await page.mouse.move(
      shiftDragStart!.x,
      shiftDragStart!.y,
    );
    await page.mouse.down();
    await page.mouse.move(
      shiftDragStart!.x + 10,
      shiftDragStart!.y + 4,
    );
    await page.mouse.move(
      shiftDragStart!.x + 15,
      shiftDragStart!.y + 24,
    );
    await expect
      .poll(async () =>
        Number(
          await page.getByLabel("Position Y (%)", { exact: true }).inputValue(),
        ),
      )
      .toBe(positionYBeforeShift);
    await page.mouse.move(
      shiftDragStart!.x + 36,
      shiftDragStart!.y + 25,
      { steps: 2 },
    );
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect
      .poll(async () =>
        Number(
          await page.getByLabel("Position X (%)", { exact: true }).inputValue(),
        ),
      )
      .toBeGreaterThan(positionXBeforeShift);
    await expect(
      page.getByLabel("Position Y (%)", { exact: true }),
    ).toHaveValue(String(positionYBeforeShift));
    await page.getByRole("button", { name: "Undo", exact: true }).click();

    const fontSizeBeforeCanvasResize = Number(
      await page.getByLabel("Font size", { exact: true }).inputValue(),
    );
    const previewFontSizeBeforeCanvasResize = await textPreview.evaluate(
      (element) => getComputedStyle(element).fontSize,
    );
    const textResizeHandle = await page
      .getByRole("button", { name: "Resize selection right bottom" })
      .boundingBox();
    expect(textResizeHandle).toBeTruthy();
    await page.mouse.move(
      textResizeHandle!.x + textResizeHandle!.width / 2,
      textResizeHandle!.y + textResizeHandle!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      textResizeHandle!.x + textResizeHandle!.width / 2 + 30,
      textResizeHandle!.y + textResizeHandle!.height / 2 + 16,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Number(
          await page.getByLabel("Font size", { exact: true }).inputValue(),
        ),
      )
      .toBeGreaterThan(fontSizeBeforeCanvasResize);
    await expect
      .poll(async () =>
        textPreview.evaluate((element) => getComputedStyle(element).fontSize),
      )
      .not.toBe(previewFontSizeBeforeCanvasResize);
    const enlargedFontSize = Number(
      await page.getByLabel("Font size", { exact: true }).inputValue(),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Font size", { exact: true })).toHaveValue(
      String(fontSizeBeforeCanvasResize),
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Font size", { exact: true })).toHaveValue(
      String(enlargedFontSize),
    );
    await page.getByLabel("Anchor", { exact: true }).selectOption("center");
    await page.getByLabel("Rotation (°)", { exact: true }).fill("0");
    await page.getByLabel("Position X (%)", { exact: true }).fill("68");
    await page.getByLabel("Position Y (%)", { exact: true }).fill("24");
    await page.getByLabel("Text box width (%)", { exact: true }).fill("80");
    await page.getByLabel("Text box height (%)", { exact: true }).fill("20");
    await page.getByLabel("Font size", { exact: true }).fill("84");
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
    const imageThumbnail = imageAsset.locator("img");
    await expect(imageThumbnail).toBeVisible();
    await expect
      .poll(() =>
        imageThumbnail.evaluate(
          (image: HTMLImageElement) => image.naturalWidth,
        ),
      )
      .toBeGreaterThan(0);
    const thumbnailResponse = await fetch(
      new URL(`/api/media/${thirdId}/assets/${imageId}/thumbnail`, servers.url),
    );
    expect(thumbnailResponse.status).toBe(200);
    expect(thumbnailResponse.headers.get("content-type")).toContain(
      "image/png",
    );
    expect(Buffer.from(await thumbnailResponse.arrayBuffer())).toEqual(
      await readFile(imageFixturePath),
    );
    const audioThumbnailResponse = await fetch(
      new URL(
        `/api/media/${id}/assets/${registeredMedia.assets[0].id}/thumbnail`,
        servers.url,
      ),
    );
    expect(audioThumbnailResponse.status).toBe(422);

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

    // Verify actual Image Canvas dragging at a size with a usable interior
    // hit area, then restore the saved test project before later geometry
    // checks for the compact image bounds.
    await imageInspectorX.fill("50");
    await imageInspectorY.fill("50");
    await imageInspectorWidth.fill("70");
    await imageInspectorHeight.fill("60");
    const imageDragStart = await findCanvasHitPoint(imageHitbox);
    expect(imageDragStart).toBeTruthy();
    await page.mouse.move(imageDragStart!.x, imageDragStart!.y);
    await page.mouse.down();
    await page.mouse.move(imageDragStart!.x + 48, imageDragStart!.y + 12, {
      steps: 4,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await imageInspectorX.inputValue()))
      .toBeGreaterThan(50);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(imageInspectorX).toHaveValue("50");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(async () => Number(await imageInspectorX.inputValue()))
      .toBeGreaterThan(50);
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(imageInspectorX).toHaveValue("15");
    await expect(imageInspectorY).toHaveValue("70");
    await expect(imageInspectorWidth).toHaveValue("24");
    await expect(imageInspectorHeight).toHaveValue("20");
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();

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
    await page.getByLabel("Position X (%)", { exact: true }).fill("50");
    await page.getByLabel("Position Y (%)", { exact: true }).fill("50");
    await imageInspectorWidth.fill("80");
    await imageInspectorHeight.fill("80");
    await page.getByLabel("Image fit", { exact: true }).selectOption("contain");
    const containedImageBox = await imagePreview.boundingBox();
    expect(containedImageBox).toBeTruthy();
    const containedImageRatio = await imagePreview.evaluate((element) => {
      const image = element as HTMLImageElement;
      return image.naturalWidth / image.naturalHeight;
    });
    const containedWidth =
      containedImageBox!.width / containedImageBox!.height > containedImageRatio
        ? containedImageBox!.height * containedImageRatio
        : containedImageBox!.width;
    const containedHeight =
      containedImageBox!.width / containedImageBox!.height > containedImageRatio
        ? containedImageBox!.height
        : containedImageBox!.width / containedImageRatio;
    const containedImagePixels = {
      x: containedImageBox!.x + (containedImageBox!.width - containedWidth) / 2,
      y:
        containedImageBox!.y +
        (containedImageBox!.height - containedHeight) / 2,
      width: containedWidth,
      height: containedHeight,
    };
    const visibleImageSelection = await page
      .getByTestId("canvas-selection-bounds")
      .boundingBox();
    expect(visibleImageSelection).toBeTruthy();
    expect(
      Math.abs(visibleImageSelection!.x - containedImagePixels.x),
    ).toBeLessThan(3);
    expect(
      Math.abs(visibleImageSelection!.y - containedImagePixels.y),
    ).toBeLessThan(3);
    expect(
      Math.abs(visibleImageSelection!.width - containedImagePixels.width),
    ).toBeLessThan(3);
    expect(
      Math.abs(visibleImageSelection!.height - containedImagePixels.height),
    ).toBeLessThan(3);
    const containWidthBeforeResize = Number(
      await imageInspectorWidth.inputValue(),
    );
    const containHeightBeforeResize = Number(
      await imageInspectorHeight.inputValue(),
    );
    const containRightHandle = page.getByRole("button", {
      name: "Resize selection right center",
    });
    const containRightHandleBox = await containRightHandle.boundingBox();
    expect(containRightHandleBox).toBeTruthy();
    await page.keyboard.down("Shift");
    await page.mouse.move(
      containRightHandleBox!.x + containRightHandleBox!.width / 2,
      containRightHandleBox!.y + containRightHandleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      containRightHandleBox!.x + containRightHandleBox!.width / 2 + 20,
      containRightHandleBox!.y + containRightHandleBox!.height / 2,
      { steps: 3 },
    );
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect
      .poll(async () => Number(await imageInspectorWidth.inputValue()))
      .toBeGreaterThan(containWidthBeforeResize);
    await expect
      .poll(async () => Number(await imageInspectorHeight.inputValue()))
      .toBeGreaterThan(containHeightBeforeResize);
    const containResizedWidth = Number(await imageInspectorWidth.inputValue());
    const containResizedHeight = Number(
      await imageInspectorHeight.inputValue(),
    );
    expect(
      Math.abs(
        containResizedWidth / containResizedHeight -
          containWidthBeforeResize / containHeightBeforeResize,
      ),
    ).toBeLessThan(0.02);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(imageInspectorWidth).toHaveValue(
      String(containWidthBeforeResize),
    );
    await expect(imageInspectorHeight).toHaveValue(
      String(containHeightBeforeResize),
    );
    await page.getByLabel("Image fit", { exact: true }).selectOption("fill");
    await imageInspectorWidth.fill("24");
    await imageInspectorHeight.fill("20");

    const imageWidthBeforeSideResize = Number(
      await imageInspectorWidth.inputValue(),
    );
    const imageHeightBeforeSideResize = Number(
      await imageInspectorHeight.inputValue(),
    );
    const rightImageHandle = page.getByRole("button", {
      name: "Resize selection right center",
    });
    const rightImageHandleBox = await rightImageHandle.boundingBox();
    expect(rightImageHandleBox).toBeTruthy();
    await page.mouse.move(
      rightImageHandleBox!.x + rightImageHandleBox!.width / 2,
      rightImageHandleBox!.y + rightImageHandleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rightImageHandleBox!.x + rightImageHandleBox!.width / 2 + 26,
      rightImageHandleBox!.y + rightImageHandleBox!.height / 2,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => Number(await imageInspectorWidth.inputValue()))
      .toBeGreaterThan(imageWidthBeforeSideResize);
    await expect(imageInspectorHeight).toHaveValue(
      String(imageHeightBeforeSideResize),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();

    const beforeProportionalResize = {
      width: Number(await imageInspectorWidth.inputValue()),
      height: Number(await imageInspectorHeight.inputValue()),
    };
    const proportionalHandle = page.getByRole("button", {
      name: "Resize selection right bottom",
    });
    const proportionalHandleBox = await proportionalHandle.boundingBox();
    expect(proportionalHandleBox).toBeTruthy();
    await page.keyboard.down("Shift");
    await page.mouse.move(
      proportionalHandleBox!.x + proportionalHandleBox!.width / 2,
      proportionalHandleBox!.y + proportionalHandleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      proportionalHandleBox!.x + proportionalHandleBox!.width / 2 + 24,
      proportionalHandleBox!.y + proportionalHandleBox!.height / 2 + 18,
      { steps: 3 },
    );
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect
      .poll(async () => Number(await imageInspectorWidth.inputValue()))
      .toBeGreaterThan(beforeProportionalResize.width);
    await expect
      .poll(async () => Number(await imageInspectorHeight.inputValue()))
      .toBeGreaterThan(beforeProportionalResize.height);
    const proportionalWidth = Number(await imageInspectorWidth.inputValue());
    const proportionalHeight = Number(await imageInspectorHeight.inputValue());
    expect(
      Math.abs(
        proportionalWidth / proportionalHeight -
          beforeProportionalResize.width / beforeProportionalResize.height,
      ),
    ).toBeLessThan(0.02);
    await expect
      .poll(async () => Number(await imageInspectorX.inputValue()))
      .toBeGreaterThan(50);
    await expect
      .poll(async () => Number(await imageInspectorY.inputValue()))
      .toBeGreaterThan(50);
    await page.getByRole("button", { name: "Undo", exact: true }).click();

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
    const pausePlayback = page.getByRole("button", { name: "Pause" });
    if (await pausePlayback.isVisible()) await pausePlayback.click();
    // The image starts just after the initial 2-second playhead frame.
    await setFrameFromUiTime(page, "Playhead time (seconds)", 2.5 * 30);
    await expect(imagePreview).toBeVisible();
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

    // Registered MP4 media becomes a canonical, independently editable Video
    // clip, using the same Canvas transform and Timeline range controls.
    await page.getByRole("button", { name: "Add Video", exact: true }).click();
    const videoAsset = page
      .getByRole("listitem")
      .filter({ hasText: "flox-smoke" })
      .filter({ hasText: "VIDEO" });
    await expect(
      videoAsset.getByText("Available", { exact: true }),
    ).toBeVisible();
    const videoAssetText = await videoAsset.locator("small").innerText();
    const videoAssetId = videoAssetText.split("·").at(-1)?.trim();
    expect(videoAssetId).toMatch(/^video-[a-f0-9-]{36}$/);
    const videoProbeResponse = await fetch(
      new URL(
        `/api/media/${thirdId}/assets/${videoAssetId}/video`,
        servers.url,
      ),
    );
    expect(videoProbeResponse.status).toBe(200);
    expect(await videoProbeResponse.json()).toMatchObject({
      assetId: videoAssetId,
      width: 64,
      height: 64,
      hasAudio: true,
    });
    const videoStreamResponse = await fetch(
      new URL(
        `/api/media/${thirdId}/assets/${videoAssetId}/stream`,
        servers.previewOrigin,
      ),
      { headers: { Range: "bytes=0-11" } },
    );
    expect(videoStreamResponse.status).toBe(206);
    expect(videoStreamResponse.headers.get("content-type")).toContain(
      "video/mp4",
    );
    expect(
      Buffer.from(await videoStreamResponse.arrayBuffer()).toString(
        "ascii",
        4,
        8,
      ),
    ).toBe("ftyp");

    await setFrameFromUiTime(page, "Playhead time (seconds)", 180);
    await expect(page.getByTestId("frame-readout")).toContainText("180 /");
    await videoAsset
      .getByRole("button", { name: /Add .* to Timeline/ })
      .click();
    const videoClip = page.locator(
      '.timeline-clip[data-clip-id^="video-"]:not([data-clip-id^="video-audio-"])',
    );
    await expect(videoClip).toBeVisible();
    const videoClipId = await videoClip.getAttribute("data-clip-id");
    expect(videoClipId).toBeTruthy();
    await videoClip.click();
    const narrowVideoClip = await inspectNarrowTimelineClip(videoClip);
    expect(narrowVideoClip.clipWidth).toBe(22);
    expect(narrowVideoClip.contentWidth).toBeGreaterThan(0);
    expect(narrowVideoClip.contentPadding).toBeLessThanOrEqual(2);
    expect(narrowVideoClip.handleFill).toBe("rgba(0, 0, 0, 0)");
    expect(narrowVideoClip.handleInteriorWidth).toBeLessThan(
      narrowVideoClip.clipWidth,
    );
    expect(narrowVideoClip.label).not.toBe("");
    const videoPreview = page
      .frameLocator('[data-panel-id="editor"] iframe')
      .locator(`video[data-video-asset-id="${videoAssetId}"]`);
    await expect(videoPreview).toBeVisible();
    await page.getByRole("button", { name: "Center on Canvas" }).click();
    await expect(page.getByLabel("Position X (%)")).toHaveValue("50");
    await expect(page.getByLabel("Position Y (%)")).toHaveValue("50");
    await page.getByRole("button", { name: "Fill Canvas" }).click();
    await expect(page.getByLabel("Width (%)")).toHaveValue("100");
    await expect(page.getByLabel("Height (%)")).toHaveValue("100");
    await expect(page.getByLabel("Video fit")).toHaveValue("cover");
    await page.getByRole("button", { name: "Fit inside Canvas" }).click();
    await expect(page.getByLabel("Video fit")).toHaveValue("contain");
    const containedVideoHandles = await page
      .getByTestId("canvas-selection-bounds")
      .boundingBox();
    expect(containedVideoHandles).toBeTruthy();
    expect(
      Math.abs(
        containedVideoHandles!.width / containedVideoHandles!.height - 1,
      ),
    ).toBeLessThan(0.05);
    const videoPositionX = page.getByLabel("Position X (%)", { exact: true });
    await videoPositionX.fill("62");
    await expect
      .poll(() =>
        videoPreview.evaluate(
          (element) => (element as HTMLVideoElement).style.left,
        ),
      )
      .toBe("62%");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(videoPositionX).toHaveValue("50");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(videoPositionX).toHaveValue("62");
    await expect(page.getByLabel("Video fit", { exact: true })).toHaveValue(
      "contain",
    );

    // Moving the left trim advances the source in-point; the right edge remains
    // stable, and the source timing is saved in the same Timeline clip.
    const videoEndBeforeLeftTrim = await page
      .getByLabel("Clip end time (seconds)")
      .inputValue();
    await page.getByLabel("Clip start time (seconds)").fill("6.5");
    await expect(page.getByLabel("Clip end time (seconds)")).toHaveValue(
      videoEndBeforeLeftTrim,
    );
    const trimmedVideoRange = await readClipFrameRange(videoClip);
    const trimmedVideoDurationInFrames =
      trimmedVideoRange[1] - trimmedVideoRange[0];
    const videoFps = Number(
      await page
        .getByLabel("Clip start time (seconds)")
        .getAttribute("data-fps"),
    );
    await expect(page.getByLabel("Source start time (seconds)")).toHaveValue(
      "0.5",
    );
    await setFrameFromUiTime(page, "Playhead time (seconds)", 202);
    await expect
      .poll(() =>
        videoPreview.evaluate(
          (element) => (element as HTMLVideoElement).readyState,
        ),
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() =>
        videoPreview.evaluate(
          (element) => (element as HTMLVideoElement).currentTime,
        ),
      )
      .toBeGreaterThan(0.5);

    // Moving a video to another visible visual track must preserve the clip's
    // renderer source, and the drop target must be visible before release.
    await page
      .locator(".timeline-actions")
      .getByRole("button", { name: "Add visual track", exact: true })
      .click();
    const videoSourceTrackId = await videoClip.evaluate(
      (clip) => clip.closest<HTMLElement>(".track-lane")?.dataset.track,
    );
    const videoSourceRow = page.locator(
      `.track-row[data-track-row="${videoSourceTrackId}"]`,
    );
    await videoSourceRow.scrollIntoViewIfNeeded();
    const videoTargetTrackId = await page
      .locator(".track-row.is-visual-track")
      .evaluateAll(
        (rows, sourceTrackId) => {
          const viewport = document
            .querySelector<HTMLElement>(".timeline-scroll")!
            .getBoundingClientRect();
          return rows
            .find((row) => {
              const bounds = row.getBoundingClientRect();
              return (
                row.getAttribute("data-track-row") !== sourceTrackId &&
                bounds.top >= viewport.top &&
                bounds.bottom <= viewport.bottom
              );
            })
            ?.getAttribute("data-track-row");
        },
        videoSourceTrackId,
      );
    expect(videoTargetTrackId).toBeTruthy();
    const videoTargetRow = page.locator(
      `.track-row[data-track-row="${videoTargetTrackId}"]`,
    );
    const videoMoveTarget = await videoClip.evaluate((clip) => {
      const sourceTrack =
        clip.closest<HTMLElement>(".track-lane")?.dataset.track;
      const row = Array.from(
        document.querySelectorAll<HTMLElement>(".track-row.is-visual-track"),
      ).find((candidate) => candidate.dataset.trackRow !== sourceTrack)!;
      const lane = row.querySelector<HTMLElement>(".track-lane")!;
      const clipRect = clip.getBoundingClientRect();
      const laneRect = lane.getBoundingClientRect();
      return {
        trackId: lane.dataset.track,
        x: Math.max(
          laneRect.left + 12,
          Math.min(clipRect.left + clipRect.width / 2, laneRect.right - 12),
        ),
        sourceY: clipRect.top + clipRect.height / 2,
        targetY: laneRect.top + laneRect.height / 2,
      };
    });
    expect(videoMoveTarget.trackId).toBeTruthy();
    const videoRangeBeforeTrackMove = await readClipFrameRange(videoClip);
    await page.mouse.move(videoMoveTarget.x, videoMoveTarget.sourceY);
    await page.mouse.down();
    await page.mouse.move(videoMoveTarget.x, videoMoveTarget.targetY, {
      steps: 4,
    });
    await expect(page.locator(".timeline-drag-ghost")).toContainText("Move to");
    await expect(
      page.locator(`.track-row[data-track-row="${videoMoveTarget.trackId}"]`),
    ).toHaveAttribute("data-drop-target", "true");
    await page.mouse.up();
    await expect
      .poll(() =>
        videoClip.evaluate(
          (clip) => clip.closest<HTMLElement>(".track-lane")?.dataset.track,
        ),
      )
      .toBe(videoMoveTarget.trackId);
    await expect
      .poll(() => readClipFrameRange(videoClip))
      .toEqual(videoRangeBeforeTrackMove);
    await expect(videoPreview).toBeVisible();
    const movedVideoPlayhead = await page
      .getByTestId("frame-readout")
      .innerText();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("frame-readout")).not.toHaveText(
      movedVideoPlayhead,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();

    // A Chromium decoder failure during playback is recoverable runtime state;
    // it must not replace the mounted preview with the project-load error page.
    await page
      .frameLocator('[data-panel-id="editor"] iframe')
      .locator("body")
      .evaluate(() =>
        window.dispatchEvent(
          new PromiseRejectionEvent("unhandledrejection", {
            promise: Promise.resolve(),
            reason: new Error(
              "MediaPlaybackError: The browser threw an error while playing the video; Code 2 PIPELINE_ERROR_READ: FFmpegDemuxer seek failed.",
            ),
          }),
        ),
      );
    await expect(
      page.frameLocator('[data-panel-id="editor"] iframe').getByRole("alert"),
    ).toContainText("Video playback stopped while seeking or decoding.");
    await expect(videoPreview).toBeVisible();
    await setFrameFromUiTime(page, "Playhead time (seconds)", 202);
    await expect(
      page.frameLocator('[data-panel-id="editor"] iframe').getByRole("alert"),
    ).toHaveCount(0);
    await expect(videoPreview).toBeVisible();

    await page
      .getByLabel("Transcription source", { exact: true })
      .selectOption(`video:${videoClipId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Generate Subtitles", exact: true })
      .click();
    await expect(page.getByText(/1 unverified subtitle added/)).toBeVisible();
    expect(extractedVideoAudio.start).toBe(0.5);
    expect(extractedVideoAudio.duration).toBeCloseTo(
      trimmedVideoDurationInFrames / videoFps,
      10,
    );
    expect(extractedVideoAudio.size).toBeGreaterThan(44);
    const generatedVideoSubtitle = page
      .locator(".timeline-clip.subtitle-clip")
      .first();
    await expect(generatedVideoSubtitle).toContainText("Video audio caption");
    await generatedVideoSubtitle.click();
    const narrowSubtitleClip = await inspectNarrowTimelineClip(
      generatedVideoSubtitle,
    );
    expect(narrowSubtitleClip.contentWidth).toBeGreaterThan(0);
    expect(narrowSubtitleClip.contentPadding).toBeLessThanOrEqual(2);
    expect(narrowSubtitleClip.handleFill).toBe("rgba(0, 0, 0, 0)");
    expect(narrowSubtitleClip.handleInteriorWidth).toBeLessThan(
      narrowSubtitleClip.clipWidth,
    );
    expect(narrowSubtitleClip.label).toContain("Video audio caption");
    expect(await readClipFrameRange(generatedVideoSubtitle)).toEqual([
      trimmedVideoRange[0] + Math.round(0.2 * videoFps),
      trimmedVideoRange[0] + Math.round(0.7 * videoFps),
    ]);
    await expect(
      page
        .frameLocator('[data-panel-id="editor"] iframe')
        .getByText("Video audio caption", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const videoTimelinePath = path.join(textProjectPath, "edit-timeline.json");
    const savedVideoDocument = JSON.parse(
      await readFile(videoTimelinePath, "utf8"),
    );
    const savedVideoClip = savedVideoDocument.clips.find(
      (clip: { id: string }) => clip.id === videoClipId,
    );
    const savedVideoSubtitle = savedVideoDocument.clips.find(
      (clip: { componentId: string; content: { text?: string } }) =>
        clip.componentId === "subtitles" &&
        clip.content.text === "Video audio caption",
    );
    expect(savedVideoSubtitle).toMatchObject({
      from: trimmedVideoRange[0] + Math.round(0.2 * videoFps),
      durationInFrames:
        Math.round(0.7 * videoFps) - Math.round(0.2 * videoFps),
    });
    const savedVideoWord = savedVideoSubtitle.content.words[0];
    expect(savedVideoWord.start).toBeCloseTo(0.05, 10);
    expect(savedVideoWord.end).toBeCloseTo(0.4, 10);
    expect(savedVideoClip).toMatchObject({
      componentId: "video",
      content: { assetId: videoAssetId, sourceStartSeconds: 0.5 },
      props: { x: 62 },
      from: 195,
      durationInFrames: trimmedVideoDurationInFrames,
    });
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await videoClip.click();
    await expect(videoPositionX).toHaveValue("62");
    await expect(page.getByLabel("Source start time (seconds)")).toHaveValue(
      "0.5",
    );

    await videoClip.click();
    await page
      .getByRole("button", { name: "Separate video audio", exact: true })
      .click();
    const separatedAudioClip = page.locator(
      '.timeline-clip[data-clip-id^="video-audio-"]',
    );
    await expect(separatedAudioClip).toBeVisible();
    await expect(
      page.locator(".track-row.is-audio-track").first().locator(".audio-clip"),
    ).toHaveCount(1);
    await videoClip.click();
    await expect(page.getByLabel("Clip volume")).toHaveValue("0");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const separatedVideoDocument = JSON.parse(
      await readFile(videoTimelinePath, "utf8"),
    );
    expect(
      separatedVideoDocument.clips.find(
        (clip: { id: string }) => clip.id === videoClipId,
      ).props.volume,
    ).toBe(0);
    expect(
      separatedVideoDocument.clips.find(
        (clip: { componentId: string }) => clip.componentId === "video-audio",
      ),
    ).toMatchObject({
      from: 195,
      durationInFrames: trimmedVideoDurationInFrames,
      content: {
        assetId: videoAssetId,
        sourceVideoClipId: videoClipId,
        sourceStartSeconds: 0.5,
        sourceDurationSeconds: expect.any(Number),
      },
    });

    standaloneTextVideo = await renderProject(root, thirdId, false);
    const renderedAudio = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        standaloneTextVideo,
        "-vn",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    const measuredMaximum = renderedAudio.stderr.match(
      /max_volume:\s*(-?\d+(?:\.\d+)?) dB/,
    );
    expect(measuredMaximum).toBeTruthy();
    expect(Number(measuredMaximum?.[1])).toBeGreaterThan(-90);
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

    const renderedVideoFramePath = path.join(
      audioFixtureDirectory,
      "rendered-video-frame.png",
    );
    await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        "6.75",
        "-i",
        standaloneTextVideo,
        "-frames:v",
        "1",
        renderedVideoFramePath,
      ],
      { windowsHide: true, timeout: 60_000 },
    );
    const renderedVideoFrame = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        renderedVideoFramePath,
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
    const videoPixels = Buffer.from(renderedVideoFrame.stdout);
    let blueVideoPixels = 0;
    for (let index = 0; index + 2 < videoPixels.length; index += 3) {
      if (
        videoPixels[index] < 80 &&
        videoPixels[index + 1] < 100 &&
        videoPixels[index + 2] > 120
      )
        blueVideoPixels += 1;
    }
    expect(blueVideoPixels).toBeGreaterThan(10_000);

    const savedImageIdsBeforeDrop = new Set(
      savedImage.document.clips
        .filter((clip: { componentId: string }) => clip.componentId === "image")
        .map((clip: { id: string }) => clip.id),
    );
    const mediaDragSource = page.locator(`[data-media-asset-id="${imageId}"]`);
    await mediaDragSource.dragTo(page.locator(".canvas-interaction-layer"), {
      targetPosition: { x: 420, y: 260 },
    });
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const document = JSON.parse(await readFile(imageTimelinePath, "utf8"));
        return document.clips.filter(
          (clip: { id: string; componentId: string }) =>
            clip.componentId === "image" &&
            !savedImageIdsBeforeDrop.has(clip.id),
        ).length;
      })
      .toBe(1);
    let currentImageDocument = JSON.parse(
      await readFile(imageTimelinePath, "utf8"),
    );
    const canvasDroppedImage = currentImageDocument.clips.find(
      (clip: { id: string; componentId: string }) =>
        clip.componentId === "image" && !savedImageIdsBeforeDrop.has(clip.id),
    );
    expect(canvasDroppedImage.content.assetId).toBe(imageId);
    expect(canvasDroppedImage.props.x).not.toBe(50);

    const canvasImageId = canvasDroppedImage.id as string;
    const timelineLane = page.locator('.track-lane[data-track="visuals"]');
    const timelineLaneBounds = await timelineLane.boundingBox();
    expect(timelineLaneBounds).toBeTruthy();
    await mediaDragSource.dragTo(timelineLane, {
      targetPosition: {
        x: Math.floor(timelineLaneBounds!.width * 0.8),
        y: timelineLaneBounds!.height - 2,
      },
    });
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const document = JSON.parse(await readFile(imageTimelinePath, "utf8"));
        return document.clips.filter(
          (clip: { id: string; componentId: string }) =>
            clip.componentId === "image" &&
            !savedImageIdsBeforeDrop.has(clip.id) &&
            clip.id !== canvasImageId,
        ).length;
      })
      .toBe(1);
    currentImageDocument = JSON.parse(
      await readFile(imageTimelinePath, "utf8"),
    );
    const timelineDroppedImage = currentImageDocument.clips.find(
      (clip: { id: string; componentId: string }) =>
        clip.componentId === "image" &&
        !savedImageIdsBeforeDrop.has(clip.id) &&
        clip.id !== canvasImageId,
    );
    expect(timelineDroppedImage.content.assetId).toBe(imageId);
    expect(timelineDroppedImage.id).not.toBe(canvasImageId);
    expect(timelineDroppedImage.trackId).toBe("visuals");
    expect(timelineDroppedImage.from).toBeGreaterThan(0);

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
    await setFrameFromUiTime(page, "Playhead time (seconds)", 202);
    await expect(
      page.locator(".timeline-clip").filter({ hasText: "Video audio caption" }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('[data-panel-id="editor"] iframe')
        .getByText("Video audio caption", { exact: true }),
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
