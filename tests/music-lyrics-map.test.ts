import test from "node:test";
import assert from "node:assert/strict";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { buildMusicLyricsMap, getLyricsSourceRevision, musicLyricsMapRevision } from "../scripts/music-lyrics-map";

const music = {
  schemaVersion: 2, projectId: "demo-song", assetId: "audio-1",
  asset: { displayName: "Demo.wav", sha256: "a".repeat(64), sizeBytes: 10, modifiedAt: "2026-10-29T00:00:00.000Z" },
  analyzedAt: "2026-10-29T00:00:00.000Z", durationSeconds: 4, status: "complete",
  provenance: { structure: { status: "available", engine: "AIOI", version: "3.1", device: "cpu" }, dsp: { status: "available", engine: "librosa" } },
  structure: { bpm: 120, beats: [0.5, 1, 1.5, 2], downbeats: [0.5, 2], beatPositions: [1, 2, 3, 4], sections: [{ start: 0, end: 4, label: "verse" }] },
  dsp: { sampleRate: 44100, channels: 2, waveform: [0.1, 0.4], energy: [{ time: 0, value: 0.1 }, { time: 1, value: 0.3 }, { time: 2, value: 0.4 }], accents: [{ time: 0.65, strength: 0.8 }] },
  musicalEvents: { status: "available", method: "stem DSP", stemsReused: true, sources: { drums: "available", bass: "available", vocals: "available", other: "available" }, events: [
    { id: "drum-1", time: 0.62, category: "snare_like", source: "drums", intensity: 0.9, method: "flux" },
    { id: "bass-1", time: 0.68, category: "bass_attack", source: "bass", intensity: 0.7, method: "flux" },
    { id: "vocal-1", time: 0.1, category: "vocal_activity_start", source: "vocals", method: "RMS" },
    { id: "vocal-2", time: 3.5, category: "vocal_pause", source: "vocals", method: "RMS" },
  ], groups: [], counts: { drums: 1, bass: 1, vocals: 2, other: 0, mix: 0 }, instrumentRecognition: { drumLabels: "Heuristic drum labels", otherInstruments: "Unknown" } },
};
const timeline = parseEditTimeline({ version: 1, fps: 30, durationInFrames: 120, tracks: [{ id: "captions", name: "Subtitles" }], clips: [
  { id: "line-1", trackId: "captions", componentId: "subtitles", from: 0, durationInFrames: 90, label: "Verse", content: { text: "Hello world", status: "unverified", wordTimingSource: "estimated", words: [{ id: "word-1", text: "Hello", start: 0.2, end: 0.7 }, { id: "word-2", text: "world", start: 0.7, end: 1.4 }] }, props: {} },
  { id: "line-2", trackId: "captions", componentId: "subtitles", from: 48, durationInFrames: 42, label: "Verse", content: { text: "Untimed words", status: "unverified" }, props: {} },
] });

test("full-song correlation keeps canonical cue and word IDs, normalized times, and source references", () => {
  const { map, brief } = buildMusicLyricsMap({ projectId: "demo-song", music, timeline, timelineOffsetSeconds: 0 });
  assert.equal(map.cues.length, 2);
  assert.equal(map.cues[0]?.words[0]?.id, "word-1");
  assert.equal(map.cues[0]?.words[0]?.start, 0.2);
  assert.equal(map.cues[0]?.words[0]?.eventIds.includes("drum-1"), true);
  assert.equal(map.cues[0]?.words[0]?.eventIds.includes("bass-1"), true);
  assert.equal(map.cues[0]?.words[0]?.vocalActivityOverlap, true);
  assert.equal(map.cues[1]?.words[0]?.start, null);
  assert.equal(map.sources.lyrics.untimedWordCount, 2);
  assert.equal(map.events.some(event => event.sourceRef === "music-analysis.json#/structure/beats/0"), true);
  assert.equal(map.compositeCues.some(cue => cue.eventIds.includes("drum-1") && cue.eventIds.includes("bass-1")), true);
  assert.equal(map.status, "partial");
  assert.equal(brief.phrases.length, 1);
  assert.match(brief.phrases[0]!.detailRef, /music-lyrics-map\.json/);
  assert.equal(brief.mapRevision, musicLyricsMapRevision(map));
});

test("lyrics source fingerprint changes with karaoke edits but ignores visual-only clip props", () => {
  const original = getLyricsSourceRevision(timeline);
  const visualOnly = structuredClone(timeline);
  visualOnly.clips[0]!.props.color = "#ff00ff";
  assert.equal(getLyricsSourceRevision(visualOnly), original);
  const lyricEdit = structuredClone(timeline);
  (lyricEdit.clips[0]!.content as { words: Array<{ end: number }> }).words[0]!.end = 0.8;
  assert.notEqual(getLyricsSourceRevision(lyricEdit), original);
});

test("correlation rejects an audio report from another project", () => {
  assert.throws(() => buildMusicLyricsMap({ projectId: "another-project", music, timeline }), /different project/);
});
