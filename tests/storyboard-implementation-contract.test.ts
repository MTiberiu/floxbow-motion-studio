import assert from "node:assert/strict";
import test from "node:test";
import {
  animatorOutputId,
  attachShotReferenceImage,
  emptyStoryboard,
  newScene,
  newSet,
  storyboardSchema,
} from "@motion/project-loader/storyboard";

test("Animator output IDs are stable for a project shot and authored key", () => {
  const first = animatorOutputId("scene-refren-final", "shot-27", "foliage-shadow");
  assert.equal(first, animatorOutputId("scene-refren-final", "shot-27", "foliage-shadow"));
  assert.notEqual(first, animatorOutputId("scene-refren-final", "shot-28", "foliage-shadow"));
  assert.match(first, /^anim-[a-z0-9-]+$/);
});

test("Animator declares image assets and effects as a target-linked hierarchy", () => {
  const document = emptyStoryboard("implementation-demo");
  const scene = newScene("scene-one", "Scene One");
  const shot = newSet("shot-one", "Shot One");
  attachShotReferenceImage(shot, "reference-shot", "layer-background");
  scene.sets.push(shot);
  document.scenes.push(scene);
  document.references.push({
    id: "reference-shot", assetId: "asset-shot", name: "Background", category: "reference", description: "",
  }, {
    id: "reference-leaves", assetId: "asset-leaves", name: "Leaf shadow", category: "effect asset", description: "Transparent PNG used by the animator's shadow effect.",
  });
  document.collaboration.push({
    id: "animator-output-report",
    sceneId: scene.id,
    setId: shot.id,
    targetKind: "element",
    targetId: "layer-background",
    field: "implementation",
    author: "animator",
    kind: "implementation",
    outcome: "implemented",
    replyToId: null,
    message: "Registered the image asset and its deterministic drift effect.",
    timelineClipIds: ["clip-background"],
    componentIds: ["director-image"],
    sourceFiles: ["scenes/Shot01.tsx"],
    outputs: [
      {
        id: "element-leaf-shadow",
        kind: "image",
        name: "Leaf shadow asset",
        description: "Transparent image used behind the character.",
        assetReferenceId: "reference-leaves",
        targetElementId: "layer-background",
        startFrame: null,
        durationInFrames: null,
      },
      {
        id: "effect-leaf-drift",
        kind: "effect",
        name: "Slow leaf drift",
        description: "Moves and fades the shadow across the shot.",
        assetReferenceId: null,
        targetElementId: "element-leaf-shadow",
        startFrame: 0,
        durationInFrames: 120,
      },
    ],
    createdAt: "2026-10-28T10:00:00.000Z",
  });

  const parsed = storyboardSchema.parse(document);
  assert.deepEqual(parsed.collaboration[0].outputs?.map(output => output.id), ["element-leaf-shadow", "effect-leaf-drift"]);
});

test("Animator image outputs need a registered image and effects need an element target", () => {
  const imageWithoutAsset = {
    id: "image-output", kind: "image", name: "New image", description: "", assetReferenceId: null,
    targetElementId: null, startFrame: null, durationInFrames: null,
  };
  const effectWithoutTarget = {
    id: "effect-output", kind: "effect", name: "New effect", description: "", assetReferenceId: null,
    targetElementId: null, startFrame: null, durationInFrames: null,
  };
  const document = emptyStoryboard("implementation-demo");
  const scene = newScene("scene-one", "Scene One");
  const shot = newSet("shot-one", "Shot One");
  shot.description = "An image and its effect.";
  scene.sets.push(shot);
  document.scenes.push(scene);
  const baseMessage = {
    id: "animator-output-report", sceneId: scene.id, setId: shot.id, targetKind: "shot" as const,
    targetId: shot.id, field: "description", author: "animator" as const, kind: "implementation" as const,
    replyToId: null, message: "Implementation", timelineClipIds: [], componentIds: [],
    sourceFiles: ["scenes/Shot01.tsx"], createdAt: "2026-10-28T10:00:00.000Z",
  };
  assert.throws(() => storyboardSchema.parse({ ...document, collaboration: [{ ...baseMessage, outputs: [imageWithoutAsset] }] }), /registered Storyboard image reference/);
  assert.throws(() => storyboardSchema.parse({ ...document, collaboration: [{ ...baseMessage, outputs: [effectWithoutTarget] }] }), /target element ID/);
});
