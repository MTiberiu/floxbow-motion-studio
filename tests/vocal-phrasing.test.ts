import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { FACTORY_PHRASING_SETTINGS, analyzeVocalPhrasing, buildWordGravityCurve, comparePhrasing, getOrangeDurationScore, getVocalStretchScore, getWordGravityAtTime, planVisualPhrases, type PhrasingInput } from "@motion/lyrics-sync/phrasing";
import { readVocalPhrasingArtifacts, saveVocalPhrasingArtifacts } from "../scripts/vocal-phrasing";
import type { MusicLyricsMap } from "../scripts/music-lyrics-map";

const input: PhrasingInput = {
  projectId: "phrasing-demo", durationSeconds: 5, lyricsRevision: "lyrics-revision", musicRevision: "music-revision",
  cues: [{
    id: "cue-1", text: "Nu rămân aici", start: 0.2, end: 3.2,
    alignment: { status: "reviewed", wordTimingSource: "whisper" },
    energy: { mean: 0.22, peak: 0.4 }, beatTimes: [0.5, 1, 1.5, 2],
    words: [
      { id: "w1", text: "Nu", start: 0.2, end: 0.48, eventIds: [], vocalActivityOverlap: true },
      { id: "w2", text: "rămân", start: 0.5, end: 1.7, eventIds: ["vocal-1"], vocalActivityOverlap: true },
      { id: "w3", text: "aici", start: 1.8, end: 2.2, eventIds: [], vocalActivityOverlap: true },
    ],
  }],
  sections: [{ start: 0, end: 5, label: "chorus" }],
  events: [
    { id: "vocal-1", time: 0.8, category: "vocal_accent", source: "vocals", intensity: 0.7, method: "test fixture" },
    { id: "vocal-pause", time: 2.3, category: "vocal_pause", source: "vocals", method: "test fixture" },
  ],
};

test("word gravity uses the documented duration score and a smooth, ordered curve", () => {
  assert.equal(getOrangeDurationScore(.45), 0);
  assert.equal(getOrangeDurationScore(.9), 1);
  assert.equal(getOrangeDurationScore(.225), -1);
  assert.equal(getOrangeDurationScore(100), 2.4);
  assert.equal(getVocalStretchScore(.38, 2), 0);
  assert.equal(getVocalStretchScore(.76, 2), 1);
  const curve = buildWordGravityCurve([
    { id: "later", start: .9, end: 1.35 },
    { id: "held", start: 0, end: .9 },
    { id: "untimed", start: null, end: null },
  ], 2);
  assert.deepEqual(curve.map(point => point.time), [0, .45, 1.125, 2]);
  assert.equal(curve[1]?.orangeDurationScore, 1);
  assert.ok(Math.abs(getWordGravityAtTime(curve, .7875) - .5) < 1e-9);
  assert.equal(getWordGravityAtTime(curve, .45), 1);
  assert.equal(getWordGravityAtTime(curve, 4), 0);
  assert.equal(buildWordGravityCurve([], 0).length, 0);
});

test("vocal features mark a long Whisper-timed word as a candidate without altering its source timing", () => {
  const result = analyzeVocalPhrasing(input);
  const held = result.wordFeatures.find(feature => feature.wordId === "w2");
  assert.equal(held?.sustainedCandidate, true);
  assert.equal(held?.sustainEvidence, "whisper-timed-candidate");
  assert.equal(held?.alignedDurationSeconds, 1.2);
  assert.equal(result.sources.lyricsRevision, input.lyricsRevision);
});

test("estimated timing is explicitly labeled as partial evidence, not verified sustain", () => {
  const estimated: PhrasingInput = { ...input, cues: input.cues.map(cue => ({ ...cue, alignment: { status: "unverified", wordTimingSource: "estimated" } })) };
  const result = analyzeVocalPhrasing(estimated);
  assert.equal(result.status, "partial");
  assert.ok(result.unavailable.length > 0);
  assert.equal(result.wordFeatures.find(feature => feature.wordId === "w2")?.sustainEvidence, "estimated-timing-candidate");
});

test("v2 vocal prosody separates voiced articulation from pauses and compares words within their verse", () => {
  const profile: NonNullable<PhrasingInput["vocalProfile"]> = {
    status: "available", stemEngine: "Demucs-Infer", stemEngineVersion: "4.4.0", librosaVersion: "test",
    rmsHopSeconds: 0.05, method: "test RMS", f0Method: "test F0", reason: null,
    rms: Array.from({ length: 100 }, (_, index) => {
      const time = index * 0.05;
      return { time, value: time >= 0.2 && time < 0.8 || time >= 1 && time < 2.2 ? 0.2 : 0.001,
        active: time >= 0.2 && time < 0.8 || time >= 1 && time < 2.2 };
    }),
    f0: [{ time: 0.2, f0Hz: 220, valid: true, voicedProbability: 0.91, octaveOutlierRejected: false },
      { time: 0.25, f0Hz: null, valid: false, voicedProbability: 0.3, octaveOutlierRejected: true }],
  };
  const result = analyzeVocalPhrasing({ ...input, vocalProfile: profile });
  const verse = result.verseFeatures?.find(feature => feature.cueId === "cue-1");
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.audioProvenance?.librosaVersion, "test");
  assert.equal(result.wordFeatures[0]?.verseId, "cue-1");
  assert.ok(Math.abs((verse?.performedDurationSeconds ?? 0) - 2) < 1e-9);
  assert.ok(Math.abs((verse?.articulatedDurationSeconds ?? 0) - 1.8) < 0.06);
  assert.ok((verse?.pauseDurationSeconds ?? 0) > 0.15);
  assert.ok((verse?.articulationRateSyllablesPerSecond ?? 0) > (verse?.syllablesPerSecond ?? 0));
  assert.ok((verse?.wordDurationVariabilityIndex ?? 0) > 0);
  const held = result.wordFeatures.find(feature => feature.wordId === "w2");
  assert.equal(held?.verseId, "cue-1");
  assert.ok((held?.relativeDurationToVerse ?? 0) > 1);
});

test("all three phrase strategies are deterministic and preserve every timed word exactly once", () => {
  const comparison = comparePhrasing(input, FACTORY_PHRASING_SETTINGS);
  assert.deepEqual(comparison.plans.map(plan => plan.algorithm), ["stretch", "phrase-optimization", "hybrid"]);
  for (const plan of comparison.plans) {
    const ids = plan.groups.flatMap(group => group.wordIds);
    assert.deepEqual([...ids].sort(), ["w1", "w2", "w3"]);
    if (plan.algorithm !== "phrase-optimization") assert.equal(plan.groups.some(group => group.sustainedWordIds.includes("w2") && group.wordIds.length === 1), true);
  }
  const first = planVisualPhrases(input, comparison.analysis, "hybrid");
  const second = planVisualPhrases(input, comparison.analysis, "hybrid");
  assert.deepEqual(first, second);
});

test("analysis and phrase-plan artifacts persist separately with source revisions", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".test-vocal-phrasing-"));
  const map = {
    projectId: input.projectId, durationSeconds: input.durationSeconds,
    sources: { musicAnalysis: { reportRevision: input.musicRevision }, lyrics: { revision: input.lyricsRevision } },
    cues: input.cues.map(cue => ({ ...cue, section: "chorus", downbeatTimes: [], eventIds: [], words: cue.words.map(word => ({ ...word, beatOffsetSeconds: null, preWordCueIds: [] })) })),
    sections: input.sections, events: input.events, phrases: [], compositeCues: [], unavailable: [], status: "complete",
  } as unknown as MusicLyricsMap;
  try {
    await saveVocalPhrasingArtifacts(root, map, "hybrid", FACTORY_PHRASING_SETTINGS);
    const artifacts = await readVocalPhrasingArtifacts(root);
    assert.equal(artifacts.analysis?.sources.lyricsRevision, input.lyricsRevision);
    assert.equal(artifacts.plan?.sources.musicRevision, input.musicRevision);
    assert.equal(artifacts.plan?.algorithm, "hybrid");
    assert.match(await readFile(path.join(root, "visual-phrase-plan.json"), "utf8"), /floxBow-visual-phrase-plan/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
