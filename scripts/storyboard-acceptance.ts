/** Synthetic fixtures only. Never opens or edits a user's project. */
import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startServers, root, projectsDir } from "./server";
import { createProject } from "./project-scaffold";
import { resolveStoryboardContext } from "./storyboard-store";
import { storyboardSchema } from "@motion/project-loader/storyboard";

const id = `storyboard-check-${randomUUID().slice(0, 8)}`;
const fixture = path.join(projectsDir, id);
if (path.dirname(path.resolve(fixture)) !== path.resolve(projectsDir))
  throw new Error("Unsafe fixture path");
const output = path.join(root, "out/storyboard-acceptance");
await mkdir(output, { recursive: true });
const manifest = {
  ...(await createProject(projectsDir, id)),
  width: 1080,
  height: 1920,
  durationInFrames: 600,
};
await writeFile(path.join(fixture, "project.json"), JSON.stringify(manifest));
const referencePath = path.join(fixture, "assets/synthetic-reference.png");
await writeFile(
  referencePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=",
    "base64",
  ),
);
const wav = Buffer.alloc(44 + 22050 * 2 * 20);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(22050, 24);
wav.writeUInt32LE(44100, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 22050 * 20; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((i * 440 * Math.PI * 2) / 22050) * 300),
    44 + i * 2,
  );
const audioPath = path.join(fixture, "assets/synthetic-tone.wav");
await writeFile(audioPath, wav);
await writeFile(
  path.join(fixture, "media.json"),
  JSON.stringify({
    version: 1,
    assets: [
      {
        id: "synthetic-tone",
        type: "audio",
        displayName: "Synthetic timing tone",
        source: { kind: "external-file", path: audioPath },
      },
    ],
  }),
);
const timeline = JSON.parse(
  await readFile(path.join(fixture, "edit-timeline.json"), "utf8"),
);
timeline.durationInFrames = 600;
timeline.tracks.push({ id: "audio", name: "Audio", kind: "audio" });
timeline.clips.push(
  {
    id: "soundtrack",
    componentId: "soundtrack",
    trackId: "audio",
    label: "Synthetic tone",
    from: 0,
    durationInFrames: 600,
    content: { assetId: "synthetic-tone" },
    props: {},
  },
  {
    id: "cue-trip",
    componentId: "subtitles",
    trackId: "captions",
    label: "Synthetic words",
    from: 180,
    durationInFrames: 90,
    content: {
      text: "Andrei trips",
      status: "demo",
      words: [
        { id: "word-andrei", text: "Andrei", start: 0.2, end: 0.6 },
        { id: "word-trips", text: "trips", start: 0.8, end: 1.4 },
      ],
    },
    props: {},
  },
);
await writeFile(
  path.join(fixture, "edit-timeline.json"),
  JSON.stringify(timeline),
);
const servers = await startServers(false, 260, {
  mediaFilePicker: async () => referencePath,
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
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Renderer:", error.message);
  });
  await page.locator(`.project[data-project-id="${id}"]`).click();
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  const sb = page.getByRole("region", { name: "Storyboard Designer" });
  await sb.getByRole("button", { name: "Create Scene", exact: true }).click();
  await sb
    .getByLabel("Scene name", { exact: true })
    .fill("Andrei and Oana — synthetic portrait");
  await sb.getByLabel("Scene estimate (seconds)", { exact: true }).fill("20");
  await sb.getByRole("button", { name: "Create Set", exact: true }).click();
  await sb.getByLabel("Set name", { exact: true }).fill("Empty office");
  await sb.getByLabel("Set start (seconds)", { exact: true }).fill("0");
  await sb.getByLabel("Set duration (seconds)", { exact: true }).fill("3");
  async function rectangle(
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    await sb.getByRole("button", { name: "rectangle", exact: true }).click();
    const bounds = await sb
      .getByLabel("Storyboard sketch canvas")
      .boundingBox();
    assert.ok(bounds);
    await page.mouse.move(
      bounds.x + bounds.width * 0.2,
      bounds.y + Math.min(bounds.height * 0.2, 100),
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.35,
      bounds.y + Math.min(bounds.height * 0.3, 160),
      { steps: 8 },
    );
    await page.mouse.up();
    await sb.getByRole("button", { name: "Create object from sketch" }).click();
    await sb.getByLabel("Object name", { exact: true }).fill(name);
    for (const [key, value] of Object.entries({ x, y, width, height }))
      await sb.getByLabel(key, { exact: true }).fill(String(value));
  }
  await rectangle("Table", 15, 65, 75, 22);
  await rectangle("Coffee mug", 78, 82, 12, 15);
  await sb
    .getByLabel("Spatial note", { exact: true })
    .fill("Coffee mug on the lower-right corner of the desk");
  await sb.getByRole("button", { name: "Import PNG reference" }).click();
  await expect(
    sb.getByLabel("Use registered image").locator("option"),
  ).toHaveCount(2);
  await sb.getByLabel("Use registered image").selectOption({ index: 1 });
  await sb.locator(".sb-left details summary").click();
  await sb.getByRole("button", { name: "Link to selected object" }).click();
  await sb.getByRole("button", { name: "Place reference on canvas" }).click();
  for (const [key, value] of Object.entries({
    x: 10,
    y: 8,
    width: 20,
    height: 12,
    rotation: 15,
  }))
    await sb.getByLabel(key, { exact: true }).fill(String(value));
  await sb
    .getByLabel("Sketch / reference editor opacity (not final animation)", {
      exact: true,
    })
    .fill("0.25");
  await sb.getByRole("button", { name: "Lock", exact: true }).click();
  const names = ["Andrei enters", "Andrei trips", "Oana enters", "Andrei sits"];
  for (const [i, name] of names.entries()) {
    await sb.getByRole("button", { name: "Duplicate selected Set" }).click();
    await sb.getByLabel("Set name", { exact: true }).fill(name);
    await sb
      .getByLabel("Set start (seconds)", { exact: true })
      .fill(String([3, 6, 10, 14][i]));
    await sb
      .getByLabel("Set duration (seconds)", { exact: true })
      .fill(String([3, 4, 4, 6][i]));
  }
  await sb
    .locator(".sb-left")
    .getByRole("button", { name: /^3\. Andrei trips/ })
    .click();
  await sb
    .getByLabel("What happens", { exact: true })
    .fill("Andrei trips beside the table. The mug stays put.");
  await sb.getByLabel("trips 6.80s").check();
  await sb.getByRole("button", { name: "Link selected words" }).click();
  await sb.getByRole("button", { name: "Replay Set interval" }).click();
  await expect
    .poll(() =>
      sb.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(6);
  await sb.locator("audio").evaluate((a: HTMLAudioElement) => a.pause());
  await sb
    .locator("summary")
    .filter({ hasText: "Import Director Brief" })
    .click();
  await sb
    .getByLabel("External Director brief")
    .fill(
      "Synthetic Director plan: anticipate the trip, then hold the reaction.",
    );
  await sb.getByRole("button", { name: "Import as new version" }).click();
  await sb
    .getByLabel("What happens", { exact: true })
    .fill("Andrei trips beside the table, then recovers.");
  await expect(
    sb.getByText("Version 1 · STALE — storyboard changed", { exact: true }),
  ).toBeVisible();
  await sb
    .getByRole("button", { name: "Save storyboard", exact: true })
    .click();
  await expect(
    sb.getByText("Storyboard saved.", { exact: true }),
  ).toBeVisible();
  const before = storyboardSchema.parse(
    JSON.parse(await readFile(path.join(fixture, "storyboard.json"), "utf8")),
  );
  const mug = before.scenes[0].sets[2].representations.find(
    (r) =>
      before.scenes[0].objects.find((o) => o.id === r.objectId)?.name ===
      "Coffee mug",
  )!;
  assert.equal(mug.x, 78);
  assert.equal(mug.y, 82);
  assert.equal(mug.width, 12);
  assert.equal(mug.height, 15);
  const placedReference = before.scenes[0].sets[2].representations[2];
  assert.equal(placedReference.rotation, 15);
  assert.equal(placedReference.opacity, 0.25);
  assert.equal(placedReference.locked, true);
  assert.deepEqual(before.composition, { width: 1080, height: 1920, fps: 30 });
  await sb.getByRole("button", { name: "+", exact: true }).click();
  await sb.getByRole("button", { name: "pan", exact: true }).click();
  const canvas = await sb.getByLabel("Storyboard sketch canvas").boundingBox();
  assert.ok(canvas);
  await page.mouse.move(canvas.x + 50, canvas.y + 50);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 10, canvas.y + 10);
  await page.mouse.up();
  assert.deepEqual(
    JSON.parse(await readFile(path.join(fixture, "storyboard.json"), "utf8")),
    before,
  );
  await page.reload();
  await page.getByRole("button", { name: "Storyboard", exact: true }).click();
  await expect(sb.getByLabel("Scene name", { exact: true })).toHaveValue(
    "Andrei and Oana — synthetic portrait",
  );
  await sb
    .locator(".sb-left")
    .getByRole("button", { name: /^3\. Andrei trips/ })
    .click();
  await sb.getByRole("button", { name: "2. Coffee mug", exact: true }).click();
  await expect(sb.getByLabel("x", { exact: true })).toHaveValue("78");
  await expect(sb.getByLabel("y", { exact: true })).toHaveValue("82");
  const context = await resolveStoryboardContext(
    projectsDir,
    id,
    "getSetContext",
    before.scenes[0].id,
    before.scenes[0].sets[2].id,
  );
  assert.deepEqual(
    (context.result as { set: unknown }).set,
    before.scenes[0].sets[2],
  );
  await sb
    .getByRole("button", { name: "Copy Full Story", exact: true })
    .click();
  await expect(
    sb.getByText("Full story copied. Use Export Full Context for images.", {
      exact: true,
    }),
  ).toBeVisible();
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.match(clipboard, /x=78%/);
  assert.match(clipboard, /STALE/);
  assert.match(clipboard, /demo/);
  const packagePath = path.join(output, "synthetic-storyboard.zip");
  await rm(packagePath, { force: true });
  await app.evaluate(({ BrowserWindow }, packagePath) => {
    BrowserWindow.getAllWindows()[0].webContents.session.once(
      "will-download",
      (_event, item) => item.setSavePath(packagePath),
    );
  }, packagePath);
  await sb
    .getByRole("button", { name: "Export Full Context", exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(packagePath)).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(100);
  await page.screenshot({ path: path.join(output, "portrait-workspace.png") });
  await sb.getByLabel("x", { exact: true }).fill("65");
  await sb
    .getByRole("button", { name: "Save storyboard", exact: true })
    .click();
  await expect(
    sb.getByText("Storyboard saved.", { exact: true }),
  ).toBeVisible();
  const after = storyboardSchema.parse(
    JSON.parse(await readFile(path.join(fixture, "storyboard.json"), "utf8")),
  );
  assert.equal(after.scenes[0].sets[0].representations[1].x, 78);
  assert.equal(after.scenes[0].sets[2].representations[1].x, 65);
  assert.equal(
    after.scenes[0].sets[2].representations[1].objectId,
    after.scenes[0].sets[0].representations[1].objectId,
  );
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.locator("iframe").first()).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "context.json"),
    JSON.stringify(context, null, 2),
  );
  console.log(
    `PASS ${id}: five Sets, identity, portrait coordinates, zoom/pan, save/reopen, reference import, synthetic audio, word anchors, stale brief, clipboard, ZIP, resolver, return to Editor.`,
  );
} catch (error) {
  const page = (await app?.windows())?.[0];
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png") });
    await writeFile(
      path.join(output, "failure.txt"),
      await page.locator("body").innerText(),
    );
    await writeFile(path.join(output, "failure.html"), await page.content());
  }
  throw error;
} finally {
  await app?.close();
  await servers.close();
  await rm(fixture, { recursive: true, force: true });
}
