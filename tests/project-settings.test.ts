import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import {
  readProjectSettings,
  saveProjectCanvasSize,
} from "../scripts/project-settings";

async function withProject(run: (root: string) => Promise<void>) {
  const root = path.join(
    process.cwd(),
    "node_modules",
    ".cache",
    `flox-settings-test-${randomUUID()}`,
  );
  await mkdir(root, { recursive: true });
  try {
    await writeFile(
      path.join(root, "project.json"),
      `${JSON.stringify(
        {
          id: "test-project",
          name: "Test project",
          type: "custom",
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames: 300,
          entry: "src/composition.tsx",
          sdkVersion: "0.1.0",
          editTimeline: "timeline.json",
          extensionData: { owner: "external-agent" },
        },
        null,
        2,
      )}\n`,
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Canvas format changes preserve project data and require a current revision", async () => {
  await withProject(async (root) => {
    const before = await readProjectSettings(root);
    const saved = await saveProjectCanvasSize(
      root,
      before.revision,
      1080,
      1920,
    );
    assert.deepEqual(
      [saved.manifest.width, saved.manifest.height],
      [1080, 1920],
    );
    assert.equal(saved.manifest.durationInFrames, 300);
    assert.equal(saved.manifest.editTimeline, "timeline.json");
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, "project.json"), "utf8"))
        .extensionData,
      { owner: "external-agent" },
    );
    assert.notEqual(saved.revision, before.revision);
    assert.deepEqual(
      await readProjectSettings(root).then(({ manifest }) => [
        manifest.width,
        manifest.height,
      ]),
      [1080, 1920],
    );
    await assert.rejects(
      saveProjectCanvasSize(root, before.revision, 1080, 1080),
      /CONFLICT/,
    );
  });
});

test("Canvas format rejects invalid dimensions without changing project JSON", async () => {
  await withProject(async (root) => {
    const before = await readFile(path.join(root, "project.json"), "utf8");
    const { revision } = await readProjectSettings(root);
    await assert.rejects(
      saveProjectCanvasSize(root, revision, 0, 1080),
      /whole pixels/,
    );
    assert.equal(
      await readFile(path.join(root, "project.json"), "utf8"),
      before,
    );
  });
});
