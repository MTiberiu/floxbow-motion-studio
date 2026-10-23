import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_ASSET_DRAG_TYPE,
  parseMediaAssetDragData,
} from "../apps/desktop/src/media-drag";

test("Media Library drag data carries only a validated project-local asset reference", () => {
  const value = JSON.stringify({
    projectId: "sample-video",
    assetId: "forest-image",
    type: "image",
    displayName: "Forest.png",
  });
  assert.equal(MEDIA_ASSET_DRAG_TYPE, "application/x-floxbow-media-asset+json");
  assert.deepEqual(parseMediaAssetDragData(value), {
    projectId: "sample-video",
    assetId: "forest-image",
    type: "image",
    displayName: "Forest.png",
  });
});

test("Media Library drag data rejects paths, unknown fields and malformed IDs", () => {
  const base = {
    projectId: "sample-video",
    assetId: "forest-image",
    type: "image",
    displayName: "Forest.png",
  };
  assert.equal(
    parseMediaAssetDragData(
      JSON.stringify({ ...base, path: "C:\\private.png" }),
    ),
    undefined,
  );
  assert.equal(
    parseMediaAssetDragData(JSON.stringify({ ...base, assetId: "../private" })),
    undefined,
  );
  assert.equal(
    parseMediaAssetDragData(
      JSON.stringify({ ...base, displayName: "x".repeat(201) }),
    ),
    undefined,
  );
  assert.equal(parseMediaAssetDragData("not json"), undefined);
});
