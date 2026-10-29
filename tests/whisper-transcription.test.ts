import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureKaraokeWordTimings,
  subtitleClips,
  subtitleWordTimingMatchesText,
  splitSubtitleTextForKaraoke,
  whisperResultToSubtitleTiming,
} from "@motion/lyrics-sync/subtitles";
import { parseEditTimeline } from "@motion/sdk/timeline";

const whisperFixture = {
  text: "First line, second line.",
  segments: [
    {
      start: 1.25,
      end: 2.5,
      text: " First line,",
      words: [
        { start: 1.3, end: 1.7, word: " First", probability: 0.91 },
        { start: 1.72, end: 2.1, word: " line,", probability: 0.82 },
      ],
    },
    { start: 3, end: 4.2, text: " second line." },
  ],
};

test("Whisper observations become unverified subtitle timing without reconciliation", () => {
  const imported = whisperResultToSubtitleTiming(whisperFixture, 8);
  assert.equal(
    subtitleWordTimingMatchesText(imported.timing.segments[0].content),
    true,
    "Whisper's leading spaces in word labels must not disable karaoke",
  );
  assert.deepEqual(imported, {
    timing: {
      version: 1,
      units: "seconds",
      segments: [
        {
          id: "whisper-segment-1",
          start: 1.25,
          end: 2.5,
          content: {
            text: " First line,",
            status: "unverified",
            wordTimingSource: "whisper",
            words: [
              {
                id: "whisper-1-word-1",
                text: "First",
                start: 0.050000000000000044,
                end: 0.44999999999999996,
              },
              {
                id: "whisper-1-word-2",
                text: "line,",
                start: 0.47,
                end: 0.8500000000000001,
              },
            ],
          },
        },
        {
          id: "whisper-segment-2",
          start: 3,
          end: 4.2,
          content: {
            text: " second line.",
            status: "unverified",
            wordTimingSource: "estimated",
            words: [
              {
                id: "whisper-2-estimated-word-1",
                text: "second",
                start: 0,
                end: 0.6545454545454545,
              },
              {
                id: "whisper-2-estimated-word-2",
                text: "line.",
                start: 0.6545454545454545,
                end: 1.2000000000000002,
              },
            ],
          },
        },
      ],
    },
    skippedSegments: 0,
    outOfRangeSegments: 0,
    unusableWordTimings: 0,
    estimatedWordTimings: 1,
  });
});

test("missing and invalid word timing gets an estimate while invalid segment timing is skipped", () => {
  const imported = whisperResultToSubtitleTiming(
    {
      segments: [
        { text: "No timestamps" },
        { start: 2, end: 1, text: "Reversed" },
        { start: 7, end: 9, text: "Beyond duration" },
        {
          start: 1,
          end: 2,
          text: "Caption kept",
          words: [{ start: 0.5, end: 1.5, word: "unsafe timing" }],
        },
      ],
    },
    8,
  );
  assert.equal(imported.timing.segments.length, 1);
  assert.deepEqual(imported.timing.segments[0], {
    id: "whisper-segment-4",
    start: 1,
    end: 2,
    content: {
      text: "Caption kept",
      status: "unverified",
      wordTimingSource: "estimated",
      words: [
        {
          id: "whisper-4-estimated-word-1",
          text: "Caption",
          start: 0,
          end: 0.6363636363636364,
        },
        {
          id: "whisper-4-estimated-word-2",
          text: "kept",
          start: 0.6363636363636364,
          end: 1,
        },
      ],
    },
  });
  assert.equal(imported.skippedSegments, 3);
  assert.equal(imported.outOfRangeSegments, 1);
  assert.equal(imported.unusableWordTimings, 1);
  assert.equal(imported.estimatedWordTimings, 1);
});

test("legacy transcription responses get estimated karaoke timings in the editor", () => {
  const ensured = ensureKaraokeWordTimings({
    version: 1,
    units: "seconds",
    segments: [
      {
        id: "legacy-caption",
        start: 4,
        end: 6,
        content: { text: "Am tot zis", status: "unverified" },
      },
    ],
  });
  assert.equal(ensured.estimatedWordTimings, 1);
  assert.equal(ensured.timing.segments[0].content.wordTimingSource, "estimated");
  assert.equal(ensured.timing.segments[0].content.words?.length, 3);
  assert.equal(
    ensured.timing.segments[0].content.words?.at(-1)?.end,
    2,
    "relative estimated timing spans the whole caption duration",
  );
});

test("karaoke text retains exact spaces and line breaks around timed words", () => {
  assert.deepEqual(
    splitSubtitleTextForKaraoke("Am  tot zis,\nși n-am mai"),
    [
      { kind: "word", index: 0, text: "Am" },
      { kind: "space", index: 1, text: "  " },
      { kind: "word", index: 1, text: "tot" },
      { kind: "space", index: 3, text: " " },
      { kind: "word", index: 2, text: "zis," },
      { kind: "space", index: 5, text: "\n" },
      { kind: "word", index: 3, text: "și" },
      { kind: "space", index: 7, text: " " },
      { kind: "word", index: 4, text: "n-am" },
      { kind: "space", index: 9, text: " " },
      { kind: "word", index: 5, text: "mai" },
    ],
  );
});

test("generated timing imports as editable frame clips while preserving unrelated clips", () => {
  const document = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 240,
    tracks: [
      { id: "captions", name: "Captions" },
      { id: "audio", name: "Audio" },
    ],
    clips: [
      {
        id: "soundtrack-1",
        trackId: "audio",
        componentId: "soundtrack",
        label: "Song",
        from: 0,
        durationInFrames: 240,
        content: { assetId: "audio-song" },
        props: {},
      },
      {
        id: "visual-1",
        trackId: "captions",
        componentId: "shape",
        label: "Keep this visual",
        from: 0,
        durationInFrames: 240,
        content: {},
        props: {},
      },
    ],
  });
  const converted = whisperResultToSubtitleTiming(whisperFixture, 8);
  const clips = subtitleClips(converted.timing, document, "captions");
  assert.equal(clips[0].from, Math.round(1.25 * document.fps));
  assert.equal(
    clips[0].durationInFrames,
    Math.round(2.5 * document.fps) - Math.round(1.25 * document.fps),
  );
  assert.equal(clips[0].content.status, "unverified");
  const next = parseEditTimeline({
    ...document,
    clips: [
      ...document.clips.filter((clip) => clip.componentId !== "subtitles"),
      ...clips,
    ],
  });
  assert.equal(next.clips.find((clip) => clip.id === "soundtrack-1")?.from, 0);
  assert.ok(next.clips.some((clip) => clip.id === "visual-1"));
  assert.equal(
    next.clips.filter((clip) => clip.componentId === "subtitles").length,
    2,
  );
});
