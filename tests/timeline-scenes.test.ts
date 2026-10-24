import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditTimeline } from "@motion/sdk/timeline";
import {
  createTimelineScene,
  renameTimelineScene,
  resizeTimelineScene,
  sceneLocalFrame,
} from "../apps/desktop/src/timeline-scenes";

function fixture() {
  return parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 900,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [
      {
        id: "first-bg",
        trackId: "visuals",
        componentId: "image",
        label: "Background",
        from: 0,
        durationInFrames: 300,
        content: { assetId: "forest" },
        props: {},
      },
      {
        id: "second-text",
        trackId: "visuals",
        componentId: "text",
        label: "Title",
        from: 300,
        durationInFrames: 300,
        content: { text: "Second" },
        props: {},
      },
      {
        id: "third-text",
        trackId: "visuals",
        componentId: "text",
        label: "Third",
        from: 600,
        durationInFrames: 300,
        content: { text: "Third" },
        props: {},
      },
    ],
  });
}

test("scene resize ripples later scenes and their clips without stretching", () => {
  let doc = createTimelineScene(
    fixture(),
    { id: "s1", name: "Opening", from: 0, durationInFrames: 300 },
    ["first-bg"],
  );
  doc = createTimelineScene(
    doc,
    { id: "s2", name: "Middle", from: 300, durationInFrames: 300 },
    ["second-text"],
  );
  doc = createTimelineScene(
    doc,
    { id: "s3", name: "Ending", from: 600, durationInFrames: 300 },
    ["third-text"],
  );
  const resized = resizeTimelineScene(doc, "s1", 450);
  assert.deepEqual(
    resized.scenes?.map(({ from, durationInFrames }) => [
      from,
      durationInFrames,
    ]),
    [
      [0, 450],
      [450, 300],
      [750, 300],
    ],
  );
  assert.deepEqual(
    resized.clips.map(({ from, durationInFrames }) => [from, durationInFrames]),
    [
      [0, 300],
      [450, 300],
      [750, 300],
    ],
  );
  assert.equal(resized.durationInFrames, 1050);
  assert.equal(sceneLocalFrame(resized.scenes![1], 510), 60);
});

test("scene shortening rejects clips beyond the new boundary without mutating", () => {
  const doc = createTimelineScene(
    fixture(),
    { id: "s1", name: "Opening", from: 0, durationInFrames: 300 },
    ["first-bg"],
  );
  assert.throws(
    () => resizeTimelineScene(doc, "s1", 250),
    /extends past its new end/,
  );
  assert.equal(doc.scenes?.[0].durationInFrames, 300);
  assert.equal(doc.clips[0].durationInFrames, 300);
});

test("scene edits preserve legacy projects and validate membership boundaries", () => {
  const legacy = fixture();
  assert.equal(Object.hasOwn(legacy, "scenes"), false);
  assert.equal(Object.hasOwn(legacy.clips[0], "sceneId"), false);
  const sceneDoc = createTimelineScene(
    legacy,
    { id: "s1", name: "Opening", from: 0, durationInFrames: 300 },
    ["first-bg"],
  );
  assert.equal(sceneDoc.clips[0].sceneId, "s1");
  assert.throws(
    () =>
      parseEditTimeline({
        ...sceneDoc,
        clips: sceneDoc.clips.map((clip) =>
          clip.id === "first-bg" ? { ...clip, from: 1 } : clip,
        ),
      }),
    /scene s1 boundaries/,
  );
  assert.equal(
    renameTimelineScene(sceneDoc, "s1", "Start").scenes?.[0].name,
    "Start",
  );
});
