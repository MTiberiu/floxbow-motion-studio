import assert from "node:assert/strict";
import test from "node:test";
import {
  standaloneVideoAudioClipSchema,
  standaloneVideoClipSchema,
  standaloneVideoModule,
  serializableComponentInfo,
} from "@motion/sdk/editor";
import {
  applyCanvasTransform,
  getCanvasVisualElement,
} from "@motion/sdk/canvas";
import { parseEditTimeline } from "@motion/sdk/timeline";

const videoClip = {
  id: "video-intro-instance",
  trackId: "visuals",
  componentId: "video",
  label: "Intro.mp4",
  from: 120,
  durationInFrames: 60,
  content: {
    assetId: "video-intro",
    sourceStartSeconds: 0.25,
    sourceDurationSeconds: 8,
  },
  props: {
    x: 50,
    y: 50,
    width: 80,
    height: 80,
    rotation: 0,
    anchor: "center",
    opacity: 1,
    fit: "contain",
    volume: 0.75,
  },
};

test("standalone Video uses registered asset IDs and declares shared Canvas operations", () => {
  const definition = serializableComponentInfo(standaloneVideoModule);
  assert.equal(definition.id, "video");
  assert.equal(definition.canvas?.owner, "core.video");
  assert.deepEqual(definition.canvas?.operations, {
    move: true,
    resize: true,
    rotate: true,
  });
  assert.ok(
    definition.fields.some((field) => field.key === "sourceStartSeconds"),
  );
  assert.ok(definition.fields.some((field) => field.key === "volume"));
  assert.deepEqual(standaloneVideoClipSchema.parse(videoClip).content, {
    assetId: "video-intro",
    sourceStartSeconds: 0.25,
    sourceDurationSeconds: 8,
  });
  assert.throws(() =>
    standaloneVideoClipSchema.parse({
      ...videoClip,
      content: { ...videoClip.content, assetId: "../outside.mp4" },
    }),
  );
});

test("Video transform edits remain canonical Timeline v1 clip properties", () => {
  const document = parseEditTimeline({
    version: 1,
    fps: 30,
    durationInFrames: 360,
    tracks: [{ id: "visuals", name: "Visuals" }],
    clips: [videoClip],
  });
  const definition = serializableComponentInfo(standaloneVideoModule);
  const visual = getCanvasVisualElement(document.clips[0], definition);
  assert.ok(visual);
  const changed = applyCanvasTransform(document.clips[0], definition, {
    ...visual.transform,
    x: 63,
    y: 31,
    width: 45,
    height: 50,
    rotation: -12,
  });
  const saved = parseEditTimeline({ ...document, clips: [changed] });
  assert.equal(saved.clips[0].content.assetId, "video-intro");
  assert.equal(saved.clips[0].content.sourceStartSeconds, 0.25);
  assert.deepEqual(saved.clips[0].props, {
    ...videoClip.props,
    x: 63,
    y: 31,
    width: 45,
    height: 50,
    rotation: -12,
  });
});

test("detached video audio keeps a separate clip ID and the registered video asset reference", () => {
  const audioClip = standaloneVideoAudioClipSchema.parse({
    id: "video-audio-instance",
    trackId: "audio",
    componentId: "video-audio",
    label: "Audio · Intro.mp4",
    from: 120,
    durationInFrames: 60,
    content: {
      assetId: "video-intro",
      sourceVideoClipId: "video-intro-instance",
      sourceStartSeconds: 0.25,
      sourceDurationSeconds: 8,
    },
    props: { volume: 0.75 },
  });
  assert.equal(audioClip.from, videoClip.from);
  assert.equal(audioClip.durationInFrames, videoClip.durationInFrames);
  assert.equal(audioClip.content.assetId, videoClip.content.assetId);
  assert.throws(() =>
    standaloneVideoAudioClipSchema.parse({
      ...audioClip,
      content: { ...audioClip.content, assetId: "../../outside" },
    }),
  );
});
