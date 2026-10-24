import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCanvasTransform,
  canvasVisualBounds,
  canvasVisualBoundsInViewport,
  canvasVisualCenterInViewport,
  canvasAnchorPositionForCenter,
  getCanvasVisualElement,
  getCanvasVisualElements,
} from "@motion/sdk/canvas";
import {
  standaloneTextModule,
  standaloneImageModule,
  serializableComponentInfo,
} from "@motion/sdk/editor";
import { subtitleModule } from "@motion/lyrics-sync/component";
import { createSubtitleClip } from "@motion/lyrics-sync/subtitles";
import { componentInfoSchema, parseEditTimeline } from "@motion/sdk/timeline";

const definition = serializableComponentInfo(standaloneTextModule);
const timeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 90,
  tracks: [{ id: "visuals", name: "Visuals" }],
  clips: [
    {
      id: "text-a",
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

test("visual components declare a validated, serializable shared Canvas contract", () => {
  assert.deepEqual(
    componentInfoSchema.parse(definition).canvas,
    definition.canvas,
  );
  assert.throws(() =>
    componentInfoSchema.parse({
      ...definition,
      canvas: {
        ...definition.canvas,
        transform: { ...definition.canvas?.transform, x: "missing-x" },
      },
    }),
  );
});

test("Canvas resolves current canonical geometry and writes edits to declared JSON fields", () => {
  const clip = timeline.clips[0];
  const visual = getCanvasVisualElement(clip, definition);
  assert.ok(visual);
  assert.deepEqual(visual.transform, {
    x: 40,
    y: 30,
    width: 20,
    height: 10,
    rotation: 0,
    anchor: "center",
  });

  const next = applyCanvasTransform(clip, definition, {
    x: 44,
    y: 36,
    width: 24,
    height: 12,
    rotation: 15,
    anchor: "center",
  });
  assert.deepEqual(next.props, {
    x: 44,
    y: 36,
    width: 24,
    height: 12,
    rotation: 15,
    anchor: "center",
    fontSize: 86,
  });
  assert.equal(clip.props.x, 40);
  assert.equal(clip.props.y, 30);
});

test("track visibility and lock apply to shared Canvas elements", () => {
  const hidden = parseEditTimeline({
    ...timeline,
    tracks: [{ id: "visuals", name: "Visuals", kind: "visual", visible: false }],
  });
  const locked = parseEditTimeline({
    ...timeline,
    tracks: [{ id: "visuals", name: "Visuals", kind: "visual", locked: true }],
  });
  assert.deepEqual(
    getCanvasVisualElements(hidden, [definition], 0),
    [],
  );
  assert.equal(
    getCanvasVisualElements(locked, [definition], 0)[0]?.locked,
    true,
  );
});

test("Canvas transform API enforces declared operations and field validation", () => {
  const fixed = componentInfoSchema.parse({
    ...definition,
    canvas: {
      ...definition.canvas,
      operations: { move: false, resize: false, rotate: false },
    },
  });
  assert.throws(
    () =>
      applyCanvasTransform(timeline.clips[0], fixed, {
        x: 41,
        y: 30,
        width: 20,
        height: 10,
        rotation: 0,
        anchor: "center",
      }),
    /cannot be moved/,
  );
  assert.throws(() =>
    applyCanvasTransform(timeline.clips[0], definition, {
      x: 40,
      y: 30,
      width: 101,
      height: 10,
      rotation: 0,
      anchor: "center",
    }),
  );
});

test("shared resize metadata scales text size together with its geometry", () => {
  const clip = {
    ...timeline.clips[0],
    props: { ...timeline.clips[0].props, fontSize: 72 },
  };
  const next = applyCanvasTransform(clip, definition, {
    x: 40,
    y: 30,
    width: 30,
    height: 15,
    rotation: 0,
    anchor: "center",
  });
  assert.equal(next.props.width, 30);
  assert.equal(next.props.height, 15);
  assert.equal(next.props.fontSize, 108);
  assert.equal(clip.props.fontSize, 72);
});

test("single-axis text resizing changes its layout box without changing font size", () => {
  const clip = {
    ...timeline.clips[0],
    props: { ...timeline.clips[0].props, fontSize: 72 },
  };
  const next = applyCanvasTransform(clip, definition, {
    x: 40,
    y: 30,
    width: 35,
    height: 10,
    rotation: 0,
    anchor: "center",
  });
  assert.equal(next.props.width, 35);
  assert.equal(next.props.height, 10);
  assert.equal(next.props.fontSize, 72);
});

test("Image Canvas contract allows intentional distortion by default", () => {
  const imageDefinition = serializableComponentInfo(standaloneImageModule);
  const image = {
    ...timeline.clips[0],
    id: "image-a",
    componentId: "image",
    content: { assetId: "asset-a" },
    props: {
      x: 50,
      y: 50,
      width: 40,
      height: 20,
      rotation: 0,
      anchor: "center",
      fit: "fill",
    },
  };
  assert.equal(imageDefinition.canvas?.resizeMode, "free");
  const next = applyCanvasTransform(image, imageDefinition, {
    x: 50,
    y: 50,
    width: 55,
    height: 20,
    rotation: 0,
    anchor: "center",
  });
  assert.equal(next.props.width, 55);
  assert.equal(next.props.height, 20);
});

test("Canvas computes rotated bounds in composition percent space", () => {
  const visual = getCanvasVisualElement(timeline.clips[0], definition);
  assert.ok(visual);
  assert.deepEqual(canvasVisualBounds(visual), {
    left: 30,
    top: 25,
    right: 50,
    bottom: 35,
  });
  const rotated = canvasVisualBounds({
    ...visual,
    transform: { ...visual.transform, rotation: 90 },
  });
  assert.ok(Math.abs(rotated.left - 35) < 1e-10);
  assert.ok(Math.abs(rotated.right - 45) < 1e-10);
  assert.ok(Math.abs(rotated.top - 20) < 1e-10);
  assert.ok(Math.abs(rotated.bottom - 40) < 1e-10);
});

test("Canvas rotation geometry uses the rendered aspect ratio and keeps rotated anchors fixed", () => {
  const visual = getCanvasVisualElement(
    {
      ...timeline.clips[0],
      props: {
        ...timeline.clips[0].props,
        x: 20,
        y: 30,
        width: 20,
        height: 10,
        rotation: 90,
        anchor: "top-left",
      },
    },
    definition,
  );
  assert.ok(visual);
  const viewport = { width: 1920, height: 1080 };
  const center = canvasVisualCenterInViewport(visual, viewport);
  assert.ok(Math.abs(center.x - 330) < 1e-10);
  assert.ok(Math.abs(center.y - 516) < 1e-10);
  const bounds = canvasVisualBoundsInViewport(visual, viewport);
  assert.ok(Math.abs((bounds.left + bounds.right) / 2 - center.x) < 1e-10);
  assert.ok(Math.abs((bounds.top + bounds.bottom) / 2 - center.y) < 1e-10);

  for (const anchor of ["top-left", "bottom-right", "center"] as const) {
    const initial = { ...visual.transform, anchor };
    const initialCenter = canvasVisualCenterInViewport(
      { ...visual, transform: initial },
      viewport,
    );
    const updated = canvasAnchorPositionForCenter(
      initialCenter,
      { ...initial, rotation: 137 },
      viewport,
    );
    const rotated = canvasVisualCenterInViewport(
      {
        ...visual,
        transform: { ...initial, ...updated, rotation: 137 },
      },
      viewport,
    );
    assert.ok(Math.abs(rotated.x - initialCenter.x) < 1e-10, anchor);
    assert.ok(Math.abs(rotated.y - initialCenter.y) < 1e-10, anchor);
  }
});

test("Canvas core rejects resize changes that violate a declared aspect ratio", () => {
  const preserveAspect = componentInfoSchema.parse({
    ...definition,
    canvas: { ...definition.canvas, resizeMode: "preserve-aspect" },
  });
  assert.throws(
    () =>
      applyCanvasTransform(timeline.clips[0], preserveAspect, {
        x: 40,
        y: 30,
        width: 30,
        height: 20,
        rotation: 0,
        anchor: "center",
      }),
    /preserve its aspect ratio/,
  );
  const resized = applyCanvasTransform(timeline.clips[0], preserveAspect, {
    x: 40,
    y: 30,
    width: 40,
    height: 20,
    rotation: 0,
    anchor: "center",
  });
  assert.equal(resized.props.width, 40);
  assert.equal(resized.props.height, 20);
});

test("a module-owned subtitle opts into the same Canvas contract through metadata", () => {
  const subtitleDefinition = serializableComponentInfo(subtitleModule);
  const caption = createSubtitleClip({
    id: "caption-canvas",
    trackId: "visuals",
    from: 0,
    durationInFrames: 60,
    content: { text: "A caption", status: "unverified" },
  });
  const visual = getCanvasVisualElement(caption, subtitleDefinition);
  assert.ok(visual);
  assert.equal(visual.owner, "lyrics-sync.subtitles");
  assert.deepEqual(visual.operations, {
    move: true,
    resize: true,
    rotate: true,
  });
  const hidden = getCanvasVisualElement(
    { ...caption, content: { ...caption.content, presentation: "hidden" } },
    subtitleDefinition,
  );
  assert.equal(hidden, undefined);
});
