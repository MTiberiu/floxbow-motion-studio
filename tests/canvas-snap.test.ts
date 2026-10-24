import assert from "node:assert/strict";
import { test } from "node:test";
import { getCanvasVisualElement } from "@motion/sdk/canvas";
import { standaloneTextModule } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { snapCanvasMove } from "../apps/desktop/src/canvas-snap";

const timeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 90,
  tracks: [{ id: "visuals", name: "Visuals" }],
  clips: [
    {
      id: "title",
      trackId: "visuals",
      componentId: "text",
      label: "Title",
      from: 0,
      durationInFrames: 90,
      content: { text: "Hello" },
      props: { x: 40, y: 30, width: 20, height: 10, rotation: 0 },
    },
  ],
});
const title = getCanvasVisualElement(timeline.clips[0], standaloneTextModule)!;

test("Canvas move snaps selection edges and center to composition guides", () => {
  const centered = snapCanvasMove(
    [title],
    { width: 1000, height: 600 },
    90,
    120,
  );
  assert.deepEqual(centered, {
    dx: 100,
    dy: 120,
    guides: { x: 500, y: 300 },
  });

  const edge = snapCanvasMove([title], { width: 1000, height: 600 }, -295, 0);
  assert.deepEqual(edge, { dx: -300, dy: 0, guides: { x: 0 } });
});

test("Shift axis lock keeps snapping on the unlocked movement axis only", () => {
  const result = snapCanvasMove(
    [title],
    { width: 1000, height: 600 },
    90,
    120,
    10,
    "x",
  );
  assert.deepEqual(result, {
    dx: 100,
    dy: 120,
    guides: { x: 500 },
  });
});
