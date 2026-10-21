import {
  TimelineComposition,
  type EditableComponent,
} from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import { createSubtitleClip } from "@motion/lyrics-sync/subtitles";

const timeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 180,
  tracks: [{ id: "captions", name: "Captions" }],
  clips: [
    createSubtitleClip({
      id: "opening-caption",
      trackId: "captions",
      from: 0,
      durationInFrames: 180,
      content: { text: "A reusable subtitle clip", status: "demo" },
    }),
  ],
});

const editorComponents: EditableComponent[] = [subtitleModule];

export default function SubtitleTimelineExample() {
  return (
    <TimelineComposition timeline={timeline} components={editorComponents} />
  );
}
