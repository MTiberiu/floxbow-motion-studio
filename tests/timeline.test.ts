import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  parseEditTimeline,
  changeClipRange,
  validateField,
  componentInfosSchema,
  frameToSeconds,
  secondsToFrame,
  formatFrameTime,
} from "@motion/sdk/timeline";
import { serializableComponentInfo } from "@motion/sdk/editor";
import {
  exportSubtitles,
  getSubtitleCues,
  correctSubtitleText,
  createSubtitleClip,
  importSubtitles,
  subtitleContentSchema,
  subtitleClips,
  subtitleWordTimingMatchesText,
  subtitleTimelineBehavior,
  selectSubtitleCues,
  subtitlesToSRT,
  subtitlesToLRC,
} from "@motion/lyrics-sync/subtitles";
import { manifestSchema } from "@motion/project-loader/schema";
import { readEditor, saveEditor } from "../scripts/editor-store";
import { resolveTimelineBehavior } from "../apps/desktop/src/timeline-behaviors";
import { subtitleModule, Subtitles } from "@motion/lyrics-sync/component";

test("human-readable Timeline time converts through FPS without changing frame precision", () => {
  for (const fps of [24, 25, 30, 60, 120]) {
    for (const frame of [0, 1, 7, 123, fps * 60 + 9]) {
      assert.equal(secondsToFrame(frameToSeconds(frame, fps), fps), frame);
    }
  }
  assert.equal(formatFrameTime(90, 30), "0:03.000");
  assert.equal(secondsToFrame(3.015, 30), 90);
  assert.throws(() => frameToSeconds(10, 0), /FPS must be positive/);
});

function timeline() {
  return parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [
      { id: "visuals", name: "Visuals" },
      { id: "captions", name: "Captions" },
    ],
    clips: [
      {
        id: "lyric-1",
        trackId: "captions",
        componentId: "subtitles",
        label: "Verse",
        from: 0,
        durationInFrames: 180,
        content: {
          text: "Frame follows time",
          section: "verse",
          status: "demo",
          words: [
            { id: "word-1", text: "Frame", start: 0.5, end: 1 },
            { id: "word-2", text: "follows", start: 1.2, end: 2 },
            { id: "word-3", text: "time", start: 2, end: 2.5 },
          ],
        },
        props: {},
      },
      {
        id: "lyric-2",
        trackId: "captions",
        componentId: "subtitles",
        label: "Repeat",
        from: 180,
        durationInFrames: 180,
        content: {
          text: "Frame follows time",
          section: "repeat",
          repeatOf: "lyric-1",
          status: "demo",
          words: [
            { id: "word-4", text: "Frame", start: 0.5, end: 1 },
            { id: "word-5", text: "follows", start: 1.2, end: 2 },
            { id: "word-6", text: "time", start: 2, end: 2.5 },
          ],
        },
        props: {},
      },
    ],
  });
}

test("timeline moves on frame boundaries and trimming keeps spoken word positions", () => {
  const t = timeline();
  const moved = changeClipRange(t, "lyric-1", 30, 210);
  const c = moved.clips.find((clip) => clip.id === "lyric-1")!;
  assert.equal(c.from, 30);
  assert.deepEqual(c.content.words, t.clips[0].content.words);
  const trim = changeClipRange(
    t,
    "lyric-1",
    30,
    180,
    true,
    subtitleTimelineBehavior,
  ).clips[0];
  const word = (trim.content.words as { start: number; end: number }[])[2];
  assert.equal(word.start + trim.from / t.fps, 2);
  assert.equal(trim.durationInFrames, 150);
  assert.throws(() =>
    parseEditTimeline({ ...t, clips: [{ ...t.clips[0], from: 500 }] }),
  );
  assert.throws(() =>
    parseEditTimeline({ ...t, clips: [t.clips[0], t.clips[0]] }),
  );
});

test("timeline behavior metadata is serializable and dispatches only trusted built-ins", () => {
  const metadata = serializableComponentInfo(subtitleModule);
  assert.equal(metadata.timelineBehavior, "subtitle");
  assert.equal("component" in metadata, false);
  assert.deepEqual(
    componentInfosSchema.parse(JSON.parse(JSON.stringify([metadata]))),
    [metadata],
  );
  assert.equal(
    resolveTimelineBehavior("subtitles", []).id,
    "subtitle",
    "legacy subtitle registration keeps its editing behavior",
  );
  assert.equal(
    resolveTimelineBehavior("generic-title", []).id,
    "generic-visual",
  );
  assert.equal(
    resolveTimelineBehavior("generic-title", [
      { ...metadata, id: "generic-title", timelineBehavior: "unknown-custom" },
    ]).id,
    "generic-visual",
  );
  assert.equal(
    resolveTimelineBehavior("generic-title", [
      { ...metadata, id: "generic-title", timelineBehavior: "subtitle" },
    ]).id,
    "subtitle",
  );
});

test("generic content with words and status is unchanged by range edits; subtitle behavior remains specialized", () => {
  const t = timeline();
  const generic = structuredClone(t);
  generic.clips[0].componentId = "generic-title";
  generic.clips[0].content = {
    words: [{ id: "w", text: "Label", start: 1, end: 2 }],
    status: "reviewed",
  };
  const resized = changeClipRange(generic, "lyric-1", 30, 150, true).clips[0];
  assert.deepEqual(resized.content, generic.clips[0].content);
  const subtitle = structuredClone(t.clips[0]);
  subtitle.content.status = "reviewed";
  t.clips[0] = subtitle;
  const trimmed = changeClipRange(
    t,
    subtitle.id,
    30,
    150,
    true,
    subtitleTimelineBehavior,
  ).clips[0];
  assert.equal(trimmed.content.status, "unverified");
  assert.equal((trimmed.content.words as { start: number }[])[0].start, -0.5);
  const duplicated = subtitleTimelineBehavior.duplicateContent!(
    subtitle.content,
    subtitle.id,
  );
  assert.equal(duplicated.repeatOf, subtitle.id);
});

test("subtitle timing is independent from styling; JSON/SRT/LRC preserve documented semantics", () => {
  const t = timeline();
  const data = exportSubtitles(t);
  const styled = structuredClone(t);
  styled.clips[0].props = {
    color: "#ff0000",
    animation: "rise",
    fontFamily: "Georgia",
  };
  assert.deepEqual(exportSubtitles(styled), data);
  const json = importSubtitles(JSON.stringify(data), "json", 12);
  assert.deepEqual(json, data);
  assert.equal(json.segments[1].content.repeatOf, "lyric-1");
  assert.equal(json.segments[0].content.words?.[1].start, 1.2);
  const clips = subtitleClips(json, t, "captions", { fontSize: 90 });
  assert.equal(clips[1].from, 180);
  assert.equal(clips[0].props.fontSize, 90);
  const srt = importSubtitles(subtitlesToSRT(data), "srt", 12);
  assert.equal(srt.segments[1].end, 12);
  assert.equal(srt.segments[1].content.text, "Frame follows time");
  assert.equal(srt.segments[0].content.words, undefined);
  const lrc = importSubtitles(subtitlesToLRC(data), "lrc", 12);
  assert.equal(lrc.segments[1].start, 6);
  const repeats = importSubtitles(
    "[00:00.00][00:06.00]Repeated line",
    "lrc",
    12,
  );
  assert.equal(repeats.segments.length, 2);
  assert.throws(() =>
    importSubtitles("1\n00:00:04,000 --> 00:00:01,000\nInvalid", "srt", 12),
  );
  assert.throws(() =>
    subtitleClips(
      { ...data, segments: [{ ...data.segments[0], end: 20 }] },
      t,
      "captions",
    ),
  );
});

test("subtitle text corrections preserve stable segment and word timing", () => {
  const source = timeline().clips[0];
  const clip = createSubtitleClip({
    id: source.id,
    trackId: source.trackId,
    from: source.from,
    durationInFrames: source.durationInFrames,
    content: subtitleContentSchema.parse(source.content),
    props: source.props,
  });
  const corrected = correctSubtitleText(
    clip.content as ReturnType<typeof subtitleContentSchema.parse>,
    "Frame follows time!",
  );
  const correctedClip = { ...clip, content: corrected };
  assert.equal(correctedClip.id, "lyric-1");
  assert.equal(corrected.text, "Frame follows time!");
  assert.deepEqual(corrected.words, [
    { id: "word-1", text: "Frame", start: 0.5, end: 1 },
    { id: "word-2", text: "follows", start: 1.2, end: 2 },
    { id: "word-3", text: "time!", start: 2, end: 2.5 },
  ]);
  assert.equal(subtitleWordTimingMatchesText(corrected), true);

  const differentCount = correctSubtitleText(
    corrected,
    "Frame now follows time!",
  );
  assert.deepEqual(
    differentCount.words,
    corrected.words,
    "word IDs and timestamps remain available as timing evidence",
  );
  assert.equal(subtitleWordTimingMatchesText(differentCount), false);
  const laterSameCount = correctSubtitleText(differentCount, "Frame now!");
  assert.deepEqual(laterSameCount.words, corrected.words);
  assert.equal(
    subtitleWordTimingMatchesText(laterSameCount),
    false,
    "stale intervals are not silently reassigned after an intervening word-count change",
  );
  assert.equal(correctedClip.from, source.from);
  assert.equal(correctedClip.durationInFrames, source.durationInFrames);
});

test("subtitle cues separate speaker, visual presentation and consumer routing", () => {
  const t = timeline();
  t.clips[0].from = 30;
  t.clips[0].content = {
    ...t.clips[0].content,
    speakerId: "speaker-a",
    presentation: "both",
    consumerIds: ["character-01", "character-02"],
  };
  t.clips[1].content = {
    ...t.clips[1].content,
    presentation: "hidden",
    speakerId: "speaker-b",
  };
  t.clips.push(
    createSubtitleClip({
      id: "caption-no-consumer",
      trackId: "captions",
      from: 300,
      durationInFrames: 60,
      content: {
        text: "Caption only",
        status: "unverified",
        presentation: "caption",
        consumerIds: [],
      },
    }),
  );

  const cues = getSubtitleCues(t);
  assert.deepEqual(
    cues.map((cue) => cue.id),
    ["lyric-1", "lyric-2", "caption-no-consumer"],
  );
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, 7);
  assert.equal(cues[0].speakerId, "speaker-a");
  assert.deepEqual(cues[0].consumerIds, ["character-01", "character-02"]);
  assert.equal(cues[0].presentation, "both");
  assert.equal(cues[0].words?.[0].start, 1.5);
  assert.equal(cues[0].words?.[0].end, 2);
  assert.equal(cues[0].wordTimingStatus, "matches-text");
  assert.equal(cues[1].presentation, "hidden");
  assert.equal(cues[1].consumerIds, undefined);
  assert.equal(cues[2].wordTimingStatus, "absent");

  assert.deepEqual(
    selectSubtitleCues(cues, { kind: "caption" }).map((cue) => cue.id),
    ["lyric-1", "caption-no-consumer"],
    "caption permission is independent of consumer routing",
  );
  for (const consumerId of ["character-01", "character-02"]) {
    assert.deepEqual(
      selectSubtitleCues(cues, { kind: "consumer", consumerId }).map(
        (cue) => cue.id,
      ),
      ["lyric-1", "lyric-2"],
      "omitted routing broadcasts and hidden cues remain available",
    );
  }
  assert.deepEqual(
    selectSubtitleCues(cues, {
      kind: "consumer",
      consumerId: "unavailable-consumer",
    }).map((cue) => cue.id),
    ["lyric-2"],
  );
  const legacyTimeline = timeline();
  const legacyCue = getSubtitleCues({
    ...legacyTimeline,
    clips: [legacyTimeline.clips[0]],
  })[0];
  assert.equal(legacyCue.presentation, "caption");
  assert.equal(legacyCue.consumerIds, undefined);
  assert.deepEqual(
    selectSubtitleCues([legacyCue], {
      kind: "consumer",
      consumerId: "new-consumer",
    }),
    [legacyCue],
    "legacy cues keep caption rendering and default consumer broadcast",
  );

  const mismatch = getSubtitleCues({
    ...t,
    clips: [
      {
        ...t.clips[0],
        content: { ...t.clips[0].content, text: "Corrected words" },
      },
    ],
  });
  assert.equal(mismatch[0].wordTimingStatus, "text-mismatch");
  assert.equal(
    mismatch[0].words?.length,
    3,
    "mismatched intervals remain available as evidence",
  );
});

test("subtitle routing IDs validate and unknown assignments survive JSON interchange", () => {
  const t = timeline();
  t.clips[0].content = {
    ...t.clips[0].content,
    speakerId: "speaker-a",
    presentation: "bubble",
    consumerIds: ["future-character-01", "temporarily-offline-02"],
  };
  const imported = importSubtitles(
    JSON.stringify(exportSubtitles(t)),
    "json",
    12,
  );
  assert.equal(imported.segments[0].content.speakerId, "speaker-a");
  assert.equal(imported.segments[0].content.presentation, "bubble");
  assert.deepEqual(imported.segments[0].content.consumerIds, [
    "future-character-01",
    "temporarily-offline-02",
  ]);
  assert.throws(() =>
    subtitleContentSchema.parse({ text: "x", speakerId: "not a stable id" }),
  );
  assert.throws(() =>
    subtitleContentSchema.parse({
      text: "x",
      consumerIds: ["same-instance", "same-instance"],
    }),
  );
  assert.throws(() =>
    subtitleContentSchema.parse({
      text: "x",
      consumerIds: Array.from(
        { length: 33 },
        (_, index) => `character-${index}`,
      ),
    }),
  );
  assert.throws(() =>
    selectSubtitleCues([], { kind: "consumer", consumerId: "invalid id" }),
  );
});

test("subtitle renderer keeps legacy captions and suppresses bubble or hidden text", () => {
  const clip = timeline().clips[0];
  const withPresentation = (presentation: "bubble" | "hidden" | "both") => ({
    ...clip,
    content: { ...clip.content, presentation },
  });
  assert.notEqual(
    Subtitles({ clip }),
    null,
    "legacy content keeps caption rendering",
  );
  assert.notEqual(Subtitles({ clip: withPresentation("both") }), null);
  assert.equal(Subtitles({ clip: withPresentation("bubble") }), null);
  assert.equal(Subtitles({ clip: withPresentation("hidden") }), null);
});

test("subtitle constructors and content parsing reject invalid clip data", () => {
  assert.throws(() =>
    createSubtitleClip({
      id: "invalid id",
      trackId: "captions",
      from: 0,
      durationInFrames: 10,
      content: subtitleContentSchema.parse({
        text: "Caption",
        status: "unverified",
      }),
    }),
  );
  assert.throws(() =>
    subtitleContentSchema.parse({
      text: "bad",
      words: [{ id: "w", text: "bad", start: 2, end: 1 }],
    }),
  );
});

test("declared property controls validate their values", () => {
  const field = {
    key: "size",
    label: "Size",
    target: "props" as const,
    type: "number" as const,
    default: 40,
    min: 12,
    max: 120,
  };
  assert.equal(validateField(field, 64), 64);
  assert.throws(() => validateField(field, -1));
  assert.throws(() => validateField(field, NaN));
});

test("project saves are validated, persistent and reject stale agent revisions", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(path.join(tempRoot, "motion-editor-"));
  try {
    const t = timeline();
    await writeFile(path.join(directory, "edit.json"), JSON.stringify(t));
    const manifest = manifestSchema.parse({
      id: "fixture",
      name: "Fixture",
      type: "explainer",
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 360,
      entry: "Composition.tsx",
      editTimeline: "edit.json",
      sdkVersion: "0.1.0",
    });
    const disk = await readEditor(directory, manifest);
    const next = changeClipRange(t, "lyric-1", 15, 180);
    const saved = await saveEditor(directory, manifest, next, disk.revision);
    assert.equal(saved.timeline.clips[0].from, 15);
    assert.notEqual(saved.revision, disk.revision);
    await assert.rejects(
      saveEditor(directory, manifest, t, disk.revision),
      /CONFLICT/,
    );
    await assert.rejects(
      saveEditor(directory, manifest, { ...t, fps: 60 }, saved.revision),
      /match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("version 1 save/reload preserves generic clip metadata without interpreting it", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(path.join(tempRoot, "motion-v1-behavior-"));
  try {
    const t = timeline();
    const visual = t.clips[0];
    visual.componentId = "generic-title";
    visual.content = {
      words: [{ id: "w", text: "Title", start: 0.2, end: 0.8 }],
      status: "reviewed",
    };
    const manifest = manifestSchema.parse({
      id: "v1-fixture",
      name: "V1 Fixture",
      type: "explainer",
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 360,
      entry: "Composition.tsx",
      editTimeline: "edit.json",
      sdkVersion: "0.1.0",
    });
    await writeFile(path.join(directory, "edit.json"), JSON.stringify(t));
    const disk = await readEditor(directory, manifest);
    const changed = changeClipRange(
      disk.timeline,
      visual.id,
      30,
      150,
      true,
      resolveTimelineBehavior(visual.componentId, []),
    );
    const saved = await saveEditor(directory, manifest, changed, disk.revision);
    const reloaded = await readEditor(directory, manifest);
    assert.equal(reloaded.timeline.version, 1);
    assert.equal(reloaded.timeline.clips[0].componentId, "generic-title");
    assert.deepEqual(reloaded.timeline.clips[0].content, visual.content);
    assert.equal(saved.timeline.clips[0].from, 30);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external project-file updates are readable and block saves based on an old revision", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(path.join(tempRoot, "motion-external-edit-"));
  try {
    const t = timeline();
    const manifest = manifestSchema.parse({
      id: "external-fixture",
      name: "External Fixture",
      type: "explainer",
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 360,
      entry: "Composition.tsx",
      editTimeline: "edit.json",
      sdkVersion: "0.1.0",
    });
    const editPath = path.join(directory, "edit.json");
    await writeFile(editPath, JSON.stringify(t));
    const loadedByEditor = await readEditor(directory, manifest);
    const external = structuredClone(t);
    external.clips[0].content.text = "Changed by an external agent";
    await writeFile(editPath, `${JSON.stringify(external, null, 2)}\n`);

    const reloaded = await readEditor(directory, manifest);
    assert.notEqual(reloaded.revision, loadedByEditor.revision);
    assert.equal(
      reloaded.timeline.clips[0].content.text,
      "Changed by an external agent",
    );
    await assert.rejects(
      saveEditor(
        directory,
        manifest,
        loadedByEditor.timeline,
        loadedByEditor.revision,
      ),
      /CONFLICT: The project changed on disk/,
    );
    assert.equal(
      JSON.parse(await readFile(editPath, "utf8")).clips[0].content.text,
      "Changed by an external agent",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
