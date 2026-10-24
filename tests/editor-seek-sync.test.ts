import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldIgnoreEditorPreviewFrame } from "../apps/desktop/src/editor-seek-sync";

test("stale paused preview frames cannot override the latest editor seek", () => {
  assert.equal(shouldIgnoreEditorPreviewFrame(75, 180, false), true);
  assert.equal(shouldIgnoreEditorPreviewFrame(180, 180, false), false);
});

test("preview playback can advance after a seek", () => {
  assert.equal(shouldIgnoreEditorPreviewFrame(181, 180, true), false);
});
