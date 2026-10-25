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
import type { ProjectManifest } from "@motion/project-loader/schema";
import { mediaOrientationStyle } from "../packages/motion-sdk/src/media-orientation";
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
    flipHorizontal: false,
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
    definition.fields.find((field) => field.key === "flipHorizontal")?.type,
    "boolean",
  );
  assert.equal(
    standaloneImageClipSchema.parse(imageClip).content.assetId,
    "image-forest",
  );
  const { flipHorizontal: _legacyFlip, ...legacyProps } = imageClip.props;
  assert.equal(
    standaloneImageClipSchema.parse({
      ...imageClip,
      props: legacyProps,
    }).props.flipHorizontal,
    false,
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
      props: { ...imageClip.props, width: 140, height: 120 },
    }).props.width,
    140,
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
    flipHorizontal: false,
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

test("Image horizontal flip is persisted and mirrors pixels inside its existing bounds", () => {
  const flipped = standaloneImageClipSchema.parse({
    ...imageClip,
    props: { ...imageClip.props, flipHorizontal: true },
  });
  assert.equal(flipped.props.flipHorizontal, true);
  assert.deepEqual(mediaOrientationStyle(flipped.props.flipHorizontal), {
    transform: "scaleX(-1)",
    transformOrigin: "center",
  });
  assert.equal(flipped.props.width, imageClip.props.width);
  assert.equal(flipped.props.height, imageClip.props.height);
});

test("Image Inspector exposes horizontal flip as an icon button, not a checkbox", () => {
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
        id: "test-project",
        name: "Test project",
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 360,
      } as ProjectManifest,
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
  assert.match(markup, /<svg viewBox="0 0 24 24"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.doesNotMatch(markup, /checkbox-property/);
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
