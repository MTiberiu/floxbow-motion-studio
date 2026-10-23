import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditTimeline } from "@motion/sdk/timeline";
import {
  findLargeTimelineGaps,
  lastTimelineClipEnd,
  timelineGapWarnings,
  timelinePlaybackEnd,
} from "@motion/sdk/timeline-analysis";
import {
  addTimelineClipCopy,
  canPerformTimelineOperation,
  removeTimelineClip,
} from "../apps/desktop/src/timeline-operations";

const document = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 300,
  tracks: [
    { id: "visual", name: "Visual" },
    { id: "audio", name: "Audio" },
  ],
  clips: [
    {
      id: "title",
      trackId: "visual",
      componentId: "title",
      label: "Title",
      from: 0,
      durationInFrames: 30,
      content: { text: "Keep me" },
      props: { color: "#ffffff" },
    },
    {
      id: "song",
      trackId: "audio",
      componentId: "soundtrack",
      label: "Song",
      from: 0,
      durationInFrames: 30,
      content: { assetId: "song-1" },
      props: {},
    },
    {
      id: "end-card",
      trackId: "visual",
      componentId: "title",
      label: "End",
      from: 240,
      durationInFrames: 30,
      content: {},
      props: {},
    },
  ],
});

test("shared clip copy preserves identity data and extends duration without copying media", () => {
  const source = document.clips[0];
  const next = addTimelineClipCopy(document, source, "title-copy", 300, []);
  const copy = next.clips.find((clip) => clip.id === "title-copy")!;
  assert.equal(copy.from, 300);
  assert.equal(copy.durationInFrames, source.durationInFrames);
  assert.deepEqual(copy.content, source.content);
  assert.deepEqual(copy.props, source.props);
  assert.equal(next.durationInFrames, 330);
  assert.equal(next.clips.length, document.clips.length + 1);
});

test("soundtrack operation constraints reject editing operations", () => {
  const soundtrack = document.clips.find(
    (clip) => clip.componentId === "soundtrack",
  )!;
  for (const operation of [
    "move",
    "copy",
    "cut",
    "paste",
    "duplicate",
    "delete",
  ] as const)
    assert.equal(canPerformTimelineOperation(soundtrack, operation, []), false);
  assert.throws(
    () => addTimelineClipCopy(document, soundtrack, "song-copy", 30, []),
    /does not allow/,
  );
  assert.throws(
    () => removeTimelineClip(document, soundtrack, []),
    /cannot be deleted/,
  );
});

test("large gap analysis reports visual/audio timeline intervals without changing duration", () => {
  assert.equal(lastTimelineClipEnd(document), 270);
  const gaps = findLargeTimelineGaps(document);
  assert.equal(gaps.length, 2);
  assert.deepEqual(
    gaps.find((gap) => gap.trackId === "visual"),
    {
      trackId: "visual",
      from: 30,
      end: 240,
      previousClipId: "title",
      nextClipId: "end-card",
    },
  );
  assert.deepEqual(
    gaps.find((gap) => gap.trackId === "audio"),
    {
      trackId: "audio",
      from: 30,
      end: 300,
      previousClipId: "song",
      nextClipId: null,
    },
  );
  assert.equal(document.durationInFrames, 300);
});

test("preview playback end can avoid blank tail without changing export duration", () => {
  assert.equal(timelinePlaybackEnd(document), 270);
  assert.equal(timelinePlaybackEnd(document, true), 300);
  assert.equal(document.durationInFrames, 300);
  const empty = parseEditTimeline({
    ...document,
    clips: [],
  });
  assert.equal(timelinePlaybackEnd(empty), empty.durationInFrames);
});

test("editor gap warnings locate visual clips and ignore soundtrack-only gaps", () => {
  const warnings = timelineGapWarnings(document);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0], {
    trackId: "visual",
    trackName: "Visual",
    from: 30,
    end: 240,
    previousClipId: "title",
    nextClipId: "end-card",
    kind: "between",
  });

  const late = parseEditTimeline({
    ...document,
    clips: [document.clips[2]],
  });
  assert.equal(timelineGapWarnings(late)[0]?.kind, "late");
  assert.equal(timelineGapWarnings(late)[0]?.nextClipId, "end-card");
});
