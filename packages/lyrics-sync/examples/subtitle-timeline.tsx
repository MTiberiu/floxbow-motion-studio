import { AbsoluteFill } from "remotion";
import {
  TimelineComposition,
  type EditableComponent,
  type EditableVideoProps,
} from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import {
  createSubtitleClip,
  getSubtitleCues,
  selectSubtitleCues,
  type SubtitleConsumerId,
  type SubtitleCue,
} from "@motion/lyrics-sync/subtitles";

const consumerInstanceIds: SubtitleConsumerId[] = [
  "character-01",
  "character-02",
];

const exampleTimeline = parseEditTimeline({
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
      content: {
        text: "One cue can reach two character instances",
        status: "demo",
        speakerId: "speaker-a",
        presentation: "both",
        consumerIds: consumerInstanceIds,
      },
    }),
  ],
});

const editorComponents: EditableComponent[] = [subtitleModule];

function ConsumerReadout({
  consumerId,
  cues,
}: {
  consumerId: SubtitleConsumerId;
  cues: readonly SubtitleCue[];
}) {
  return (
    <div data-example-consumer={consumerId}>
      {consumerId}: {cues.map((cue) => cue.text).join(" · ")}
    </div>
  );
}

export default function SubtitleTimelineExample({
  timeline: liveTimeline,
}: EditableVideoProps) {
  const effectiveTimeline = liveTimeline ?? exampleTimeline;
  const sharedCues = getSubtitleCues(effectiveTimeline);

  return (
    <AbsoluteFill>
      <TimelineComposition
        timeline={effectiveTimeline}
        components={editorComponents}
      />
      <div style={{ position: "absolute", top: 8, left: 8, color: "white" }}>
        {consumerInstanceIds.map((consumerId) => (
          <ConsumerReadout
            key={consumerId}
            consumerId={consumerId}
            cues={selectSubtitleCues(sharedCues, {
              kind: "consumer",
              consumerId,
            })}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}
