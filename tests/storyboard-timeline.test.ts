import assert from "node:assert/strict";
import test from "node:test";
import { attachShotReferenceImage, emptyStoryboard, newScene, newSet } from "@motion/project-loader/storyboard";
import { standaloneImageClipSchema } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { publishStoryboardToTimeline, storyboardLayerToImageClip, storyboardReferenceIdsForScope, syncStoryboardFromTimeline } from "../apps/desktop/src/storyboard-timeline";
import type { ProjectManifest } from "@motion/project-loader/schema";

test("Storyboard image placement adapts to the existing Video Editor image clip contract", () => {
  const set = newSet("set-03", "Mara sees the cup");
  set.start = 4.2;
  set.duration = 3.3;
  attachShotReferenceImage(set, "ref-shot-03", "repr-shot-03-reference");
  const layer = set.representations[0];
  Object.assign(layer, {
    x: 78,
    y: 82,
    width: 12,
    height: 15,
    rotation: 7,
    imageFit: "contain" as const,
    objectId: "obj-mara",
    zOrder: 2,
    opacity: 0.9,
  });

  const clip = storyboardLayerToImageClip({
    layer,
    set,
    reference: { assetId: "asset-shot-03", name: "Mara key frame", width: 1080, height: 1920 },
    clipId: "clip-shot-03-mara",
    trackId: "visuals",
    from: 126,
    durationInFrames: 99,
    sceneId: "scene-01",
  });
  const parsed = standaloneImageClipSchema.parse(clip);

  assert.deepEqual(parsed.props, {
    x: 84,
    y: 89.5,
    width: 12,
    height: 15,
    rotation: 7,
    anchor: "center",
    opacity: 0.9,
    fit: "contain",
    flipHorizontal: false,
  });
  assert.equal(parsed.from, 126);
  assert.equal(parsed.durationInFrames, 99);
  assert.equal(parsed.content.assetId, "asset-shot-03");
  assert.deepEqual(parsed.content.storyboard, {
    owner: "director-plan",
    sceneId: "scene-01",
    setId: "set-03",
    representationId: "repr-shot-03-reference",
    objectId: "obj-mara",
    zOrder: 2,
  });
});

test("publishing a shot stages stable image clips and preserves existing Animator clips", () => {
  const storyboard = emptyStoryboard("film-demo");
  const scene = newScene("scene-01", "Opening");
  const shot = newSet("shot-01", "Mara waits");
  shot.start = 1;
  shot.duration = 4;
  attachShotReferenceImage(shot, "ref-shot", "layer-shot");
  scene.sets.push(shot);
  storyboard.scenes.push(scene);
  storyboard.references.push({
    id: "ref-shot", assetId: "asset-shot", name: "Mara and station", category: "reference", description: "",
    role: "shot-image", width: 1920, height: 1080,
  });
  const manifest = { id: "film-demo", fps: 30, durationInFrames: 180 } as ProjectManifest;
  const timeline = parseEditTimeline({
    version: 1, fps: 30, durationInFrames: 180, trackOrder: "top-down",
    tracks: [{ id: "visuals", name: "Visuals", kind: "visual" }, { id: "captions", name: "Captions", kind: "visual" }],
    clips: [{ id: "animator-effect", trackId: "visuals", componentId: "trusted-effect", label: "Animator-owned", from: 0, durationInFrames: 60, content: {}, props: {} }],
  });
  const first = publishStoryboardToTimeline({
    document: timeline, storyboard, manifest,
    media: new Map([["asset-shot", { assetId: "asset-shot", name: "Mara and station", width: 1920, height: 1080 }]]),
    scope: { kind: "shot", sceneId: scene.id, setId: shot.id },
  });
  assert.equal(first.added, 1);
  assert.equal(first.timeline.scenes?.[0].from, 30);
  assert.equal(first.timeline.scenes?.[0].durationInFrames, 120);
  assert.equal(first.timeline.clips.find(clip => clip.id === "animator-effect")?.label, "Animator-owned");
  const publishedClip = first.timeline.clips.find(clip => clip.componentId === "image")!;
  assert.equal(publishedClip.from, 30);
  assert.equal(publishedClip.durationInFrames, 120);
  assert.equal(publishedClip.sceneId, scene.id);

  shot.duration = 5;
  const second = publishStoryboardToTimeline({
    document: first.timeline, storyboard, manifest,
    media: new Map([["asset-shot", { assetId: "asset-shot", name: "Mara and station", width: 1920, height: 1080 }]]),
    scope: { kind: "shot", sceneId: scene.id, setId: shot.id },
  });
  assert.equal(second.updated, 1);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.timeline.clips.find(clip => clip.id === publishedClip.id)?.durationInFrames, 150);
});

test("publishing two storyboard scenes includes every visible image element in each shot", () => {
  const storyboard = emptyStoryboard("film-demo");
  for (let sceneIndex = 1; sceneIndex <= 2; sceneIndex++) {
    const scene = newScene(`scene-0${sceneIndex}`, `Scene ${sceneIndex}`);
    const shot = newSet(`shot-0${sceneIndex}`, `Shot ${sceneIndex}`);
    shot.start = (sceneIndex - 1) * 3;
    shot.duration = 3;
    attachShotReferenceImage(shot, `reference-${sceneIndex}-background`, `layer-${sceneIndex}-background`);
    const foreground = structuredClone(shot.representations[0]);
    foreground.id = `layer-${sceneIndex}-character`;
    foreground.layerName = "Character cutout";
    foreground.referenceId = `reference-${sceneIndex}-character`;
    foreground.objectId = `character-${sceneIndex}`;
    foreground.zOrder = 1;
    foreground.x = 25;
    foreground.width = 40;
    shot.representations.push(foreground);
    shot.referenceIds.push(`reference-${sceneIndex}-character`);
    scene.sets.push(shot);
    storyboard.scenes.push(scene);
    for (const role of ["background", "character"] as const) {
      const id = `reference-${sceneIndex}-${role}`;
      storyboard.references.push({ id, assetId: `original-${id}`, name: `${role} ${sceneIndex}`, category: role, description: "", width: 1920, height: 1080 });
    }
  }
  const scope = { kind: "film" as const };
  assert.equal(storyboardReferenceIdsForScope(storyboard, scope).length, 4);
  const media = new Map(storyboard.references.map(reference => [reference.id, {
    assetId: `published-${reference.id}`, name: reference.name, width: reference.width, height: reference.height,
  }] as const));
  const result = publishStoryboardToTimeline({
    document: parseEditTimeline({ version: 1, fps: 30, durationInFrames: 180, tracks: [{ id: "visuals", name: "Visuals", kind: "visual" }], clips: [] }),
    storyboard,
    manifest: { id: "film-demo", fps: 30, durationInFrames: 1 } as ProjectManifest,
    media,
    scope,
  });
  assert.equal(result.timeline.scenes?.length, 2);
  assert.equal(result.added, 4);
  assert.deepEqual(result.timeline.clips.map(clip => clip.content.assetId).sort(), [
    "published-reference-1-background", "published-reference-1-character",
    "published-reference-2-background", "published-reference-2-character",
  ]);
  assert.deepEqual(result.unsupported, []);
});

test("publishing refuses to overwrite a modified Animator clip created from a Storyboard layer", () => {
  const storyboard = emptyStoryboard("film-demo");
  const scene = newScene("scene-01", "Opening");
  const shot = newSet("shot-01", "Mara waits");
  shot.start = 0; shot.duration = 3;
  attachShotReferenceImage(shot, "ref-shot", "layer-shot");
  scene.sets.push(shot); storyboard.scenes.push(scene);
  storyboard.references.push({ id: "ref-shot", assetId: "asset-shot", name: "Mara", category: "reference", description: "" });
  const manifest = { id: "film-demo", fps: 30, durationInFrames: 180 } as ProjectManifest;
  const media = new Map([["asset-shot", { assetId: "asset-shot", name: "Mara" }]]);
  const first = publishStoryboardToTimeline({
    document: parseEditTimeline({ version: 1, fps: 30, durationInFrames: 180, tracks: [{ id: "visuals", name: "Visuals" }], clips: [] }),
    storyboard, manifest, media, scope: { kind: "film" },
  });
  const changed = structuredClone(first.timeline);
  const generated = changed.clips[0];
  changed.clips[0] = { ...generated, props: { ...generated.props, rotation: 12 } };
  const next = publishStoryboardToTimeline({ document: parseEditTimeline(changed), storyboard, manifest, media, scope: { kind: "film" } });
  assert.equal(next.skipped, 1);
  assert.match(next.conflicts[0], /kept the Timeline version/);
  assert.equal(next.timeline.clips[0].props.rotation, 12);
});

test("Storyboard Stretch maps to the Video Editor's Fill mode without changing geometry", () => {
  const set = newSet("set-01", "A river wide shot");
  attachShotReferenceImage(set, "ref-river", "repr-river");
  set.representations[0].imageFit = "stretch";
  const clip = storyboardLayerToImageClip({
    layer: set.representations[0],
    set,
    reference: { assetId: "asset-river", name: "River" },
    clipId: "clip-river",
    trackId: "visuals",
    from: 0,
    durationInFrames: 60,
  });
  assert.equal(clip.props.fit, "fill");
  assert.equal(clip.props.anchor, "center");
});

test("syncing a saved Timeline updates linked shot timing and image placement only", () => {
  const storyboard = emptyStoryboard("film-demo");
  const scene = newScene("scene-01", "Opening");
  const shot = newSet("shot-01", "Mara waits");
  shot.start = 0;
  shot.duration = 3;
  attachShotReferenceImage(shot, "ref-shot", "layer-shot");
  shot.representations[0].instructions = "Keep the cup visible";
  scene.sets.push(shot);
  storyboard.scenes.push(scene);
  storyboard.references.push({ id: "ref-shot", assetId: "asset-shot", name: "Mara", category: "reference", description: "", width: 1920, height: 1080 });
  storyboard.annotations.push({
    id: "annotation-1", sceneId: scene.id, setId: shot.id, targetReferenceId: "ref-shot",
    targetRepresentationId: "layer-shot", coordinateSpace: "image-percent", objectId: null,
    kind: "point", points: [[50, 50]], label: "Cup", instruction: "Keep the cup visible", color: "#ff0000",
  });
  const manifest = { id: "film-demo", fps: 30, durationInFrames: 180 } as ProjectManifest;
  const initial = publishStoryboardToTimeline({
    document: parseEditTimeline({ version: 1, fps: 30, durationInFrames: 180, tracks: [{ id: "visuals", name: "Visuals", kind: "visual" }], clips: [] }),
    storyboard, manifest,
    media: new Map([["ref-shot", { assetId: "asset-shot", name: "Mara", width: 1920, height: 1080 }]]),
    scope: { kind: "film" },
  }).timeline;
  const changed = structuredClone(initial);
  const published = changed.clips.find((item) => item.componentId === "image")!;
  changed.clips[changed.clips.indexOf(published)] = {
    ...published, from: 15, durationInFrames: 120,
    props: { ...published.props, x: 60, y: 45, width: 80, height: 70, rotation: 12, opacity: 0.7, fit: "cover" },
  };
  changed.scenes![0] = { ...changed.scenes![0], from: 15, durationInFrames: 120 };
  const timeline = parseEditTimeline(changed);

  const result = syncStoryboardFromTimeline(storyboard, timeline);
  const updated = result.document.scenes[0];
  const layer = updated.sets[0].representations[0];
  assert.equal(result.updatedShots, 1);
  assert.equal(result.updatedLayers, 1);
  assert.equal(updated.sets[0].start, 0.5);
  assert.equal(updated.sets[0].duration, 4);
  assert.equal(updated.duration, 4);
  assert.deepEqual([layer.x, layer.y, layer.width, layer.height, layer.rotation, layer.opacity, layer.imageFit], [20, 10, 80, 70, 12, 0.7, "cover"]);
  assert.equal(layer.instructions, "Keep the cup visible");
  assert.equal(result.document.annotations[0].instruction, "Keep the cup visible");
});
