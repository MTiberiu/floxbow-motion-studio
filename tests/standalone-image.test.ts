import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  standaloneImageClipSchema,
  standaloneImageModule,
  serializableComponentInfo,
} from "@motion/sdk/editor";
import {
  applyCanvasTransform,
  getCanvasVisualElement,
} from "@motion/sdk/canvas";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { InspectorView } from "../apps/desktop/src/InspectorView";

const imageClip = {
  id: "image-first-placement",
  trackId: "visuals",
  componentId: "image",
  label: "Forest",
  from: 180,
  durationInFrames: 90,
  content: { assetId: "image-forest" },
  props: {
    x: 50,
    y: 50,
    width: 80,
    height: 80,
    rotation: 0,
    anchor: "center",
    opacity: 1,
    fit: "contain",
  },
};

test("standalone Image declares editable properties and the shared Canvas transform contract", () => {
  const definition = serializableComponentInfo(standaloneImageModule);
  assert.equal(definition.id, "image");
  assert.equal(definition.canvas?.owner, "core.image");
  assert.deepEqual(definition.canvas?.operations, {
    move: true,
    resize: true,
    rotate: true,
  });
  assert.ok(definition.fields.some((field) => field.key === "fit"));
  assert.ok(definition.fields.some((field) => field.key === "opacity"));
  assert.ok(definition.fields.some((field) => field.key === "flipHorizontal"));
  assert.equal(
    standaloneImageClipSchema.parse(imageClip).content.assetId,
    "image-forest",
  );
  assert.throws(() =>
    standaloneImageClipSchema.parse({
      ...imageClip,
      content: { assetId: "../../secret.png" },
    }),
  );
  assert.equal(
    definition.fields.find((field) => field.key === "width")?.max,
    500,
  );
  assert.equal(
    standaloneImageClipSchema.parse({
      ...imageClip,
      content: {
        ...imageClip.content,
        aspectRatio: 2,
        originalSize: { width: 1200, height: 600 },
      },
      props: {
        ...imageClip.props,
        width: 140,
        height: 120,
        flipHorizontal: true,
      },
    }).props.width,
    140,
  );
  const sizedAndFlipped = standaloneImageClipSchema.parse({
    ...imageClip,
    content: {
      ...imageClip.content,
      aspectRatio: 2,
      originalSize: { width: 1200, height: 600 },
    },
    props: { ...imageClip.props, flipHorizontal: true },
  });
  assert.equal(sizedAndFlipped.props.flipHorizontal, true);
  assert.deepEqual(sizedAndFlipped.content.originalSize, {
    width: 1200,
    height: 600,
  });
  assert.throws(() =>
    standaloneImageClipSchema.parse({
      ...imageClip,
      content: { ...imageClip.content, originalSize: { width: 0, height: 20 } },
    }),
  );
});

test("Image Inspector offers a flip icon and reset-to-source-size action", () => {
  const document = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [imageClip],
  });
  const markup = renderToStaticMarkup(
    createElement(InspectorView, {
      manifest: {
        id: "demo-project",
        name: "Demo",
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 360,
      } as never,
      document,
      clip: document.clips[0],
      definition: serializableComponentInfo(standaloneImageModule),
      onEdit: () => {},
      onChangeProperty: () => {},
      onChangeRange: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
    }),
  );
  assert.match(markup, /aria-label="Flip horizontally"/);
  assert.match(markup, /Reset size/);
  assert.doesNotMatch(markup, /type="checkbox"/);
});

test("Image selection and transforms use shared canonical Timeline v1 properties", () => {
  const document = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [imageClip],
  });
  const definition = serializableComponentInfo(standaloneImageModule);
  const visual = getCanvasVisualElement(document.clips[0], definition);
  assert.ok(visual);
  assert.equal(visual.id, imageClip.id);
  const moved = applyCanvasTransform(document.clips[0], definition, {
    ...visual.transform,
    x: 61,
    y: 42,
    width: 64,
    height: 56,
    rotation: 18,
  });
  const saved = parseEditTimeline({
    ...document,
    clips: [moved],
  });
  assert.equal(saved.clips[0].content.assetId, "image-forest");
  assert.deepEqual(saved.clips[0].props, {
    x: 61,
    y: 42,
    width: 64,
    height: 56,
    rotation: 18,
    anchor: "center",
    opacity: 1,
    fit: "contain",
  });
  assert.equal(saved.clips[0].from, 180);
  assert.equal(saved.clips[0].durationInFrames, 90);
  const oversized = applyCanvasTransform(document.clips[0], definition, {
    ...visual.transform,
    width: 140,
    height: 120,
  });
  assert.equal(standaloneImageClipSchema.parse(oversized).props.width, 140);
});

test("Image waits for the live media map during preview initialization", () => {
  const clip = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [imageClip],
  }).clips[0];
  assert.equal(
    renderToStaticMarkup(
      createElement(standaloneImageModule.component, {
        clip,
        imageSources: undefined,
      }),
    ),
    "",
  );
  assert.throws(
    () =>
      renderToStaticMarkup(
        createElement(standaloneImageModule.component, {
          clip,
          imageSources: {},
        }),
      ),
    /Image asset image-forest is unavailable/,
  );
});
