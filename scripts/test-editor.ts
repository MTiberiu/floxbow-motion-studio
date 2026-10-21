import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";
import { createHash } from "node:crypto";
const built = process.argv.includes("--built");
const servers = await startServers(built, 1000);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k, v]) => v !== undefined && k !== "ELECTRON_RUN_AS_NODE",
  ),
) as Record<string, string>;
env.STUDIO_URL = servers.url;
const fixture = path.join(projectsDir, "editor-fixture");
let owned = false;
const app = await electron.launch({
  executablePath: electronPath as unknown as string,
  args: [path.join(root, "apps/desktop/electron/main.cjs")],
  env,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
page.on("console", (msg) => {
  if (msg.text().includes("[motion-editor]")) console.log(msg.text());
});
const frame = page.frameLocator("iframe");
const seek = async (f: number) => {
  await page.getByLabel("Playhead frame", { exact: true }).fill(String(f));
  await expect(page.getByTestId("frame-readout")).toContainText(`${f} /`);
};
try {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("motion-draft-v1:")) localStorage.removeItem(key);
  });
  await page.reload();
  await page.getByRole("button", { name: /First Tutorial/ }).click();
  await frame.getByText("Great stories start with an idea.").waitFor();
  await mkdir(path.join(root, "out"), { recursive: true });
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight <=
              document.documentElement.clientHeight + 1 &&
            document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: path.join(root, `out/editor-workspace-${size.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".canvas-surface")).not.toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await page
    .getByRole("button", { name: "Reset canvas view", exact: true })
    .click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.keyboard.down("Space");
  const canvasBox = (await page.locator(".canvas-pan-input").boundingBox())!;
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 35,
    canvasBox.y + canvasBox.height / 2 + 20,
  );
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.locator(".canvas-surface")).not.toHaveCSS(
    "translate",
    "none",
  );
  await page
    .getByRole("button", { name: "Reset canvas view", exact: true })
    .click();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".preview-stage")).toHaveClass(
    /preview-fullscreen/,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".preview-stage")).not.toHaveClass(
    /preview-fullscreen/,
  );
  await expect(page.locator("[data-clip-id]")).toHaveCount(6);
  await seek(240);
  await frame.getByText("Three scenes. Reusable motion. Your story.").waitFor();
  await seek(420);
  await frame.getByText("CREATE. REUSE. EVOLVE.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        await page.getByLabel("Playhead frame", { exact: true }).inputValue(),
      ),
    )
    .toBeGreaterThan(420);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  const paused = await page
    .getByLabel("Playhead frame", { exact: true })
    .inputValue();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("Playhead frame", { exact: true })).toHaveValue(
    paused,
  );
  await page.getByRole("button", { name: /GI GO LO/ }).click();
  await frame.getByText(/ILLUSTRATIVE TIMING ONLY/).waitFor();
  await seek(59);
  await expect(
    frame.locator('[data-subtitle-id="chorus-1"] [data-word="0"]'),
  ).toHaveAttribute("data-active", "true");
  await seek(60);
  await expect(
    frame.locator('[data-subtitle-id="chorus-1"] [data-word="1"]'),
  ).toHaveAttribute("data-active", "true");
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveAttribute(
    "data-local-frame",
    "60",
  );
  await seek(179);
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toBeVisible();
  await seek(180);
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveCount(0);
  await expect(frame.locator('[data-subtitle-id="chorus-2"]')).toHaveAttribute(
    "data-local-frame",
    "0",
  );
  await page
    .getByRole("button", { name: "Clip chorus-1", exact: true })
    .click();
  await expect(page.getByLabel("Font size", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByLabel("Font size", { exact: true }).fill("80");
  await page.getByLabel("Font", { exact: true }).selectOption("Georgia");
  await seek(60);
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveCSS(
    "font-size",
    "80px",
  );
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveCSS(
    "font-family",
    "Georgia",
  );
  const inspectorBefore = await page
    .locator(".editor-columns")
    .evaluate((e) => getComputedStyle(e).getPropertyValue("--inspector-width"));
  const inspectorGrip = (await page
    .getByRole("button", { name: "Resize inspector", exact: true })
    .boundingBox())!;
  await page.mouse.move(inspectorGrip.x + 2, inspectorGrip.y + 10);
  await page.mouse.down();
  await page.mouse.move(inspectorGrip.x - 35, inspectorGrip.y + 10, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator(".editor-columns")
        .evaluate((e) =>
          getComputedStyle(e).getPropertyValue("--inspector-width"),
        ),
    )
    .not.toBe(inspectorBefore);
  const timelineBefore = await page
    .locator(".timeline-editor")
    .evaluate((e) => getComputedStyle(e).getPropertyValue("--timeline-height"));
  const timelineGrip = (await page
    .getByRole("button", { name: "Resize timeline height", exact: true })
    .boundingBox())!;
  await page.mouse.move(
    timelineGrip.x + timelineGrip.width / 2,
    timelineGrip.y + 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    timelineGrip.x + timelineGrip.width / 2,
    timelineGrip.y - 35,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator(".timeline-editor")
        .evaluate((e) =>
          getComputedStyle(e).getPropertyValue("--timeline-height"),
        ),
    )
    .not.toBe(timelineBefore);
  await page.getByLabel("Animation", { exact: true }).selectOption("fade");
  await seek(0);
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveCSS(
    "opacity",
    "0",
  );
  await seek(30);
  await expect(frame.locator('[data-subtitle-id="chorus-1"]')).toHaveCSS(
    "opacity",
    "1",
  );
  await page.getByLabel("Text", { exact: true }).fill("Edited subtitle");
  await expect(
    frame.getByText("Edited subtitle", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Text changed: word timing cleared/),
  ).toBeVisible();
  const clip = page.locator('[data-clip-id="chorus-1"]');
  await page.getByLabel("Timeline zoom", { exact: true }).selectOption("2");
  await page.locator(".timeline-scroll").evaluate((el) => {
    el.scrollLeft = 80;
  });
  let box = (await clip.boundingBox())!;
  const lane = (await page.locator('[data-track="lyrics"]').boundingBox())!;
  const delta = lane.width / 12;
  await expect
    .poll(() =>
      page
        .locator(".timeline-scroll")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    )
    .toBe(true);
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Clip start frame")).toHaveValue("30");
  await expect(page.getByLabel("Clip end frame")).toHaveValue("210");
  let handle = (await page
    .getByRole("button", { name: "Resize end chorus-1", exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - delta, handle.y + 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Clip end frame")).toHaveValue("180");
  handle = (await page
    .getByRole("button", { name: "Resize start chorus-1", exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + delta, handle.y + 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Clip start frame")).toHaveValue("60");
  await seek(59);
  await expect(frame.getByText("Edited subtitle", { exact: true })).toHaveCount(
    0,
  );
  await seek(90);
  await expect(
    frame.getByText("Edited subtitle", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Clip start frame")).toHaveValue("30");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Clip start frame")).toHaveValue("60");
  await page.getByLabel("Timeline zoom", { exact: true }).selectOption("Fit");
  await page.locator(".timeline-scroll").evaluate((el) => {
    el.scrollLeft = 0;
  });
  const baseTracks = await page.locator(".track-row").count();
  for (let i = baseTracks; i < 20; i++)
    await page.getByRole("button", { name: "Add track", exact: true }).click();
  await expect(page.locator(".track-row")).toHaveCount(20);
  await page.locator(".timeline-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() =>
      page.locator(".timeline-scroll").evaluate((el) => el.scrollTop > 0),
    )
    .toBe(true);
  await page.locator(".timeline-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByLabel("Clip track").selectOption({ label: "Track 3" });
  await expect(
    page.locator('[data-track^="track-"] [data-clip-id="chorus-1"]'),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Duplicate clip", exact: true })
    .click();
  await expect(page.locator("[data-clip-id]")).toHaveCount(4);
  const ruler = (await page
    .getByRole("slider", { name: "Timeline playhead" })
    .boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + 15);
  await expect(page.getByLabel("Playhead frame", { exact: true })).toHaveValue(
    "180",
  );
  await page.getByLabel("Import subtitles", { exact: true }).setInputFiles({
    name: "sample.srt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "1\n00:00:01,000 --> 00:00:03,000\nImported lyric\n\n2\n00:00:06,000 --> 00:00:09,000\nRepeated chorus\n",
    ),
  });
  await seek(60);
  await expect(
    frame.getByText("Imported lyric", { exact: true }),
  ).toBeVisible();
  const exportPath = path.join(root, "out/editor-timing-test.json");
  await mkdir(path.join(root, "out"), { recursive: true });
  await rm(exportPath, { force: true });
  await app.evaluate(({ session }, target) => {
    session.defaultSession.once("will-download", (_event, item) => {
      item.setSavePath(target);
    });
  }, exportPath);
  await page
    .getByRole("button", { name: "Export timing JSON", exact: true })
    .click();
  await expect
    .poll(async () => readFile(exportPath, "utf8").catch(() => ""))
    .toContain("segments");
  const data = JSON.parse(
    await readFile(path.join(root, "out/editor-timing-test.json"), "utf8"),
  );
  if (data.segments[0].start !== 1 || "props" in data.segments[0])
    throw new Error("Timing export mixed appearance or lost timing");
  await page.screenshot({
    path: path.join(root, "out/editor-verified.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reload from disk", exact: true })
    .click();
  if (!built) {
    const hashes = await Promise.all(
      ["apps/desktop/src/main.tsx", "apps/desktop/electron/main.cjs"].map(
        async (p) =>
          createHash("sha256")
            .update(await readFile(path.join(root, p)))
            .digest("hex"),
      ),
    );
    await mkdir(fixture);
    owned = true;
    await cp(path.join(projectsDir, "gi-go-lo"), fixture, { recursive: true });
    const m = JSON.parse(
      await readFile(path.join(fixture, "project.json"), "utf8"),
    );
    m.id = "editor-fixture";
    m.name = "Agent Fixture";
    await writeFile(path.join(fixture, "project.json"), JSON.stringify(m));
    await page.getByRole("button", { name: /Agent Fixture/ }).click();
    await page
      .getByRole("button", { name: "Clip chorus-1", exact: true })
      .click();
    await page.getByLabel("Text", { exact: true }).fill("Saved by user");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to the project. Renders use these edits."),
    ).toBeVisible();
    const saved = JSON.parse(
      await readFile(path.join(fixture, "edit-timeline.json"), "utf8"),
    );
    if (saved.clips[1].content.text !== "Saved by user")
      throw new Error("Save did not persist");
    const updated = structuredClone(saved);
    updated.clips[1].content.text = "Agent generated content";
    updated.clips[1].props.color = "#ff0000";
    await writeFile(
      path.join(fixture, "edit-timeline.json"),
      JSON.stringify(updated),
    );
    await seek(60);
    await expect(
      frame.getByText("Agent generated content", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clip chorus-1", exact: true })
      .click();
    await page.getByLabel("Text", { exact: true }).fill("Unsaved user edit");
    updated.clips[1].content.text = "Concurrent agent edit";
    await writeFile(
      path.join(fixture, "edit-timeline.json"),
      JSON.stringify(updated),
    );
    await expect(
      page.getByText(/project changed on disk while you were editing/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    // A project-only schema change proves controls are not hard-coded into the shell.
    const source = await readFile(
      path.join(fixture, "Composition.tsx"),
      "utf8",
    );
    const extended = source.replace(
      /subtitleModule\s*,?\s*];/,
      `{...subtitleModule,fields:[{...subtitleModule.fields[0],label:'Agent note'},...subtitleModule.fields.slice(1)]}];`,
    );
    if (extended === source)
      throw new Error("Fixture extension was not applied");
    await writeFile(path.join(fixture, "Composition.tsx"), extended);
    await page.getByRole("button", { name: /Reload preview/ }).click();
    await expect(page.getByLabel("Agent note", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByLabel("Agent note", { exact: true }).fill("Contract works");
    await expect(
      frame.getByText("Contract works", { exact: true }),
    ).toBeVisible();
    const after = await Promise.all(
      ["apps/desktop/src/main.tsx", "apps/desktop/electron/main.cjs"].map(
        async (p) =>
          createHash("sha256")
            .update(await readFile(path.join(root, p)))
            .digest("hex"),
      ),
    );
    if (JSON.stringify(hashes) !== JSON.stringify(after))
      throw new Error("Agent workflow changed editor core");
    await page.getByRole("button", { name: /First Tutorial/ }).click();
  }
  console.log(
    `PASS ${built ? "built" : "development"}: both demos, play/pause, exact frame/word boundaries, seeking, move/trim handles, selection, schema controls, styles, text, tracks, repeats, import/export${built ? "" : ", disk save, external agent updates and conflict protection"}.`,
  );
} catch (e) {
  console.error(
    "PREVIEW:",
    await page.frames()[1]?.locator("body").innerText(),
  );
  console.error(
    "EXTENSION SERVED:",
    (
      await (
        await fetch(
          servers.previewOrigin + "/projects/editor-fixture/Composition.tsx",
        )
      ).text()
    ).includes("agentNote"),
  );
  await page.screenshot({
    path: path.join(root, "out/editor-failure.png"),
    fullPage: true,
  });
  throw e;
} finally {
  await page
    .evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("motion-draft-v1:")) localStorage.removeItem(key);
    })
    .catch(() => {});
  await app.close();
  await servers.close();
  if (owned) await rm(fixture, { recursive: true, force: true });
}
