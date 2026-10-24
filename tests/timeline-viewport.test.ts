import { test } from "node:test";
import assert from "node:assert/strict";
import { timelineCanvasWidthForZoom } from "../apps/desktop/src/TimelineView";

test("Timeline Fit follows the live viewport and never uses a stale project duration scale", () => {
  const firstViewport = 960;
  assert.equal(timelineCanvasWidthForZoom(firstViewport, 1), firstViewport);
  assert.equal(timelineCanvasWidthForZoom(1440, 1), 1440);
  assert.ok(timelineCanvasWidthForZoom(firstViewport, 2) > firstViewport);
  assert.equal(timelineCanvasWidthForZoom(firstViewport, 1), firstViewport);
});
