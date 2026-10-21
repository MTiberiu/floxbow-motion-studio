import { parseEditTimeline } from "@motion/sdk/timeline";

export const emptyEditableTimeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 180,
  tracks: [
    { id: "visuals", name: "Visuals" },
    { id: "captions", name: "Captions" },
  ],
  clips: [],
});
