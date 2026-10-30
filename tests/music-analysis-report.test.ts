import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createMusicAnalysisReport, readMusicAnalysisReport, saveMusicAnalysisReport } from "../scripts/music-analysis-report";

const source = {
  projectId: "music-demo",
  assetId: "audio-demo",
  displayName: "Demo song",
  fileSha256: "a".repeat(64),
  sizeBytes: 1024,
  modifiedAt: new Date("2026-10-28T10:00:00.000Z"),
};

test("partial report keeps unavailable musical structure explicitly empty", () => {
  const report = createMusicAnalysisReport({
    ...source,
    worker: {
      durationSeconds: 120,
      sampleRate: 22050,
      channels: 2,
      waveform: [0, 0.4, 1],
      energy: [{ time: 0, value: 0.08 }],
      accents: [{ time: 0.52, strength: 1 }],
      engine: { status: "unavailable", reason: "Runtime not installed" },
    },
  });

  assert.equal(report.status, "partial");
  assert.equal(report.structure.bpm, null);
  assert.deepEqual(report.structure.beats, []);
  assert.deepEqual(report.structure.sections, []);
  assert.equal(report.provenance.structure.reason, "Runtime not installed");
  assert.equal(report.dsp.accents[0].time, 0.52);
});

test("complete report retains All-In-One-Infer labels and timings", () => {
  const report = createMusicAnalysisReport({
    ...source,
    worker: {
      durationSeconds: 120,
      sampleRate: 22050,
      channels: 2,
      waveform: [0, 0.4, 1],
      energy: [{ time: 0, value: 0.08 }],
      accents: [],
      engine: {
        status: "available",
        name: "All-In-One-Infer",
        version: "3.1.0",
        device: "cpu",
        bpm: 96,
        beats: [0.25, 0.875],
        downbeats: [0.25],
        beatPositions: [1, 2],
        sections: [{ start: 0, end: 12.5, label: "intro" }],
      },
      musicalEvents: {
        status: "available",
        method: "AIOI Demucs stems + librosa DSP",
        stemsReused: true,
        sources: { drums: "available", bass: "available", vocals: "available", other: "available" },
        events: [
          { id: "drums-kick_like-000001", time: 0.25, category: "kick_like", source: "drums", intensity: 1, method: "stem spectral heuristic" },
          { id: "drums-kick_like-000002", time: 1.1, category: "kick_like", source: "drums", intensity: 0.8, method: "stem spectral heuristic" },
        ],
        groups: [{ id: "drums-group-00001", start: 0.25, end: 1.1, source: "drums", count: 2, eventIds: ["drums-kick_like-000001", "drums-kick_like-000002"], pattern: "2 successive drum attacks" }],
        counts: { drums: 2, bass: 0, vocals: 0, other: 0, mix: 0 },
        instrumentRecognition: { drumLabels: "Heuristic labels", otherInstruments: "Not classified" },
      },
      vocalProfile: {
        status: "available", method: "Demucs vocals RMS", stemEngine: "Demucs-Infer", stemEngineVersion: "4.4.0", librosaVersion: "1.0.0", sampleRate: 22050, rmsHopSeconds: 0.05, rmsThreshold: 0.003,
        rms: [{ time: 0, value: 0.12, active: true }],
        f0: [{ time: 0, f0Hz: 220, valid: true, voicedProbability: 0.92, octaveOutlierRejected: false }],
        f0Method: "librosa.pyin", f0SampleRate: 22050, f0HopSeconds: 0.05, reason: null,
      },
    },
  });

  assert.equal(report.status, "complete");
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.structure.bpm, 96);
  assert.deepEqual(report.structure.sections, [{ start: 0, end: 12.5, label: "intro" }]);
  assert.equal(report.provenance.structure.device, "cpu");
  assert.equal(report.musicalEvents?.events[0].category, "kick_like");
  assert.equal(report.musicalEvents?.groups[0].eventIds.length, 2);
  assert.equal(report.vocalProfile?.f0[0]?.f0Hz, 220);
});

test("a new project can save and reopen one atomic report", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".studio", "music-report-test-"));
  try {
    assert.equal(await readMusicAnalysisReport(root), null);
    const report = createMusicAnalysisReport({
      ...source,
      worker: { durationSeconds: 10, sampleRate: 44100, channels: 2, waveform: [0, 1], energy: [{ time: 0, value: 0.1 }], accents: [], engine: { status: "unavailable", reason: "not installed" } },
    });
    await saveMusicAnalysisReport(root, report);
    assert.equal((await readMusicAnalysisReport(root))?.assetId, "audio-demo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
