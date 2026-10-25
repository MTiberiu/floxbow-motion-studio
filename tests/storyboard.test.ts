import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  emptyStoryboard,
  newScene,
  newSet,
  storyboardSchema,
  directorBrief,
  sceneFingerprint,
  timingWarnings,
} from "@motion/project-loader/storyboard";
import {
  readStoryboard,
  saveStoryboard,
  resolveStoryboardContext,
  storyboardTiming,
} from "../scripts/storyboard-store";
import { createProject } from "../scripts/project-scaffold";
import { manifestSchema } from "@motion/project-loader";
import { zipFiles } from "../apps/desktop/src/storyboard-export";
import { renderStoryboardSvg } from "@motion/project-loader/storyboard-svg";
function fixture() {
  const doc = emptyStoryboard("story-test"),
    scene = newScene("scene-office", "Andrei and Oana");
  doc.scenes.push(scene);
  scene.duration = 20;
  scene.objects.push({
    id: "obj-chair",
    name: "Chair",
    category: "prop",
    description: "The same chair throughout",
    instructions: "Do not move it",
    referenceIds: ["ref-chair"],
  });
  doc.references.push({
    id: "ref-chair",
    assetId: "chair",
    name: "Chair appearance",
    category: "prop",
    description: "Original appearance",
  });
  [
    "Empty office",
    "Andrei enters",
    "Andrei trips",
    "Oana enters",
    "Andrei sits",
  ].forEach((name, i) => {
    const set = newSet(`set-${i + 1}`, name);
    set.start = [0, 3, 6, 10, 14][i];
    set.duration = [3, 3, 4, 4, 6][i];
    set.representations.push({
      id: `rep-${i + 1}`,
      setId: set.id,
      coordinateSpace: "composition-percent",
      anchor: "top-left",
      rotation: 0,
      zOrder: 0,
      spatialNote: "",
      referenceId: null,
      objectId: "obj-chair",
      kind: "rectangle",
      x: 10,
      y: 20,
      width: 30,
      height: 50,
      points: [],
      color: "#123456",
      thickness: 3,
      text: "",
      visible: true,
      opacity: 1,
      locked: false,
      pose: "",
      instructions: "",
      motion: "",
    });
    scene.sets.push(set);
  });
  return doc;
}
test("storyboard validates continuity, identities, timing and reference relations", () => {
  const doc = fixture();
  assert.deepEqual(storyboardSchema.parse(doc), doc);
  assert.deepEqual(timingWarnings(doc.scenes[0]), []);
  const copy = structuredClone(doc);
  copy.scenes[0].sets[1].representations[0].x = 80;
  assert.equal(copy.scenes[0].sets[0].representations[0].x, 10);
  assert.equal(copy.scenes[0].sets[1].representations[0].objectId, "obj-chair");
  copy.scenes[0].sets[1].start = 2;
  assert.match(timingWarnings(copy.scenes[0]).join(), /overlaps/);
  copy.scenes[0].sets[0].duration = -1;
  assert.throws(() => storyboardSchema.parse(copy));
  copy.scenes[0].sets[0].duration = 3;
  copy.scenes[0].sets[0].representations[0].objectId = "unknown";
  assert.throws(() => storyboardSchema.parse(copy));
  assert.throws(() =>
    storyboardSchema.parse({ ...doc, projectId: "../escape" }),
  );
  doc.scenes[0].sets[1].id = doc.scenes[0].sets[0].id;
  assert.throws(() => storyboardSchema.parse(doc));
});
test("brief preserves instructions, separates suggestions, marks stale source and uncertainty", () => {
  const doc = fixture(),
    scene = doc.scenes[0];
  scene.sets[2].description = "Raised arm means recovery, not waving.";
  const fp = sceneFingerprint(doc, scene);
  doc.briefs.push({
    id: "brief-one",
    sceneId: scene.id,
    text: "Hold the reaction.",
    sourceFingerprint: fp,
    approved: true,
  });
  assert.equal(sceneFingerprint(doc, scene), fp);
  scene.sets[2].description += " Pause briefly.";
  scene.sets[3].start = null;
  const brief = directorBrief(doc, {
    name: "Synthetic comedy",
    width: 1920,
    height: 1080,
    fps: 30,
  });
  for (const expected of [
    "Raised arm",
    "Hold the reaction",
    "STALE",
    "timing is unspecified",
    "Chair (obj-chair)",
    "Original appearance",
    "sketches/set-3.png",
  ])
    assert.ok(brief.includes(expected), expected);
});
test("storyboard atomic save/reload, conflict rejection, agent resolver and real subtitle adapter", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "storyboard-test-"));
  try {
    const manifest = manifestSchema.parse(
        await createProject(root, "story-test"),
      ),
      project = path.join(root, "story-test"),
      doc = fixture();
    const initial = await readStoryboard(project, manifest.id);
    assert.equal(initial.revision, "missing");
    const saved = await saveStoryboard(
      project,
      manifest.id,
      doc,
      initial.revision,
    );
    assert.deepEqual(
      (await readStoryboard(project, manifest.id)).document,
      doc,
    );
    await assert.rejects(
      saveStoryboard(project, manifest.id, doc, "missing"),
      /CONFLICT/,
    );
    const context = await resolveStoryboardContext(
      root,
      manifest.id,
      "getSetContext",
      "scene-office",
      "set-3",
    );
    assert.equal(
      (context.result as { followingSet: { id: string } }).followingSet.id,
      "set-4",
    );
    assert.equal(context.revision, saved.revision);
    await assert.rejects(
      resolveStoryboardContext(root, "../escape", "listStoryboardScenes"),
    );
    await assert.rejects(
      resolveStoryboardContext(
        root,
        manifest.id,
        "getSetContext",
        "scene-office",
        "missing",
      ),
    );
    const file = path.join(project, "edit-timeline.json"),
      timeline = JSON.parse(await readFile(file, "utf8"));
    timeline.clips.push({
      id: "cue",
      label: "Synthetic timing evidence",
      trackId: "captions",
      componentId: "subtitles",
      from: 30,
      durationInFrames: 60,
      content: {
        text: "Andrei trips",
        status: "demo",
        words: [
          { id: "w1", text: "Andrei", start: 0, end: 0.5 },
          { id: "w2", text: "trips", start: 0.6, end: 1 },
        ],
      },
      props: {},
    });
    await writeFile(file, JSON.stringify(timeline));
    const timing = await storyboardTiming(project, manifest);
    assert.equal(timing.cues[0].words![1].start, 1.6);
    assert.equal(timing.cues[0].status, "demo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("portable ZIP directory points to exact bytes and rejects traversal", async () => {
  const data = new TextEncoder().encode("storyboard evidence");
  const zip = new Uint8Array(
    await zipFiles([{ name: "sketches/set-1.png", data }]).arrayBuffer(),
  );
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const length = view.getUint16(26, true);
  assert.deepEqual(zip.slice(30 + length, 30 + length + data.length), data);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.throws(() => zipFiles([{ name: "../private", data }]), /Unsafe/);
});

test("portrait spatial contract retains bounds, order, rotation and independent representations", () => {
  const doc = fixture();
  doc.composition = { width: 1080, height: 1920, fps: 30 };
  const r = doc.scenes[0].sets[2].representations[0];
  Object.assign(r, {
    x: 78,
    y: 82,
    width: 12,
    height: 15,
    rotation: 12,
    spatialNote: "Mug on lower-right desk",
  });
  const restored = storyboardSchema.parse(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored.scenes[0].sets[2].representations[0], r);
  assert.equal(restored.scenes[0].sets[0].representations[0].x, 10);
  const svg = renderStoryboardSvg(restored, restored.scenes[0].sets[2]);
  assert.match(svg, /viewBox="0 0 1080 1920"/);
  assert.match(svg, /rotate\(12\)/);
  assert.match(svg, /width="129.6" height="288"/);
  r.kind = "text";
  r.text = '<script>alert("bad")</script>';
  assert.ok(
    !renderStoryboardSvg(doc, doc.scenes[0].sets[2]).includes("<script>"),
  );
});
