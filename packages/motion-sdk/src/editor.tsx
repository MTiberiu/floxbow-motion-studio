import { type ComponentType } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { SoundtrackAudio } from "@motion/audio";
import {
  componentInfoSchema,
  parseEditTimeline,
  type EditTimeline,
  type TimelineClip,
  type ComponentInfo,
  type EditableField,
  visualTracksInRenderOrder,
} from "./timeline";
export type EditableComponent = ComponentInfo & {
  component: ComponentType<{
    clip: TimelineClip;
    frame?: number;
    imageSources?: Readonly<Record<string, string>>;
    videoSources?: Readonly<Record<string, string>>;
  }>;
};
export type EditableVideoProps = {
  timeline?: EditTimeline;
  audioSources?: Readonly<Record<string, string>>;
  imageSources?: Readonly<Record<string, string>>;
  videoSources?: Readonly<Record<string, string>>;
};

export const standaloneTextPropsSchema = z
  .object({
    x: z.number().finite().min(0).max(100).default(50),
    y: z.number().finite().min(0).max(100).default(50),
    width: z.number().finite().min(1).max(100).default(80),
    height: z.number().finite().min(1).max(100).default(20),
    rotation: z.number().finite().min(-3600).max(3600).default(0),
    anchor: z
      .enum([
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "center",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ])
      .default("center"),
    fontSize: z.number().finite().min(8).max(500).default(72),
    fontFamily: z
      .enum(["Arial", "Georgia", "Impact", "Times New Roman", "Verdana"])
      .default("Arial"),
    fontWeight: z
      .enum(["400", "500", "600", "700", "800", "900"])
      .default("400"),
    italic: z.boolean().default(false),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#ffffff"),
    alignment: z.enum(["left", "center", "right"]).default("center"),
    opacity: z.number().finite().min(0).max(1).default(1),
    lineSpacing: z.number().finite().min(0.5).max(3).default(1.15),
    fadeInFrames: z.number().int().min(0).max(900).default(0),
    fadeOutFrames: z.number().int().min(0).max(900).default(0),
    slideInFrames: z.number().int().min(0).max(900).default(0),
    slideOutFrames: z.number().int().min(0).max(900).default(0),
    scaleInFrames: z.number().int().min(0).max(900).default(0),
    scaleOutFrames: z.number().int().min(0).max(900).default(0),
    slideDirection: z.enum(["up", "down", "left", "right"]).default("up"),
  })
  .passthrough();

export const standaloneTextClipSchema = z
  .object({
    componentId: z.literal("text"),
    content: z.object({ text: z.string().max(20_000) }).passthrough(),
    props: standaloneTextPropsSchema,
  })
  .passthrough();

export const standaloneImageClipSchema = z
  .object({
    componentId: z.literal("image"),
    content: z
      .object({
        assetId: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(120),
        aspectRatio: z.number().finite().min(0.01).max(100).optional(),
      })
      .passthrough(),
    props: z
      .object({
        x: z.number().finite().min(0).max(100).default(50),
        y: z.number().finite().min(0).max(100).default(50),
        width: z.number().finite().min(1).max(500).default(80),
        height: z.number().finite().min(1).max(500).default(80),
        rotation: z.number().finite().min(-3600).max(3600).default(0),
        anchor: z
          .enum([
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "center",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ])
          .default("center"),
        opacity: z.number().finite().min(0).max(1).default(1),
        fit: z.enum(["contain", "cover", "fill"]).default("contain"),
      })
      .passthrough(),
  })
  .passthrough();

export const standaloneVideoClipSchema = z
  .object({
    componentId: z.literal("video"),
    content: z
      .object({
        assetId: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(120),
        sourceStartSeconds: z.number().finite().min(0).default(0),
        sourceDurationSeconds: z.number().finite().positive(),
      })
      .passthrough(),
    props: z
      .object({
        x: z.number().finite().min(0).max(100).default(50),
        y: z.number().finite().min(0).max(100).default(50),
        width: z.number().finite().min(1).max(500).default(80),
        height: z.number().finite().min(1).max(500).default(80),
        rotation: z.number().finite().min(-3600).max(3600).default(0),
        anchor: z
          .enum([
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "center",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ])
          .default("center"),
        opacity: z.number().finite().min(0).max(1).default(1),
        fit: z.enum(["contain", "cover", "fill"]).default("contain"),
        volume: z.number().finite().min(0).max(1).default(1),
      })
      .passthrough(),
  })
  .passthrough();

/** Audio detached from a Video clip; still references the same registered MP4. */
export const standaloneVideoAudioClipSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .max(100),
    trackId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .max(100),
    componentId: z.literal("video-audio"),
    label: z.string().max(200),
    from: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
    content: z
      .object({
        assetId: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(120),
        sourceVideoClipId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .max(100),
        sourceStartSeconds: z.number().finite().min(0),
        sourceDurationSeconds: z.number().finite().positive(),
      })
      .passthrough(),
    props: z
      .object({ volume: z.number().finite().min(0).max(1).default(1) })
      .passthrough(),
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
    key: "width",
    target: "props",
    label: "Text box width (%)",
    type: "number",
    default: 80,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: "height",
    target: "props",
    label: "Text box height (%)",
    type: "number",
    default: 20,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: "rotation",
    target: "props",
    label: "Rotation (°)",
    type: "number",
    default: 0,
    min: -3600,
    max: 3600,
    step: 1,
  },
  {
    key: "anchor",
    target: "props",
    label: "Anchor",
    type: "select",
    default: "center",
    options: [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
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
    key: "fontFamily",
    target: "props",
    label: "Font family",
    type: "select",
    default: "Arial",
    options: ["Arial", "Georgia", "Impact", "Times New Roman", "Verdana"],
  },
  {
    key: "fontWeight",
    target: "props",
    label: "Font weight",
    type: "select",
    default: "400",
    options: ["400", "500", "600", "700", "800", "900"],
  },
  {
    key: "italic",
    target: "props",
    label: "Italic",
    type: "boolean",
    default: false,
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
  {
    key: "opacity",
    target: "props",
    label: "Opacity",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "lineSpacing",
    target: "props",
    label: "Line spacing",
    type: "number",
    default: 1.15,
    min: 0.5,
    max: 3,
    step: 0.05,
  },
  ...(
    [
      ["fadeInFrames", "Fade in (frames)"],
      ["fadeOutFrames", "Fade out (frames)"],
      ["slideInFrames", "Slide in (frames)"],
      ["slideOutFrames", "Slide out (frames)"],
      ["scaleInFrames", "Scale in (frames)"],
      ["scaleOutFrames", "Scale out (frames)"],
    ] as const
  ).map(([key, label]) => ({
    key,
    target: "props" as const,
    label,
    type: "number" as const,
    default: 0,
    min: 0,
    max: 900,
    step: 1,
  })),
  {
    key: "slideDirection",
    target: "props",
    label: "Slide direction",
    type: "select",
    default: "up",
    options: ["up", "down", "left", "right"],
  },
];

function StandaloneText({
  clip,
  frame = 0,
}: {
  clip: TimelineClip;
  frame?: number;
}) {
  const text = standaloneTextClipSchema.parse(clip);
  const {
    x,
    y,
    width,
    height,
    rotation,
    anchor,
    fontSize,
    fontFamily,
    fontWeight,
    italic,
    color,
    alignment,
    opacity,
    lineSpacing,
    fadeInFrames,
    fadeOutFrames,
    slideInFrames,
    slideOutFrames,
    scaleInFrames,
    scaleOutFrames,
    slideDirection,
  } = text.props;
  const progress = (value: number, duration: number, reverse = false) => {
    if (duration <= 0) return 1;
    const ratio = Math.max(0, Math.min(1, value / duration));
    return reverse ? 1 - ratio : ratio;
  };
  const fade = Math.min(
    progress(frame, fadeInFrames),
    progress(clip.durationInFrames - frame, fadeOutFrames),
  );
  const slideIn = progress(frame, slideInFrames);
  const slideOut =
    slideOutFrames > 0
      ? 1 - progress(clip.durationInFrames - frame, slideOutFrames)
      : 0;
  const scaleIn = progress(frame, scaleInFrames);
  const scaleOut =
    scaleOutFrames > 0
      ? 1 - progress(clip.durationInFrames - frame, scaleOutFrames)
      : 0;
  const anchorStyles: Record<string, { translate: string; origin: string }> = {
    "top-left": { translate: "0, 0", origin: "top left" },
    "top-center": { translate: "-50%, 0", origin: "top center" },
    "top-right": { translate: "-100%, 0", origin: "top right" },
    "middle-left": { translate: "0, -50%", origin: "center left" },
    center: { translate: "-50%, -50%", origin: "center" },
    "middle-right": { translate: "-100%, -50%", origin: "center right" },
    "bottom-left": { translate: "0, -100%", origin: "bottom left" },
    "bottom-center": { translate: "-50%, -100%", origin: "bottom center" },
    "bottom-right": { translate: "-100%, -100%", origin: "bottom right" },
  };
  const anchorStyle = anchorStyles[anchor];
  const slideOffset = 48 * (1 - slideIn);
  const slideOutOffset = 48 * slideOut;
  const slideX =
    slideDirection === "left"
      ? -slideOffset + slideOutOffset
      : slideDirection === "right"
        ? slideOffset - slideOutOffset
        : 0;
  const slideY =
    slideDirection === "up"
      ? slideOffset - slideOutOffset
      : slideDirection === "down"
        ? -slideOffset + slideOutOffset
        : 0;
  const scaleValue = Math.max(
    0.5,
    Math.min(1, 0.5 + scaleIn * 0.5 - scaleOut * 0.5),
  );
  const roundedSlideX = Number(slideX.toFixed(3));
  const roundedSlideY = Number(slideY.toFixed(3));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        data-standalone-text-id={clip.id}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
          transform: `translate(${anchorStyle.translate}) rotate(${rotation}deg) translate(${roundedSlideX}px, ${roundedSlideY}px) scale(${scaleValue})`,
          transformOrigin: anchorStyle.origin,
          display: "flex",
          alignItems: "center",
          justifyContent:
            alignment === "left"
              ? "flex-start"
              : alignment === "right"
                ? "flex-end"
                : "center",
          color,
          fontSize,
          fontFamily,
          fontWeight,
          fontStyle: italic ? "italic" : "normal",
          opacity: opacity * fade,
          lineHeight: lineSpacing,
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

function FrameAwareComponent({
  component: Component,
  clip,
  imageSources,
  videoSources,
}: {
  component: EditableComponent["component"];
  clip: TimelineClip;
  imageSources?: Readonly<Record<string, string>>;
  videoSources?: Readonly<Record<string, string>>;
}) {
  return (
    <Component
      clip={clip}
      frame={useCurrentFrame()}
      imageSources={imageSources}
      videoSources={videoSources}
    />
  );
}

/** Core editable text available in every TimelineComposition without module activation. */
export const standaloneTextModule: EditableComponent = {
  id: "text",
  name: "Text",
  fields: standaloneTextFields,
  canvas: {
    owner: "core.text",
    coordinateSpace: "composition-percent",
    transform: {
      x: "x",
      y: "y",
      width: "width",
      height: "height",
      rotation: "rotation",
      anchor: "anchor",
    },
    operations: { move: true, resize: true, rotate: true },
    resizeMode: "preserve-aspect",
    resizeScaleFields: ["fontSize"],
  },
  component: StandaloneText,
};

const imageFields: EditableField[] = [
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
    key: "width",
    target: "props",
    label: "Width (%)",
    type: "number",
    default: 80,
    min: 1,
    max: 500,
    step: 1,
  },
  {
    key: "height",
    target: "props",
    label: "Height (%)",
    type: "number",
    default: 80,
    min: 1,
    max: 500,
    step: 1,
  },
  {
    key: "rotation",
    target: "props",
    label: "Rotation (°)",
    type: "number",
    default: 0,
    min: -3600,
    max: 3600,
    step: 1,
  },
  {
    key: "anchor",
    target: "props",
    label: "Anchor",
    type: "select",
    default: "center",
    options: [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
  },
  {
    key: "opacity",
    target: "props",
    label: "Opacity",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "fit",
    target: "props",
    label: "Image fit",
    type: "select",
    default: "contain",
    options: ["contain", "cover", "fill"],
  },
];

function StandaloneImage({
  clip,
  imageSources,
}: {
  clip: TimelineClip;
  imageSources?: Readonly<Record<string, string>>;
}) {
  const image = standaloneImageClipSchema.parse(clip);
  const source = imageSources?.[image.content.assetId];
  if (!source && imageSources === undefined) return null;
  if (!source)
    throw new Error(`Image asset ${image.content.assetId} is unavailable.`);
  const { x, y, width, height, rotation, anchor, opacity, fit } = image.props;
  const positions: Record<string, { translate: string; origin: string }> = {
    "top-left": { translate: "0, 0", origin: "top left" },
    "top-center": { translate: "-50%, 0", origin: "top center" },
    "top-right": { translate: "-100%, 0", origin: "top right" },
    "middle-left": { translate: "0, -50%", origin: "center left" },
    center: { translate: "-50%, -50%", origin: "center" },
    "middle-right": { translate: "-100%, -50%", origin: "center right" },
    "bottom-left": { translate: "0, -100%", origin: "bottom left" },
    "bottom-center": { translate: "-50%, -100%", origin: "bottom center" },
    "bottom-right": { translate: "-100%, -100%", origin: "bottom right" },
  };
  const position = positions[anchor];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Img
        data-image-asset-id={image.content.assetId}
        src={source}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
          transform: `translate(${position.translate}) rotate(${rotation}deg)`,
          transformOrigin: position.origin,
          opacity,
          objectFit: fit,
        }}
      />
    </AbsoluteFill>
  );
}

/** Core Image clips reference registered media IDs and share Canvas transforms. */
export const standaloneImageModule: EditableComponent = {
  id: "image",
  name: "Image",
  fields: imageFields,
  canvas: {
    owner: "core.image",
    coordinateSpace: "composition-percent",
    transform: {
      x: "x",
      y: "y",
      width: "width",
      height: "height",
      rotation: "rotation",
      anchor: "anchor",
    },
    operations: { move: true, resize: true, rotate: true },
    // Image resize mode is free; Shift can constrain the shared Canvas gesture.
    resizeMode: "free",
  },
  component: StandaloneImage,
};

const videoFields: EditableField[] = [
  ...imageFields.filter((field) => field.key !== "fit"),
  {
    key: "fit",
    target: "props",
    label: "Video fit",
    type: "select",
    default: "contain",
    options: ["contain", "cover", "fill"],
  },
  {
    key: "volume",
    target: "props",
    label: "Clip volume",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "sourceStartSeconds",
    target: "content",
    label: "Source start time (seconds)",
    type: "number",
    default: 0,
    min: 0,
    max: 86_400,
    step: 0.001,
  },
];

function StandaloneVideo({
  clip,
  videoSources,
}: {
  clip: TimelineClip;
  videoSources?: Readonly<Record<string, string>>;
}) {
  const video = standaloneVideoClipSchema.parse(clip);
  const source = videoSources?.[video.content.assetId];
  if (!source && videoSources === undefined) return null;
  if (!source)
    throw new Error(`Video asset ${video.content.assetId} is unavailable.`);
  const { fps } = useVideoConfig();
  if (
    video.content.sourceStartSeconds + clip.durationInFrames / fps >
    video.content.sourceDurationSeconds + 1 / fps
  )
    throw new Error(
      `Video clip ${clip.id} exceeds the duration of its MP4 source.`,
    );
  const { x, y, width, height, rotation, anchor, opacity, fit, volume } =
    video.props;
  const positions: Record<string, { translate: string; origin: string }> = {
    "top-left": { translate: "0, 0", origin: "top left" },
    "top-center": { translate: "-50%, 0", origin: "top center" },
    "top-right": { translate: "-100%, 0", origin: "top right" },
    "middle-left": { translate: "0, -50%", origin: "center left" },
    center: { translate: "-50%, -50%", origin: "center" },
    "middle-right": { translate: "-100%, -50%", origin: "center right" },
    "bottom-left": { translate: "0, -100%", origin: "bottom left" },
    "bottom-center": { translate: "-50%, -100%", origin: "bottom center" },
    "bottom-right": { translate: "-100%, -100%", origin: "bottom right" },
  };
  const position = positions[anchor];
  const sourceStart = Math.round(video.content.sourceStartSeconds * fps);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <OffthreadVideo
        data-video-asset-id={video.content.assetId}
        src={source}
        startFrom={sourceStart}
        endAt={sourceStart + clip.durationInFrames}
        volume={volume}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
          transform: `translate(${position.translate}) rotate(${rotation}deg)`,
          transformOrigin: position.origin,
          opacity,
          objectFit: fit,
        }}
      />
    </AbsoluteFill>
  );
}

/** Core MP4 clips use registered media IDs and the shared Canvas transform contract. */
export const standaloneVideoModule: EditableComponent = {
  id: "video",
  name: "Video",
  fields: videoFields,
  timelineBehavior: "core-video",
  canvas: {
    owner: "core.video",
    coordinateSpace: "composition-percent",
    transform: {
      x: "x",
      y: "y",
      width: "width",
      height: "height",
      rotation: "rotation",
      anchor: "anchor",
    },
    operations: { move: true, resize: true, rotate: true },
    resizeMode: "free",
  },
  component: StandaloneVideo,
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
  imageSources,
  videoSources,
}: {
  timeline: EditTimeline;
  components: EditableComponent[];
  imageSources?: Readonly<Record<string, string>>;
  videoSources?: Readonly<Record<string, string>>;
}) {
  const t = parseEditTimeline(timeline);
  const registeredComponents = [
    standaloneTextModule,
    standaloneImageModule,
    standaloneVideoModule,
    ...components.filter(
      (component) =>
        component.id !== "text" &&
        component.id !== "image" &&
        component.id !== "video",
    ),
  ];
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      {visualTracksInRenderOrder(t).flatMap((track) =>
        track.visible === false
          ? []
          : t.clips
              .filter((c) => c.trackId === track.id)
              .map((clip) => {
                if (
                  clip.componentId === "soundtrack" ||
                  clip.componentId === "video-audio"
                )
                  return null;
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
                    <FrameAwareComponent
                      component={Element}
                      clip={clip}
                      imageSources={imageSources}
                      videoSources={videoSources}
                    />
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

/** Render detached MP4 audio through the same Remotion Player/render transport. */
export function TimelineVideoAudio({
  timeline,
  videoSources = {},
}: {
  timeline?: EditTimeline;
  videoSources?: Readonly<Record<string, string>>;
}) {
  if (!timeline) return null;
  const document = parseEditTimeline(timeline);
  return (
    <>
      {document.clips
        .filter((clip) => clip.componentId === "video-audio")
        .map((rawClip) => {
          const clip = standaloneVideoAudioClipSchema.parse(rawClip);
          const source = videoSources[clip.content.assetId];
          if (!source)
            throw new Error(
              `Video audio asset ${clip.content.assetId} is unavailable. Relink it in Project Media.`,
            );
          const sourceStart = Math.round(
            clip.content.sourceStartSeconds * document.fps,
          );
          const end = sourceStart + clip.durationInFrames;
          if (
            clip.content.sourceStartSeconds +
              clip.durationInFrames / document.fps >
            clip.content.sourceDurationSeconds + 1 / document.fps
          )
            throw new Error(
              `Video audio clip ${clip.id} exceeds its registered MP4 source duration.`,
            );
          return (
            <Sequence
              key={clip.id}
              from={clip.from}
              durationInFrames={clip.durationInFrames}
              name={clip.label}
            >
              <SoundtrackAudio
                src={source}
                startFrom={sourceStart}
                endAt={end}
                volume={clip.props.volume}
              />
            </Sequence>
          );
        })}
    </>
  );
}
