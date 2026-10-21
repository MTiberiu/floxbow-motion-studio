import { TimelineComposition, type EditableVideoProps, type EditableComponent } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";

const exampleTimeline = parseEditTimeline({
  version: 1,
  fps: 30,
  durationInFrames: 180,
  tracks: [{ id: "captions", name: "Captions" }],
  clips: [
    {
      id: "timed-words",
      trackId: "captions",
      componentId: "subtitles",
      label: "Timed words",
      from: 0,
      durationInFrames: 180,
      content: {
        text: "Time follows each word.",
        status: "demo",
        words: [
          { id: "time", text: "Time", start: 0.2, end: 1 },
          { id: "follows", text: "follows", start: 1, end: 2 },
          { id: "each", text: "each", start: 2, end: 3 },
          { id: "word", text: "word.", start: 3, end: 4.5 },
        ],
      },
      props: { y: 50, fontSize: 72, animation: "fade", animationFrames: 12, karaoke: true },
    },
  ],
});

export const exampleComponents: EditableComponent[] = [subtitleModule];

export default function SubtitleClipExample({ timeline }: EditableVideoProps) {
  return (
    <TimelineComposition
      timeline={timeline ?? exampleTimeline}
      components={exampleComponents}
    />
  );
}
