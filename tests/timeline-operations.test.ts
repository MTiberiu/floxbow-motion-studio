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

test("soundtrack remains fixed for timing edits but can be deleted", () => {
  const soundtrack = document.clips.find(
    (clip) => clip.componentId === "soundtrack",
  )!;
  for (const operation of [
    "move",
    "copy",
    "cut",
    "paste",
    "duplicate",
  ] as const)
    assert.equal(canPerformTimelineOperation(soundtrack, operation, []), false);
  assert.equal(canPerformTimelineOperation(soundtrack, "delete", []), true);
  assert.throws(
    () => addTimelineClipCopy(document, soundtrack, "song-copy", 30, []),
    /does not allow/,
  );
  const deleted = removeTimelineClip(document, soundtrack, []);
  assert.equal(
    deleted.clips.some((clip) => clip.id === soundtrack.id),
    false,
  );
});

test("large gap analysis reports globally empty visual intervals without changing duration", () => {
  assert.equal(lastTimelineClipEnd(document), 270);
  const gaps = findLargeTimelineGaps(document);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], {
    trackId: "visual-composition",
    from: 30,
    end: 240,
    previousClipId: "title",
    nextClipId: "end-card",
  });
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
  assert.deepEqual(warnings[0], {
    trackId: "visual-composition",
    trackName: "all visual tracks",
    from: 30,
    end: 240,
    previousClipId: "title",
    nextClipId: "end-card",
    kind: "between",
  });
  assert.deepEqual(warnings[1], {
    trackId: "visual-composition",
    trackName: "all visual tracks",
    from: 270,
    end: 300,
    previousClipId: "end-card",
    nextClipId: null,
    kind: "tail",
  });
  assert.ok(
    warnings.every((warning) => warning.trackId === "visual-composition"),
  );

  const late = parseEditTimeline({
    ...document,
    clips: [document.clips[2]],
  });
  assert.equal(timelineGapWarnings(late)[0]?.kind, "late");
  assert.equal(timelineGapWarnings(late)[0]?.nextClipId, "end-card");
});

test("editor review reports subtitle gaps down to a single frame", () => {
  const subtitles = parseEditTimeline({
    ...document,
    durationInFrames: 180,
    clips: [
      {
        ...document.clips[0],
        id: "subtitle-a",
        componentId: "subtitles",
        label: "First lyric",
        from: 0,
        durationInFrames: 30,
      },
      {
        ...document.clips[0],
        id: "subtitle-b",
        componentId: "subtitles",
        label: "Second lyric",
        from: 31,
        durationInFrames: 30,
      },
    ],
  });
  const warnings = timelineGapWarnings(subtitles);
  const subtitleGap = warnings.find(
    (warning) => warning.previousClipId === "subtitle-a",
  );
  assert.ok(subtitleGap);
  assert.equal(subtitleGap.from, 30);
  assert.equal(subtitleGap.end, 31);
  assert.equal(subtitleGap.nextClipId, "subtitle-b");
});

test("a background clip on another track suppresses normal subtitle spacing warnings", () => {
  const subtitlesWithBackground = parseEditTimeline({
    ...document,
    durationInFrames: 180,
    tracks: [...document.tracks, { id: "background", name: "Background" }],
    clips: [
      {
        ...document.clips[0],
        id: "subtitle-a",
        componentId: "subtitles",
        label: "First lyric",
        from: 0,
        durationInFrames: 30,
      },
      {
        ...document.clips[0],
        id: "subtitle-b",
        componentId: "subtitles",
        label: "Second lyric",
        from: 60,
        durationInFrames: 30,
      },
      {
        ...document.clips[0],
        id: "background-full",
        trackId: "background",
        componentId: "image",
        label: "Black background",
        from: 0,
        durationInFrames: 180,
      },
    ],
  });

  assert.deepEqual(timelineGapWarnings(subtitlesWithBackground), []);
});

test("an image covering the full interval between captions prevents a false gap warning", () => {
  const timeline = parseEditTimeline({
    ...document,
    durationInFrames: 180,
    tracks: [...document.tracks, { id: "background", name: "Background" }],
    clips: [
      {
        ...document.clips[0],
        id: "caption-before",
        componentId: "subtitles",
        from: 0,
        durationInFrames: 30,
      },
      {
        ...document.clips[0],
        id: "caption-after",
        componentId: "subtitles",
        from: 60,
        durationInFrames: 30,
      },
      {
        ...document.clips[0],
        id: "image-under-captions",
        trackId: "background",
        componentId: "image",
        from: 0,
        durationInFrames: 90,
      },
    ],
  });

  assert.equal(
    timelineGapWarnings(timeline).some(
      (warning) =>
        warning.previousClipId === "caption-before" &&
        warning.nextClipId === "caption-after",
    ),
    false,
  );
});
