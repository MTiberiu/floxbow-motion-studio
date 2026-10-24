import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pendingSeekTarget,
  shouldIgnorePendingSeekFrame,
} from "../packages/player/src/seek-sync";

test("same-frame seek does not leave playback waiting for a frame update", () => {
  assert.equal(pendingSeekTarget(42, 42), null);
});

test("changed-frame seek waits for the requested authoritative frame", () => {
  assert.equal(pendingSeekTarget(41, 42), 42);
});

test("stale seeked reports cannot overwrite the requested editor frame", () => {
  assert.equal(shouldIgnorePendingSeekFrame(60, 180), true);
  assert.equal(shouldIgnorePendingSeekFrame(180, 180), false);
  assert.equal(shouldIgnorePendingSeekFrame(60, null), false);
});
