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
