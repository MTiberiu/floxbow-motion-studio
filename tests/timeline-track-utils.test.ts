import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAudioTimelineTrack,
  parseEditTimeline,
  visualTracksInRenderOrder,
} from "@motion/sdk/timeline";
import {
  createVisualTimelineTrack,
  createAudioTimelineTrack,
  lockedTrackEditError,
  moveTimelineClipsToTrack,
  moveSoundtrackToAudioTrack,
  normalizeTopDownTracks,
  reorderTimelineTrack,
  soundtrackTimingUnchanged,
} from "../apps/desktop/src/timeline-track-utils";

const legacy = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 300,
  tracks: [
    { id: "background", name: "Background" },
    { id: "captions", name: "Subtitles" },
    { id: "audio", name: "Audio" },
  ],
  clips: [
    {
      id: "bg-clip",
      trackId: "background",
      componentId: "image",
      label: "Background",
      from: 0,
      durationInFrames: 300,
      content: { assetId: "asset-bg" },
      props: { x: 50 },
    },
    {
      id: "caption-clip",
      trackId: "captions",
      componentId: "subtitles",
      label: "Caption",
      from: 30,
      durationInFrames: 60,
      content: { text: "Hello" },
      props: { x: 50 },
    },
    {
      id: "music",
      trackId: "audio",
      componentId: "soundtrack",
      label: "Music",
      from: 0,
      durationInFrames: 300,
      content: { assetId: "asset-audio" },
      props: {},
    },
  ],
});

test("top-down conversion preserves legacy visual render order", () => {
  const legacyOrder = visualTracksInRenderOrder(legacy).map(
    (track) => track.id,
  );
  const normalized = normalizeTopDownTracks(legacy);
  assert.deepEqual(
    normalized.tracks.map((track) => track.id),
    ["captions", "background", "audio"],
  );
  assert.deepEqual(
    visualTracksInRenderOrder(normalized).map((track) => track.id),
    legacyOrder,
  );
  assert.equal(normalized.clips[0].id, legacy.clips[0].id);
  assert.equal(normalized.clips[0].content.assetId, "asset-bg");
});

test("visual track creation and reordering use top-down stacking without changing clips", () => {
  const withForeground = createVisualTimelineTrack(
    legacy,
    "foreground",
    "Foreground",
  );
  assert.equal(withForeground.trackOrder, "top-down");
  assert.equal(withForeground.tracks[0].id, "foreground");
  assert.deepEqual(
    visualTracksInRenderOrder(withForeground).map((track) => track.id),
    ["background", "captions", "foreground"],
  );
  const moved = moveTimelineClipsToTrack(
    withForeground,
    ["caption-clip"],
    "foreground",
  );
  assert.equal(
    moved.clips.find((clip) => clip.id === "caption-clip")?.trackId,
    "foreground",
  );
  const reordered = reorderTimelineTrack(moved, "foreground", 1);
  assert.equal(
    reordered.tracks.findIndex((track) => track.id === "foreground"),
    1,
  );
  assert.deepEqual(
    reordered.clips.map(({ id, from, durationInFrames, content, props }) => ({
      id,
      from,
      durationInFrames,
      content,
      props,
    })),
    moved.clips.map(({ id, from, durationInFrames, content, props }) => ({
      id,
      from,
      durationInFrames,
      content,
      props,
    })),
  );
});

test("track kind distinguishes visual captions from soundtrack audio", () => {
  const visual = legacy.tracks.find((track) => track.id === "captions")!;
  const audio = legacy.tracks.find((track) => track.id === "audio")!;
  assert.equal(isAudioTimelineTrack(legacy, visual), false);
  assert.equal(isAudioTimelineTrack(legacy, audio), true);
});

test("empty audio tracks can be added and soundtrack can move between audio rows only", () => {
  const withSecondAudio = createAudioTimelineTrack(
    legacy,
    "audio-2",
    "Audio 2",
  );
  assert.deepEqual(
    withSecondAudio.tracks.map((track) => track.id),
    ["captions", "background", "audio", "audio-2"],
  );
  const moved = parseEditTimeline({
    ...withSecondAudio,
    clips: withSecondAudio.clips.map((clip) =>
      clip.id === "music" ? { ...clip, trackId: "audio-2" } : clip,
    ),
  });
  assert.equal(soundtrackTimingUnchanged(legacy, moved), true);
  assert.deepEqual(
    moved.clips.find((clip) => clip.id === "music"),
    { ...legacy.clips.find((clip) => clip.id === "music"), trackId: "audio-2" },
  );

  const invalidVisualTarget = parseEditTimeline({
    ...withSecondAudio,
    clips: withSecondAudio.clips.map((clip) =>
      clip.id === "music" ? { ...clip, trackId: "background" } : clip,
    ),
  });
  assert.equal(soundtrackTimingUnchanged(legacy, invalidVisualTarget), false);
  const helperMoved = moveSoundtrackToAudioTrack(
    withSecondAudio,
    "music",
    "audio-2",
  );
  assert.equal(soundtrackTimingUnchanged(withSecondAudio, helperMoved), true);
  assert.equal(
    helperMoved.clips.find((clip) => clip.id === "music")?.trackId,
    "audio-2",
  );
  assert.throws(
    () => moveSoundtrackToAudioTrack(withSecondAudio, "music", "captions"),
    /audio track/,
  );
});

test("hidden visual tracks do not expose Canvas elements and locked tracks reject edits", () => {
  const locked = parseEditTimeline({
    ...legacy,
    tracks: legacy.tracks.map((track) =>
      track.id === "background"
        ? { ...track, kind: "visual", visible: false, locked: true }
        : track,
    ),
  });
  const next = parseEditTimeline({
    ...locked,
    clips: locked.clips.map((clip) =>
      clip.id === "bg-clip"
        ? { ...clip, props: { ...clip.props, x: 51 } }
        : clip,
    ),
  });
  assert.match(lockedTrackEditError(locked, next) ?? "", /Unlock/);
  assert.deepEqual(
    visualTracksInRenderOrder(locked)
      .filter((track) => track.visible !== false)
      .map((track) => track.id),
    ["captions"],
  );
});

test("clips cannot be moved into locked or audio tracks", () => {
  const lockedTarget = parseEditTimeline({
    ...legacy,
    tracks: legacy.tracks.map((track) =>
      track.id === "captions" ? { ...track, locked: true } : track,
    ),
  });
  assert.throws(
    () => moveTimelineClipsToTrack(lockedTarget, ["bg-clip"], "captions"),
    /Unlock/,
  );
  assert.throws(
    () => moveTimelineClipsToTrack(legacy, ["bg-clip"], "audio"),
    /same type/,
  );
});

test("moving a video between visual tracks preserves its media, timing, and transforms", () => {
  const withVideo = parseEditTimeline({
    ...legacy,
    clips: [
      ...legacy.clips,
      {
        id: "video-clip",
        trackId: "background",
        componentId: "video",
        label: "Portrait video",
        from: 90,
        durationInFrames: 120,
        content: {
          assetId: "video-asset",
          sourceStartSeconds: 1.25,
          sourceDurationSeconds: 30,
        },
        props: {
          x: 48,
          y: 52,
          width: 36,
          height: 64,
          rotation: 12,
          volume: 0.8,
        },
      },
    ],
  });
  const withUpperTrack = createVisualTimelineTrack(
    withVideo,
    "upper-visual",
    "Upper visual",
  );
  const moved = moveTimelineClipsToTrack(
    withUpperTrack,
    ["video-clip"],
    "upper-visual",
  );
  const video = moved.clips.find((clip) => clip.id === "video-clip");
  assert.equal(video?.trackId, "upper-visual");
  assert.deepEqual(video, {
    ...withVideo.clips.find((clip) => clip.id === "video-clip"),
    trackId: "upper-visual",
  });
  assert.equal(moved.durationInFrames, withVideo.durationInFrames);
});
