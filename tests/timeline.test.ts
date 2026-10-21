import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  parseEditTimeline,
  changeClipRange,
  validateField,
} from "@motion/sdk/timeline";
import {
  exportSubtitles,
  importSubtitles,
  subtitleClips,
  subtitlesToSRT,
  subtitlesToLRC,
} from "@motion/lyrics-sync/subtitles";
import { manifestSchema } from "@motion/project-loader/schema";
import { readEditor, saveEditor } from "../scripts/editor-store";

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
  const trim = changeClipRange(t, "lyric-1", 30, 180, true).clips[0];
  const word = (trim.content.words as { start: number; end: number }[])[2];
  assert.equal(word.start + trim.from / t.fps, 2);
  assert.equal(trim.durationInFrames, 150);
  assert.throws(() => parseEditTimeline({ ...t, clips: [{ ...t.clips[0], from: 500 }] }));
  assert.throws(() => parseEditTimeline({ ...t, clips: [t.clips[0], t.clips[0]] }));
});

test("subtitle timing is independent from styling; JSON/SRT/LRC preserve documented semantics", () => {
  const t = timeline();
  const data = exportSubtitles(t);
  const styled = structuredClone(t);
  styled.clips[0].props = { color: "#ff0000", animation: "rise", fontFamily: "Georgia" };
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
  const repeats = importSubtitles("[00:00.00][00:06.00]Repeated line", "lrc", 12);
  assert.equal(repeats.segments.length, 2);
  assert.throws(() => importSubtitles("1\n00:00:04,000 --> 00:00:01,000\nInvalid", "srt", 12));
  assert.throws(() => subtitleClips({ ...data, segments: [{ ...data.segments[0], end: 20 }] }, t, "captions"));
});

test("declared property controls validate their values", () => {
  const field = { key: "size", label: "Size", target: "props" as const, type: "number" as const, default: 40, min: 12, max: 120 };
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
    await assert.rejects(saveEditor(directory, manifest, t, disk.revision), /CONFLICT/);
    await assert.rejects(saveEditor(directory, manifest, { ...t, fps: 60 }, saved.revision), /match/);
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
    assert.equal(reloaded.timeline.clips[0].content.text, "Changed by an external agent");
    await assert.rejects(
      saveEditor(directory, manifest, loadedByEditor.timeline, loadedByEditor.revision),
      /CONFLICT: The project changed on disk/,
    );
    assert.equal(JSON.parse(await readFile(editPath, "utf8")).clips[0].content.text, "Changed by an external agent");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
