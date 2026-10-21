import { fromLyrics, reconcile, toJSON, toLRC, toSRT } from "@motion/lyrics-sync";

export const untimedLyrics = fromLyrics("Frame by frame\nWords in motion");

// A small synthetic fixture demonstrating transcript reconciliation. These
// timestamps illustrate the data shape and are not aligned to a recording.
export const syntheticAlignedLyrics = reconcile("Frame by frame", {
  segments: [
    {
      words: [
        { word: "Frame", start: 0.2, end: 0.7, score: 1 },
        { word: "by", start: 0.8, end: 1, score: 1 },
        { word: "frame", start: 1.1, end: 1.8, score: 1 },
      ],
    },
  ],
});

export const lyricExports = {
  json: toJSON(syntheticAlignedLyrics),
  srt: toSRT(syntheticAlignedLyrics),
  lrc: toLRC(syntheticAlignedLyrics),
};
