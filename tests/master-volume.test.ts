import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidMasterVolume } from "../packages/player/src/master-volume";

test("master preview volume accepts only finite normalized values", () => {
  assert.equal(isValidMasterVolume(0), true);
  assert.equal(isValidMasterVolume(0.5), true);
  assert.equal(isValidMasterVolume(1), true);
  for (const invalid of [
    -0.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "0.5",
    null,
  ])
    assert.equal(isValidMasterVolume(invalid), false);
});
