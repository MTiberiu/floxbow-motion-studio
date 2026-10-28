import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyStoryboard, newSet, newScene, attachShotReferenceImage } from "@motion/project-loader/storyboard";
import type { ProjectManifest } from "@motion/project-loader/schema";
import { StoryboardCompositionImage } from "../apps/desktop/src/StoryboardCompositionImage";

test("Storyboard image layers render through the Video Editor Remotion Image component", () => {
  const doc = emptyStoryboard("motion-test", { width: 1080, height: 1920, fps: 30 });
  const scene = newScene("scene-01", "Rain");
  const set = newSet("set-01", "Mara at the stop");
  attachShotReferenceImage(set, "ref-shot", "repr-shot");
  Object.assign(set.representations[0], { x: 78, y: 82, width: 12, height: 15, rotation: 7, opacity: 0.9 });
  scene.sets.push(set);
  doc.scenes.push(scene);
  doc.references.push({
    id: "ref-shot", assetId: "asset-shot", name: "Mara shot", category: "shot", description: "",
    width: 1080, height: 1920,
  });
  const image = { src: "data:image/png;base64,AAAA", naturalWidth: 1080, naturalHeight: 1920 } as HTMLImageElement;
  const manifest = { id: "motion-test", name: "Test", type: "custom", width: 1080, height: 1920, fps: 30, durationInFrames: 90, entry: "src/index.tsx", sdkVersion: "0.1.0" } as ProjectManifest;

  const markup = renderToStaticMarkup(createElement(StoryboardCompositionImage, {
    doc, set, manifest, images: { "ref-shot": image }, className: "sb-shot-full-image",
  }));

  assert.match(markup, /data-renderer="motion-sdk-image"/);
  assert.match(markup, /data-image-asset-id="asset-shot"/);
  assert.match(markup, /left:84%/);
  assert.match(markup, /top:89\.5%/);
  assert.match(markup, /width:12%/);
  assert.match(markup, /height:15%/);
  assert.match(markup, /rotate\(7deg\)/);
  assert.match(markup, /opacity:0.9/);
});
