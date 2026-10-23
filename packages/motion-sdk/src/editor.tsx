import { type ComponentType } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { z } from "zod";
import { SoundtrackAudio } from "@motion/audio";
import {
  componentInfoSchema,
  parseEditTimeline,
  type EditTimeline,
  type TimelineClip,
  type ComponentInfo,
  type EditableField,
} from "./timeline";
export type EditableComponent = ComponentInfo & {
  component: ComponentType<{ clip: TimelineClip }>;
};
export type EditableVideoProps = {
  timeline?: EditTimeline;
  audioSources?: Readonly<Record<string, string>>;
};

export const standaloneTextPropsSchema = z
  .object({
    x: z.number().finite().min(0).max(100).default(50),
    y: z.number().finite().min(0).max(100).default(50),
    fontSize: z.number().finite().min(8).max(500).default(72),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#ffffff"),
    alignment: z.enum(["left", "center", "right"]).default("center"),
  })
  .passthrough();

export const standaloneTextClipSchema = z
  .object({
    componentId: z.literal("text"),
    content: z.object({ text: z.string().max(20_000) }).passthrough(),
    props: standaloneTextPropsSchema,
  })
  .passthrough();

export const standaloneTextFields: EditableField[] = [
  {
    key: "text",
    target: "content",
    label: "Text",
    type: "text",
    default: "",
  },
  {
    key: "x",
    target: "props",
    label: "Position X (%)",
    type: "number",
    default: 50,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "y",
    target: "props",
    label: "Position Y (%)",
    type: "number",
    default: 50,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "fontSize",
    target: "props",
    label: "Font size",
    type: "number",
    default: 72,
    min: 8,
    max: 500,
    step: 1,
  },
  {
    key: "color",
    target: "props",
    label: "Color",
    type: "color",
    default: "#ffffff",
  },
  {
    key: "alignment",
    target: "props",
    label: "Alignment",
    type: "select",
    default: "center",
    options: ["left", "center", "right"],
  },
];

function StandaloneText({ clip }: { clip: TimelineClip }) {
  const text = standaloneTextClipSchema.parse(clip);
  const { x, y, fontSize, color, alignment } = text.props;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        data-standalone-text-id={clip.id}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          transform: "translate(-50%, -50%)",
          width: "80%",
          color,
          fontSize,
          lineHeight: 1.15,
          textAlign: alignment,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {text.content.text}
      </div>
    </AbsoluteFill>
  );
}

/** Core editable text available in every TimelineComposition without module activation. */
export const standaloneTextModule: EditableComponent = {
  id: "text",
  name: "Text",
  fields: standaloneTextFields,
  component: StandaloneText,
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
  const registeredComponents = [
    standaloneTextModule,
    ...components.filter((component) => component.id !== "text"),
  ];
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      {t.tracks.flatMap((track) =>
        t.clips
          .filter((c) => c.trackId === track.id)
          .map((clip) => {
            if (clip.componentId === "soundtrack") return null;
            const definition = registeredComponents.find(
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
