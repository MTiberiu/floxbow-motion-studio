import { type ComponentType } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SoundtrackAudio } from "@motion/audio";
import {
  componentInfoSchema,
  parseEditTimeline,
  type EditTimeline,
  type TimelineClip,
  type ComponentInfo,
} from "./timeline";
export type EditableComponent = ComponentInfo & {
  component: ComponentType<{ clip: TimelineClip }>;
};
export type EditableVideoProps = {
  timeline?: EditTimeline;
  audioSources?: Readonly<Record<string, string>>;
};
/** Strip executable renderer code before metadata crosses the isolated preview bridge. */
export function serializableComponentInfo(
  component: EditableComponent,
): ComponentInfo {
  const { component: _renderer, ...info } = component;
  return componentInfoSchema.parse(info);
}
export function TimelineComposition({
  timeline,
  components,
}: {
  timeline: EditTimeline;
  components: EditableComponent[];
}) {
  const t = parseEditTimeline(timeline);
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      {t.tracks.flatMap((track) =>
        t.clips
          .filter((c) => c.trackId === track.id)
          .map((clip) => {
            if (clip.componentId === "soundtrack") return null;
            const definition = components.find(
              (c) => c.id === clip.componentId,
            );
            if (!definition)
              throw new Error(`Unknown component ${clip.componentId}`);
            const Element = definition.component;
            return (
              <Sequence
                key={clip.id}
                from={clip.from}
                durationInFrames={clip.durationInFrames}
                name={clip.label}
              >
                <Element clip={clip} />
              </Sequence>
            );
          }),
      )}
    </AbsoluteFill>
  );
}

/** Render soundtrack clips in the surrounding Remotion composition and transport. */
export function TimelineSoundtrackAudio({
  timeline,
  audioSources,
}: {
  timeline?: EditTimeline;
  audioSources: Readonly<Record<string, string>>;
}) {
  if (!timeline) return null;
  const document = parseEditTimeline(timeline);
  return (
    <>
      {document.clips
        .filter((clip) => clip.componentId === "soundtrack")
        .map((clip) => {
          const assetId = clip.content.assetId;
          const src =
            typeof assetId === "string" ? audioSources[assetId] : undefined;
          if (!src)
            throw new Error(
              `Soundtrack audio ${String(assetId ?? "")} is unavailable. Relink the audio in Project Media.`,
            );
          return (
            <Sequence
              key={clip.id}
              from={clip.from}
              durationInFrames={clip.durationInFrames}
              name={clip.label}
            >
              <SoundtrackAudio src={src} />
            </Sequence>
          );
        })}
    </>
  );
}
