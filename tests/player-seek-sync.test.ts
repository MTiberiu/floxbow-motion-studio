import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingSeekTarget } from "../packages/player/src/seek-sync";

test("same-frame seek does not leave playback waiting for a frame update", () => {
  assert.equal(pendingSeekTarget(42, 42), null);
});

test("changed-frame seek waits for the requested authoritative frame", () => {
  assert.equal(pendingSeekTarget(41, 42), 42);
});
