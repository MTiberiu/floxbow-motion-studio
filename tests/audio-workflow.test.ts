import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createProject } from "../scripts/project-scaffold";
import { manifestSchema } from "@motion/project-loader/schema";
import { readEditor, saveEditor } from "../scripts/editor-store";
import { probeAudioDuration } from "../scripts/audio-probe";
import { readMediaRegistry, registerAudioAsset } from "../scripts/media-store";
import { createSubtitleClip } from "@motion/lyrics-sync/subtitles";
import { parseEditTimeline } from "@motion/sdk/timeline";
import {
  changeClipRangeWithDurationExtension,
  MAX_TIMELINE_DURATION_FRAMES,
  soundtrackTimingUnchanged,
} from "../apps/desktop/src/timeline-track-utils";

function sineWaveWav(seconds: number) {
  const rate = 8_000;
  const count = rate * seconds;
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index += 1)
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 12_000),
      44 + index * 2,
    );
  return wav;
}

test("soundtrack probing uses a real decoder and duration saves preserve existing timeline edits", async () => {
  const testRoot = path.resolve(".test-tmp");
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, "flox-audio-workflow-"));
  try {
    const projects = path.join(directory, "projects");
    await mkdir(projects);
    const manifest = manifestSchema.parse(
      await createProject(projects, "audio-workflow-test"),
    );
    const projectRoot = path.join(projects, manifest.id);
    const audioPath = path.join(directory, "tone.wav");
    await writeFile(audioPath, sineWaveWav(8));
    assert.ok(Math.abs((await probeAudioDuration(audioPath)) - 8) < 0.01);

    const registered = await registerAudioAsset(
      projectRoot,
      audioPath,
      (await readMediaRegistry(projectRoot)).revision,
    );
    const disk = await readEditor(projectRoot, manifest);
    const caption = createSubtitleClip({
      id: "caption-preserved",
      trackId: "captions",
      from: 20,
      durationInFrames: 30,
      content: { text: "Keep this unsaved caption", status: "unverified" },
    });
    const withCaption = parseEditTimeline({
      ...disk.timeline,
      clips: [caption],
    });
    const captionSaved = await saveEditor(
      projectRoot,
      manifest,
      withCaption,
      disk.revision,
    );
    const soundtrack = {
      id: "soundtrack-test",
      trackId: "audio",
      componentId: "soundtrack",
      label: "Soundtrack · tone",
      from: 0,
      durationInFrames: 240,
      content: { assetId: registered.registry.assets[0].id },
      props: {},
    };
    const extended = parseEditTimeline({
      ...captionSaved.timeline,
      durationInFrames: 240,
      tracks: [...captionSaved.timeline.tracks, { id: "audio", name: "Audio" }],
      clips: [caption, soundtrack],
    });
    const saved = await saveEditor(
      projectRoot,
      manifest,
      extended,
      captionSaved.revision,
    );
    const updatedManifest = JSON.parse(
      await readFile(path.join(projectRoot, "project.json"), "utf8"),
    );
    assert.equal(updatedManifest.durationInFrames, 240);
    assert.equal(saved.timeline.durationInFrames, 240);
    assert.deepEqual(
      saved.timeline.clips.find((clip) => clip.id === caption.id),
      caption,
    );
    assert.equal(
      saved.timeline.clips.find((clip) => clip.componentId === "soundtrack")
        ?.content.assetId,
      registered.registry.assets[0].id,
    );
    assert.equal(
      (await readEditor(projectRoot, updatedManifest)).timeline
        .durationInFrames,
      240,
    );
    await assert.rejects(
      saveEditor(
        projectRoot,
        updatedManifest,
        { ...saved.timeline, durationInFrames: 180 },
        saved.revision,
      ),
      /duration cannot be shortened/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audio duration probing reports malformed or undecodable sources clearly", async () => {
  const testRoot = path.resolve(".test-tmp");
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, "flox-audio-invalid-"));
  try {
    const invalid = path.join(directory, "invalid.wav");
    await writeFile(invalid, "not audio");
    await assert.rejects(
      probeAudioDuration(invalid),
      /cannot be decoded|decodable duration/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("soundtrack timing, selected source, track and full duration stay fixed", () => {
  const soundtrack = {
    id: "soundtrack-fixed",
    trackId: "audio",
    componentId: "soundtrack",
    label: "Soundtrack · tone",
    from: 0,
    durationInFrames: 240,
    content: { assetId: "audio-tone" },
    props: {},
  };
  const current = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 240,
    tracks: [{ id: "audio", name: "Audio" }],
    clips: [soundtrack],
  });
  assert.equal(
    soundtrackTimingUnchanged(current, structuredClone(current)),
    true,
  );
  assert.equal(
    soundtrackTimingUnchanged(current, {
      ...current,
      durationInFrames: 241,
      clips: [{ ...soundtrack, from: 1 }],
    }),
    false,
  );
  assert.equal(
    soundtrackTimingUnchanged(current, {
      ...current,
      clips: [{ ...soundtrack, durationInFrames: 239 }],
    }),
    false,
  );
  assert.equal(
    soundtrackTimingUnchanged(current, {
      ...current,
      clips: [{ ...soundtrack, trackId: "video" }],
    }),
    false,
  );
  assert.equal(
    soundtrackTimingUnchanged(current, {
      ...current,
      clips: [{ ...soundtrack, content: { assetId: "another-audio" } }],
    }),
    false,
  );
});

test("moving a clip extends the saved Timeline duration and never shortens it", () => {
  const current = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [{ id: "captions", name: "Captions" }],
    clips: [
      {
        id: "lyric-1",
        trackId: "captions",
        componentId: "subtitles",
        label: "Caption",
        from: 0,
        durationInFrames: 180,
        content: { text: "Caption" },
        props: {},
      },
    ],
  });
  const moved = changeClipRangeWithDurationExtension(
    current,
    "lyric-1",
    420,
    600,
  );
  assert.equal(moved.durationInFrames, 600);
  assert.equal(moved.clips[0].from, 420);
  assert.equal(moved.clips[0].durationInFrames, 180);

  const movedToZero = changeClipRangeWithDurationExtension(
    moved,
    "lyric-1",
    -20,
    160,
  );
  assert.equal(movedToZero.durationInFrames, 600);
  assert.equal(movedToZero.clips[0].from, 0);

  assert.throws(
    () =>
      changeClipRangeWithDurationExtension(
        moved,
        "lyric-1",
        MAX_TIMELINE_DURATION_FRAMES - 100,
        MAX_TIMELINE_DURATION_FRAMES + 80,
      ),
    /maximum project duration/i,
  );
});

test("extended clip saves and reloads with matching project and Timeline durations", async () => {
  const tempRoot = path.resolve(".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(path.join(tempRoot, "motion-extended-edit-"));
  try {
    const manifest = manifestSchema.parse({
      id: "extended-fixture",
      name: "Extended Fixture",
      type: "explainer",
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 360,
      entry: "Composition.tsx",
      editTimeline: "edit.json",
      sdkVersion: "0.1.0",
    });
    const timeline = parseEditTimeline({
      version: 1,
      fps: 30,
      durationInFrames: 360,
      tracks: [{ id: "captions", name: "Captions" }],
      clips: [
        {
          id: "caption-1",
          trackId: "captions",
          componentId: "subtitles",
          label: "Caption",
          from: 0,
          durationInFrames: 60,
          content: { text: "Preserve me" },
          props: {},
        },
      ],
    });
    await writeFile(
      path.join(directory, "edit.json"),
      JSON.stringify(timeline),
    );
    await writeFile(
      path.join(directory, "project.json"),
      JSON.stringify(manifest),
    );
    const disk = await readEditor(directory, manifest);
    const moved = changeClipRangeWithDurationExtension(
      disk.timeline,
      "caption-1",
      540,
      600,
    );
    await saveEditor(directory, manifest, moved, disk.revision);
    const savedManifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(directory, "project.json"), "utf8")),
    );
    const reloaded = await readEditor(directory, savedManifest);
    assert.equal(savedManifest.durationInFrames, 600);
    assert.equal(reloaded.timeline.durationInFrames, 600);
    assert.deepEqual(reloaded.timeline.clips[0], {
      ...timeline.clips[0],
      from: 540,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
