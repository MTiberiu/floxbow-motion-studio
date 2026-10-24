import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { changeTimelineClipRangeWithRipple } from "../apps/desktop/src/timeline-ripple";

function fixture(locked = false) {
  return parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 600,
    scenes: [
      { id: "one", name: "One", from: 0, durationInFrames: 300 },
      { id: "two", name: "Two", from: 300, durationInFrames: 300 },
    ],
    tracks: [
      { id: "visuals", name: "Visuals", kind: "visual" },
      { id: "captions", name: "Captions", kind: "visual", locked },
    ],
    clips: [
      {
        id: "a",
        sceneId: "one",
        trackId: "visuals",
        componentId: "image",
        label: "Image A",
        from: 0,
        durationInFrames: 150,
        content: { assetId: "forest" },
        props: {},
      },
      {
        id: "b",
        sceneId: "one",
        trackId: "captions",
        componentId: "subtitles",
        label: "Caption B",
        from: 150,
        durationInFrames: 150,
        content: { text: "B" },
        props: {},
      },
      {
        id: "c",
        sceneId: "two",
        trackId: "visuals",
        componentId: "image",
        label: "Image C",
        from: 300,
        durationInFrames: 300,
        content: { assetId: "forest" },
        props: {},
      },
    ],
  });
}

test("ripple duration edit moves downstream clips and expands following scenes safely", () => {
  const result = changeTimelineClipRangeWithRipple(
    fixture(),
    "a",
    0,
    180,
    true,
    true,
  );
  assert.deepEqual(
    result.clips.map(({ id, from, durationInFrames }) => [
      id,
      from,
      durationInFrames,
    ]),
    [
      ["a", 0, 180],
      ["b", 180, 150],
      ["c", 330, 300],
    ],
  );
  assert.deepEqual(
    result.scenes?.map(({ from, durationInFrames }) => [
      from,
      durationInFrames,
    ]),
    [
      [0, 330],
      [330, 300],
    ],
  );
  assert.equal(result.durationInFrames, 630);
});

test("normal mode changes only the edited clip", () => {
  const result = changeTimelineClipRangeWithRipple(
    fixture(),
    "a",
    0,
    180,
    true,
    false,
  );
  assert.equal(result.clips.find((clip) => clip.id === "b")?.from, 150);
  assert.equal(result.scenes?.[0].durationInFrames, 300);
});

test("ripple rejects locked downstream content and clips crossing the boundary", () => {
  assert.throws(
    () =>
      changeTimelineClipRangeWithRipple(fixture(true), "a", 0, 180, true, true),
    /track Captions is locked/,
  );
  const overlapping = fixture().clips.map((clip) =>
    clip.id === "b" ? { ...clip, from: 130, durationInFrames: 40 } : clip,
  );
  const boundaryDoc = parseEditTimeline({ ...fixture(), clips: overlapping });
  assert.throws(
    () =>
      changeTimelineClipRangeWithRipple(boundaryDoc, "a", 0, 180, true, true),
    /crosses the edit boundary/,
  );
});
