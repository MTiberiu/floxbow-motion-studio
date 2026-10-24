import assert from "node:assert/strict";
import test from "node:test";
import {
  clampTimelineHeight,
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
} from "../apps/desktop/src/editor-layout.ts";

test("timeline height clamps invalid and undersized saved values", () => {
  assert.equal(clampTimelineHeight(Number.NaN, 900), DEFAULT_TIMELINE_HEIGHT);
  assert.equal(clampTimelineHeight(-20, 900), MIN_TIMELINE_HEIGHT);
  assert.equal(clampTimelineHeight(30, 900), MIN_TIMELINE_HEIGHT);
});

test("timeline height fits the viewport after resize", () => {
  assert.equal(clampTimelineHeight(500, 900), 495);
  assert.equal(clampTimelineHeight(500, 600), 330);
  assert.equal(clampTimelineHeight(500, 240), MIN_TIMELINE_HEIGHT);
});
