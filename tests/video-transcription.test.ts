import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { transcribeVideoClipAudio } from "../scripts/video-transcription";

test("video transcription extracts only the requested source range and cleans temporary audio", async () => {
  let extractedPath = "";
  const raw = await transcribeVideoClipAudio(
    "C:/private/media/video.mp4",
    3.25,
    4.5,
    async (videoPath, start, duration, outputPath) => {
      assert.equal(videoPath, "C:/private/media/video.mp4");
      assert.equal(start, 3.25);
      assert.equal(duration, 4.5);
      extractedPath = outputPath;
      await writeFile(outputPath, Buffer.alloc(64, 1));
    },
    async (audioPath) => {
      await access(audioPath);
      return { segments: [{ start: 0.2, end: 0.8, text: "recognized" }] };
    },
  );
  assert.deepEqual(raw, {
    segments: [{ start: 0.2, end: 0.8, text: "recognized" }],
  });
  await assert.rejects(access(extractedPath));
});

test("video transcription rejects invalid source timing before invoking extraction", async () => {
  let called = false;
  await assert.rejects(
    transcribeVideoClipAudio(
      "video.mp4",
      -1,
      4,
      async () => {
        called = true;
      },
      async () => ({}),
    ),
    /invalid audio timing/,
  );
  assert.equal(called, false);
});
