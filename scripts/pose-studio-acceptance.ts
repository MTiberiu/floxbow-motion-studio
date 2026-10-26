/** Isolated browser walkthrough for Pose Sheet Studio; creates and removes its own fixture project. */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createProject } from "./project-scaffold";
import { startServers, root, projectsDir } from "./server";

const id = `pose-studio-acceptance-${crypto.randomUUID().slice(0, 8)}`;
const project = path.join(projectsDir, id);
if (path.dirname(path.resolve(project)) !== path.resolve(projectsDir))
  throw new Error("Unsafe Pose Studio fixture path");
const output = path.join(root, "out/pose-studio-acceptance");
await mkdir(output, { recursive: true });
function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    body = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}
function makeGridPng(width: number, height: number) {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const index = 1 + x * 4;
      const color =
        ((Math.floor(y / (height / 10)) * 20 + Math.floor(x / (width / 20))) *
          19) %
        255;
      row[index] = color;
      row[index + 1] = 190 - color / 2;
      row[index + 2] = 130 + color / 3;
      row[index + 3] = 255;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const servers = await startServers(false, 280);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await createProject(projectsDir, id);
  const timelinePath = path.join(project, "edit-timeline.json");
  const timelineDocument = JSON.parse(await readFile(timelinePath, "utf8"));
  delete timelineDocument.scenes;
  await writeFile(
    timelinePath,
    `${JSON.stringify(timelineDocument, null, 2)}\n`,
  );
  const compositionPath = path.join(project, "Composition.tsx");
  const composition = (await readFile(compositionPath, "utf8"))
    .replace(
      "standaloneImageModule }",
      "standaloneCharacterModule, standaloneImageModule }",
    )
    .replace(
      "[subtitleModule, standaloneImageModule]",
      "[subtitleModule, standaloneImageModule, standaloneCharacterModule]",
    );
  await writeFile(compositionPath, composition);
  const timelineBefore = createHash("sha256")
    .update(await readFile(timelinePath))
    .digest("hex");
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(servers.url);
  await page.locator(`.project[data-project-id="${id}"]`).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "＋ Scene" }).click();
  const createdScene = page
    .locator(".scene-item")
    .filter({ hasText: "Scene 1" });
  await expect(createdScene).toBeVisible();
  const createdSceneId = await createdScene.getAttribute("data-scene-id");
  assert.ok(createdSceneId);
  await page.getByRole("button", { name: "Moments", exact: true }).click();
  const momentsPanel = page.getByLabel("Scene Moments", { exact: true });
  await expect(momentsPanel).toBeVisible();
  await momentsPanel
    .getByRole("button", { name: "+ Moment at playhead" })
    .click();
  await expect(momentsPanel).toContainText("Moment 1");
  await page.getByRole("button", { name: "Moments", exact: true }).click();
  await page.getByRole("button", { name: "Pose Studio", exact: true }).click();
  const studio = page.getByRole("region", { name: "Pose Sheet Studio" });
  page.once("dialog", (dialog) => void dialog.accept("Dancers"));
  await studio.getByRole("button", { name: "＋ Category" }).click();
  await studio.getByRole("button", { name: "Create a character" }).click();
  await studio.getByLabel("New character name").fill("Mina");
  await studio.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    studio
      .locator(".pose-character-list button.selected")
      .filter({ hasText: "Mina" }),
  ).toBeVisible();
  await expect(
    studio.getByRole("button", { name: "Import image sheet" }),
  ).toBeEnabled();
  const png = makeGridPng(400, 200);
  const pngDimensions = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, png.toString("base64"));
  assert.deepEqual(
    pngDimensions,
    [400, 200],
    "Synthetic test image decodes before importing.",
  );
  await studio.locator('input[type="file"]').setInputFiles({
    name: "mina-dance-sheet.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    studio.getByRole("img", { name: "mina-dance-sheet source sheet" }),
  ).toBeVisible();
  await studio.getByLabel("Grid columns").fill("4");
  await studio.getByLabel("Grid rows").fill("2");
  await expect(
    studio.getByRole("tab", { name: "Grid preview" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(studio.locator(".pose-crop-mode-hint")).toContainText(
    "Apply the grid below",
  );
  await expect(studio.locator(".pose-grid-preview-cell")).toHaveCount(8);
  const fourByTwoCell = await studio
    .locator(".pose-grid-preview-cell")
    .first()
    .boundingBox();
  const fourByTwoStage = await studio
    .locator(".pose-source-stage")
    .boundingBox();
  assert.ok(fourByTwoCell && fourByTwoStage);
  assert.ok(Math.abs(fourByTwoCell.width / fourByTwoStage.width - 0.25) < 0.01);
  assert.ok(
    Math.abs(fourByTwoCell.height / fourByTwoStage.height - 0.5) < 0.01,
  );
  await page.screenshot({
    path: path.join(output, "pose-grid-4x2-preview.png"),
    fullPage: true,
  });
  await studio.getByRole("button", { name: "Apply grid · 8" }).click();
  const starterClips = studio.locator(".pose-timeline-clip");
  await expect(starterClips).toHaveCount(8);
  await expect(
    studio.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await starterClips.nth(0).dragTo(starterClips.nth(1));
  await expect(starterClips.first()).toHaveAttribute("aria-label", /pose 2/);
  await page.screenshot({
    path: path.join(output, "pose-starter-animation.png"),
    fullPage: true,
  });
  await studio.getByRole("tab", { name: "Crop review" }).click();
  await expect(studio.locator(".pose-crop-box")).toHaveCount(8);
  await expect(
    studio.getByRole("tab", { name: "Crop review" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(studio.locator(".pose-crop-mode-hint")).toContainText(
    "Click a numbered crop",
  );
  await studio.getByLabel("Grid columns").fill("20");
  await studio.getByLabel("Grid rows").fill("10");
  await expect(studio.locator(".pose-grid-preview-cell")).toHaveCount(200);
  const firstGridCell = await studio
    .locator(".pose-grid-preview-cell")
    .first()
    .boundingBox();
  const gridStage = await studio.locator(".pose-source-stage").boundingBox();
  assert.ok(firstGridCell && gridStage);
  assert.ok(
    Math.abs(firstGridCell.width / gridStage.width - 0.05) < 0.01,
    "Each preview crop shows the actual 1/20 image width before applying.",
  );
  assert.ok(
    Math.abs(firstGridCell.height / gridStage.height - 0.1) < 0.01,
    "Each preview crop shows the actual 1/10 image height before applying.",
  );
  await page.screenshot({
    path: path.join(output, "pose-grid-preview.png"),
    fullPage: true,
  });
  await studio.getByRole("button", { name: "Apply grid · 200" }).click();
  await studio.getByRole("tab", { name: "Crop review" }).click();
  await expect(studio.locator(".pose-crop-box")).toHaveCount(200);
  await studio.getByLabel("Grid columns").fill("40");
  await studio.getByLabel("Grid rows").fill("25");
  await expect(studio.locator(".pose-grid-preview-cell")).toHaveCount(1000);
  await studio.getByRole("button", { name: "Apply grid · 1000" }).click();
  await studio.getByRole("tab", { name: "Crop review" }).click();
  await expect(studio.locator(".pose-crop-box")).toHaveCount(1000);
  await studio.getByLabel("Grid columns").fill("20");
  await studio.getByLabel("Grid rows").fill("10");
  await studio.getByRole("button", { name: "Apply grid · 200" }).click();
  await studio.getByRole("tab", { name: "Crop review" }).click();
  await expect(studio.locator(".pose-crop-box")).toHaveCount(200);
  const pose37Box = await studio
    .getByRole("button", { name: "Pose 37", exact: true })
    .boundingBox();
  const sheetStageBox = await studio
    .locator(".pose-source-stage")
    .boundingBox();
  assert.ok(pose37Box && sheetStageBox);
  await page.mouse.move(
    pose37Box.x + pose37Box.width / 2,
    pose37Box.y + pose37Box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    pose37Box.x + pose37Box.width / 2 + (sheetStageBox.width * 5) / 400,
    pose37Box.y + pose37Box.height / 2,
    { steps: 3 },
  );
  await page.mouse.up();
  await expect(studio.getByLabel("Crop X")).toHaveValue("325");
  await studio.getByLabel("Crop width").fill("18");
  for (const [label, value] of [
    ["Crop image zoom", "2.5"],
    ["Crop image pan X", "0.2"],
  ]) {
    await studio.getByLabel(label).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }
  await studio.getByLabel("Anchor Y").evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "0.86");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await studio.getByLabel("Pose review status").selectOption("approved");
  await studio.getByRole("button", { name: "Pose 38", exact: true }).click();
  await studio.getByRole("button", { name: "Pose 37", exact: true }).click();
  await expect(studio.getByLabel("Crop width")).toHaveValue("18");
  await expect(studio.getByLabel("Anchor Y")).toHaveValue("0.86");
  await expect(studio.getByLabel("Pose review status")).toHaveValue("approved");
  await studio.getByRole("tab", { name: "Erase", exact: true }).click();
  const maskCanvas = studio.locator(".pose-mask-preview canvas");
  const maskBounds = await maskCanvas.boundingBox();
  assert.ok(maskBounds);
  await page.mouse.move(
    maskBounds.x + maskBounds.width * 0.35,
    maskBounds.y + maskBounds.height * 0.35,
  );
  await page.mouse.down();
  await page.mouse.move(
    maskBounds.x + maskBounds.width * 0.55,
    maskBounds.y + maskBounds.height * 0.55,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(studio.locator(".pose-mask-controls small")).toContainText(
    "1 erase stroke",
  );
  await studio.getByRole("tab", { name: "Crop", exact: true }).click();
  await studio.getByRole("button", { name: "Save library" }).click();
  await expect(studio.locator(".pose-notice")).toContainText(
    "saved on this device",
  );
  await page.screenshot({
    path: path.join(output, "pose-sheet-crop-review.png"),
    fullPage: true,
  });

  await studio.getByTitle("Create action combo").click();
  await studio.getByLabel("New action name").fill("Dance A");
  await studio.getByRole("button", { name: "Create action" }).click();
  await studio.getByRole("tab", { name: "Sequence", exact: true }).click();
  await studio.getByRole("button", { name: "Use all 200 poses" }).click();
  await expect(studio.locator(".pose-sequence-editor")).toContainText(
    "200 frames",
  );
  await expect(studio.getByLabel("Pause animation")).toBeVisible();

  await studio.getByTitle("Create action combo").click();
  await studio.getByLabel("New action name").fill("Dance B");
  await studio.getByRole("button", { name: "Create action" }).click();
  await studio.getByRole("tab", { name: "Sequence", exact: true }).click();
  await studio.locator(".pose-add-poses summary").click();
  const available = studio.getByLabel("Available poses");
  for (const label of ["1", "3", "8"])
    await available.getByRole("button", { name: label, exact: true }).click();
  await studio.getByRole("button", { name: /Add selected/ }).click();
  await studio.getByRole("button", { name: "Remove step 1" }).click();
  const comboA = studio.locator(".pose-step-pose");
  await expect(comboA).toHaveText(["1. Pose 1", "2. Pose 3", "3. Pose 8"]);
  await studio.getByRole("button", { name: "2. Pose 3" }).click();
  await studio.getByTitle("Create action combo").click();
  await studio.getByLabel("New action name").fill("Dance C");
  await studio.getByRole("button", { name: "Create action" }).click();
  await studio.getByRole("tab", { name: "Sequence", exact: true }).click();
  await studio.locator(".pose-add-poses summary").click();
  const availableB = studio.getByLabel("Available poses");
  await studio.getByLabel("Find pose number").fill("37");
  await studio.getByRole("button", { name: "Select", exact: true }).click();
  await expect(
    availableB.getByRole("button", { name: "37", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await availableB.getByRole("button", { name: "37", exact: true }).click();
  for (const label of ["2", "4"])
    await availableB.getByRole("button", { name: label, exact: true }).click();
  await studio.getByRole("button", { name: /Add selected/ }).click();
  for (let i = 0; i < 3; i++)
    await studio.getByRole("button", { name: "＋ Repeat selected" }).click();
  await studio.getByLabel("Step 4 duration").fill("240");
  await studio.getByRole("tab", { name: "Action", exact: true }).click();
  await studio
    .getByRole("slider", { name: "Playback speed" })
    .evaluate((element) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect(studio.locator(".pose-timeline-toolbar")).toContainText(
    "0.42 s",
  );
  await studio.getByLabel("Play animation").click();
  await page.waitForTimeout(220);
  await expect(studio.getByLabel("Pause animation")).toBeVisible();
  await studio.getByLabel("Pause animation").click();
  await studio.getByRole("button", { name: "Save library" }).click();
  await page.screenshot({
    path: path.join(output, "pose-combo-preview.png"),
    fullPage: true,
  });

  const sourceCount = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("floxbow-pose-studio", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const count = db
            .transaction("sources", "readonly")
            .objectStore("sources")
            .count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
  assert.equal(
    sourceCount,
    1,
    "All 200 crop regions and action steps share one original image blob.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Pose Studio", exact: true }).click();
  const reopened = page.getByRole("region", { name: "Pose Sheet Studio" });
  await expect(
    reopened.locator(".pose-character-list button").filter({ hasText: "Mina" }),
  ).toBeVisible();
  await reopened.getByRole("tab", { name: "Crop review" }).click();
  await reopened.getByRole("button", { name: "Pose 37", exact: true }).click();
  await expect(reopened.getByLabel("Crop X")).toHaveValue("325");
  await expect(reopened.getByLabel("Crop width")).toHaveValue("18");
  await expect(reopened.getByLabel("Crop image zoom")).toHaveValue("2.5");
  await expect(reopened.getByLabel("Pose review status")).toHaveValue(
    "approved",
  );
  await expect(reopened.getByRole("slider", { name: "Anchor Y" })).toHaveValue(
    "0.86",
  );
  await reopened.getByRole("tab", { name: "Erase", exact: true }).click();
  await expect(reopened.locator(".pose-mask-controls small")).toContainText(
    "1 erase stroke",
  );
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Import animation", exact: true })
    .click();
  const animationCatalog = page.getByRole("dialog", {
    name: "Choose an animation",
  });
  await expect(animationCatalog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Editor", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-panel-id="pose-studio"]')).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await animationCatalog.getByRole("button", { name: /Dance B/ }).click();
  await expect(
    animationCatalog.getByRole("heading", { name: "Dance B" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "pose-animation-catalog.png"),
    fullPage: true,
  });
  await expect(animationCatalog.getByLabel("Target scene")).toHaveValue(
    createdSceneId,
  );
  const importStart = animationCatalog.getByLabel(
    "Animation start time in seconds",
  );
  const startMinFrame = Math.ceil(
    Number(await importStart.getAttribute("min")) * 30,
  );
  const startMaxFrame = Math.floor(
    Number(await importStart.getAttribute("max")) * 30,
  );
  const selectedStartFrame = Math.floor((startMinFrame + startMaxFrame) / 2);
  let importedStartFrame = selectedStartFrame;
  await importStart.fill((selectedStartFrame / 30).toFixed(3));
  const importButton = animationCatalog.getByRole("button", {
    name: "Import into scene",
  });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(animationCatalog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Save project" }),
  ).toBeVisible();
  await expect(page.getByTestId("pose-animation-asset")).toBeVisible();
  await expect(page.getByText("Pose changes", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Pose image /)).toHaveCount(0);
  await page
    .getByLabel("Clip end time (seconds)", { exact: true })
    .fill(((selectedStartFrame + 60) / 30).toFixed(3));
  const timelineClip = page
    .locator(".timeline-clip")
    .filter({ hasText: "Mina · Dance B" });
  await expect(timelineClip).toBeVisible();
  const clipBounds = await timelineClip.boundingBox();
  assert.ok(
    clipBounds,
    "The imported action should be visible on the Timeline.",
  );
  await page.mouse.move(
    clipBounds.x + clipBounds.width / 2,
    clipBounds.y + clipBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    clipBounds.x + clipBounds.width / 2 - 30,
    clipBounds.y + clipBounds.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(timelineClip).not.toHaveAttribute(
    "data-from-frame",
    String(selectedStartFrame),
  );
  importedStartFrame = Number(
    await timelineClip.getAttribute("data-from-frame"),
  );
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page
    .getByLabel("Timeline playhead time (seconds)", { exact: true })
    .fill((importedStartFrame / 30).toFixed(3));
  const renderedCharacter = page
    .frameLocator("iframe")
    .locator("[data-character-asset-id]");
  await expect(renderedCharacter).toBeVisible();
  await expect(renderedCharacter).toHaveAttribute(
    "src",
    /\/api\/media\/.*\/stream/,
  );
  const firstRenderedPose = await renderedCharacter.getAttribute(
    "data-character-member-id",
  );
  assert.ok(firstRenderedPose, "The imported character should select a pose.");
  await page
    .getByLabel("Timeline playhead time (seconds)", { exact: true })
    .fill(((importedStartFrame + 4) / 30).toFixed(3));
  await expect(renderedCharacter).not.toHaveAttribute(
    "data-character-member-id",
    firstRenderedPose,
  );
  const poseBeforePlayback = await renderedCharacter.getAttribute(
    "data-character-member-id",
  );
  await page.getByRole("button", { name: "Play Timeline playback" }).click();
  await expect
    .poll(() => renderedCharacter.getAttribute("data-character-member-id"), {
      timeout: 3_000,
    })
    .not.toBe(poseBeforePlayback);
  const pausePlayback = page.getByRole("button", {
    name: "Pause Timeline playback",
  });
  if (await pausePlayback.isVisible()) await pausePlayback.click();
  await page.screenshot({
    path: path.join(output, "pose-imported-character.png"),
    fullPage: true,
  });
  const importedTimeline = JSON.parse(await readFile(timelinePath, "utf8"));
  const importedGroup = importedTimeline.assetGroups.find(
    (group: { source?: { comboId?: string } }) => group.source?.comboId,
  );
  const importedClip = importedTimeline.clips.find(
    (clip: { componentId: string }) => clip.componentId === "character",
  );
  assert.equal(importedGroup.source.kind, "pose-studio");
  assert.ok(importedGroup.source.characterId);
  assert.ok(importedGroup.source.sheetId);
  assert.ok(importedGroup.source.comboId);
  assert.equal(importedGroup.members.length, 3);
  assert.equal(importedClip.sceneId, createdSceneId);
  assert.equal(
    importedClip.from,
    importedStartFrame,
    "The moved action keeps its exact Timeline position after save.",
  );
  assert.equal(importedClip.durationInFrames, 60);
  assert.equal(importedClip.content.groupId, importedGroup.id);
  assert.equal(importedClip.content.loop, true);
  assert.equal(importedClip.content.poseEventSpace, "clip");
  assert.ok(importedClip.content.cycleFrames < importedClip.durationInFrames);
  assert.ok(importedClip.content.poseEvents.length > 0);
  assert.ok(
    importedClip.content.poseEvents.length <= importedGroup.members.length,
  );
  const importedMedia = JSON.parse(
    await readFile(path.join(project, "media.json"), "utf8"),
  );
  assert.equal(importedMedia.assets.length, 3);
  const timelineAfter = createHash("sha256")
    .update(await readFile(timelinePath))
    .digest("hex");
  assert.notEqual(
    timelineAfter,
    timelineBefore,
    "Explicit action import updates the project Timeline.",
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: imported one source image, reordered starter frames, corrected crop 37, saved/reopened its zoom and eraser mask, imported Dance B into Scene 1 as a saved Character clip with three registered pose PNGs, verified pose changes while seeking and playing, and kept the library source count at 1. Screenshots: ${output}`,
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
  throw error;
} finally {
  await browser?.close();
  await servers.close();
  await rm(project, { recursive: true, force: true });
}
