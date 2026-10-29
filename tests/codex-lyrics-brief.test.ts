import assert from "node:assert/strict";
import test from "node:test";
import { buildCodexLyricsBrief } from "../apps/desktop/src/codex-lyrics-brief";
import type { ProjectManifest } from "../packages/project-loader/src/schema";

const manifest: ProjectManifest = {
  id: "new-song-project",
  name: "New Song Project",
  type: "lyrics",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900,
  entry: "Composition.tsx",
  sdkVersion: "0.1.0",
  editTimeline: "edit-timeline.json",
  timeline: "timing/lyrics.json",
};

test("Codex lyrics brief derives project paths and embeds supplied lyrics", () => {
  const brief = buildCodexLyricsBrief(manifest, "Ana are mere rosii.");
  assert.match(brief, /projects\/new-song-project\/project\.json/);
  assert.match(brief, /projects\/new-song-project\/edit-timeline\.json/);
  assert.match(brief, /projects\/new-song-project\/timing\/lyrics\.json/);
  assert.match(brief, /Ana are mere rosii\./);
  assert.match(brief, /one sung lyric line per subtitle clip/);
  assert.match(brief, /wordTimingSource = estimated/);
});

test("Codex lyrics brief does not invent project paths when they are absent", () => {
  const { editTimeline: _editTimeline, timeline: _timeline, ...withoutTimeline } = manifest;
  const brief = buildCodexLyricsBrief(withoutTimeline, "A lyric line.");
  assert.match(brief, /no editTimeline path is declared/);
  assert.match(brief, /no timeline path is declared/);
  assert.doesNotMatch(brief, /projects\/new-song-project\/undefined/);
});
