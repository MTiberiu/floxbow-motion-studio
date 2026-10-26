import assert from "node:assert/strict";
import test from "node:test";
import { parsePickerOutput } from "../scripts/audio-file-picker";

test("native picker output preserves Unicode paths and removes only its terminator", () => {
  assert.equal(
    parsePickerOutput("\uFEFFC:\\Media\\Muzică și povești\\melodie.wav\r\n"),
    "C:\\Media\\Muzică și povești\\melodie.wav",
  );
  assert.equal(
    parsePickerOutput("C:\\Media\\ending space \\song.mp3\n"),
    "C:\\Media\\ending space \\song.mp3",
  );
});
