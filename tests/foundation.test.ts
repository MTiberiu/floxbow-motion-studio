import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { manifestSchema, discover, safeFile } from "@motion/project-loader";
import {
  fromLyrics,
  reconcile,
  parseTimeline,
  toJSON,
  toSRT,
  toLRC,
  toWords,
} from "@motion/lyrics-sync";
const manifest = {
  id: "test-video",
  name: "Test",
  type: "explainer",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 180,
  entry: "Composition.tsx",
  sdkVersion: "0.1.0",
};
test("manifest rejects traversal, incompatible SDK and invalid dimensions", () => {
  assert.equal(manifestSchema.parse(manifest).id, "test-video");
  for (const patch of [
    { entry: "../evil.tsx" },
    { entry: "C:/evil.tsx" },
    { entry: "x\\evil.tsx" },
    { sdkVersion: "9.0.0" },
    { fps: 0 },
    { width: 0 },
    { durationInFrames: 1.2 },
    { id: "../escape" },
  ])
    assert.throws(() => manifestSchema.parse({ ...manifest, ...patch }));
});
test("discovery isolates malformed projects and detects added folders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "motion-test-"));
  try {
    await mkdir(path.join(root, "broken"));
    await writeFile(path.join(root, "broken/project.json"), "{");
    assert.equal((await discover(root))[0].id, "broken");
    await mkdir(path.join(root, "test-video"));
    await writeFile(
      path.join(root, "test-video/project.json"),
      JSON.stringify(manifest),
    );
    await writeFile(
      path.join(root, "test-video/Composition.tsx"),
      "export default ()=>null",
    );
    const list = await discover(root);
    assert.equal(list.length, 2);
    assert.ok(list.find((p) => p.id === "broken")?.error);
    assert.equal(list.find((p) => p.id === "test-video")?.manifest?.fps, 30);
    await assert.rejects(safeFile(root, "../escape"));
    await writeFile(
      path.join(root, "test-video/project.json"),
      JSON.stringify({ ...manifest, id: "wrong" }),
    );
    assert.match(
      (await discover(root)).find((p) => p.id === "test-video")!.error!,
      /match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("lyrics never invent timing and reconciliation preserves repeated occurrences", () => {
  const t = fromLyrics("go go\nmissing");
  assert.equal(t.lines[0].words[0].start, null);
  assert.equal(toSRT(t), "");
  const matched = reconcile("go go\nmissing", {
    segments: [
      {
        words: [
          { word: "Go!", start: 1, end: 2, score: 0.8 },
          { word: "go", start: 3, end: 4, score: 0.9 },
        ],
      },
    ],
  });
  assert.equal(matched.lines[0].words[1].start, 3);
  assert.equal(matched.lines[1].words[0].start, null);
  assert.equal(matched.status, "unverified");
  assert.match(toSRT(matched), /00:00:01,000 --> 00:00:04,000/);
  assert.equal(toLRC(matched), "[00:01.00]go go");
  assert.equal(JSON.parse(toWords(matched)).length, 3);
  assert.deepEqual(parseTimeline(JSON.parse(toJSON(matched))), matched);
});
test("timeline rejects reversed intervals, duplicate IDs and invalid repeats", () => {
  const t = reconcile("one two", {
    segments: [
      {
        words: [
          { word: "one", start: 1, end: 2 },
          { word: "two", start: 3, end: 4 },
        ],
      },
    ],
  });
  const reverse = structuredClone(t);
  reverse.lines[0].words[0].end = 0;
  assert.throws(() => parseTimeline(reverse));
  const duplicate = structuredClone(t);
  duplicate.lines[0].words[1].id = duplicate.lines[0].words[0].id;
  assert.throws(() => parseTimeline(duplicate));
  const repeat = structuredClone(t);
  repeat.lines[0].repeatOf = "no-such-line";
  assert.throws(() => parseTimeline(repeat));
  const overlap = structuredClone(t);
  overlap.lines[0].words[1].start = 1.5;
  assert.throws(() => parseTimeline(overlap));
});
