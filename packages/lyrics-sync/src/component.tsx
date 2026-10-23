import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EditableComponent } from "@motion/sdk/editor";
import {
  fieldValue,
  type TimelineClip,
  type EditableField,
} from "@motion/sdk/timeline";
import {
  subtitleContentSchema,
  subtitleWordTimingMatchesText,
  subtitleTimelineBehavior,
} from "./subtitles";
export const subtitleFields: EditableField[] = [
  { key: "text", target: "content", label: "Text", type: "text", default: "" },
  {
    key: "presentation",
    target: "content",
    label: "Presentation",
    type: "select",
    default: "caption",
    options: ["caption", "bubble", "both", "hidden"],
  },
  {
    key: "fontFamily",
    target: "props",
    label: "Font",
    type: "select",
    default: "Arial",
    options: ["Arial", "Georgia", "Verdana", "Courier New"],
  },
  {
    key: "fontSize",
    target: "props",
    label: "Font size",
    type: "number",
    default: 68,
    min: 12,
    max: 220,
    step: 1,
  },
  {
    key: "color",
    target: "props",
    label: "Text color",
    type: "color",
    default: "#ffffff",
  },
  {
    key: "highlightColor",
    target: "props",
    label: "Highlight color",
    type: "color",
    default: "#c5f18a",
  },
  {
    key: "x",
    target: "props",
    label: "Position X (%)",
    type: "number",
    default: 50,
    min: 5,
    max: 95,
    step: 1,
  },
  {
    key: "y",
    target: "props",
    label: "Position Y (%)",
    type: "number",
    default: 82,
    min: 5,
    max: 95,
    step: 1,
  },
  {
    key: "width",
    target: "props",
    label: "Text box width (%)",
    type: "number",
    default: 88,
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
    key: "animation",
    target: "props",
    label: "Animation",
    type: "select",
    default: "none",
    options: ["none", "fade", "rise"],
  },
  {
    key: "animationFrames",
    target: "props",
    label: "Animation frames",
    type: "number",
    default: 12,
    min: 1,
    max: 120,
    step: 1,
  },
  {
    key: "karaoke",
    target: "props",
    label: "Karaoke highlighting",
    type: "boolean",
    default: true,
  },
];
export function Subtitles({ clip }: { clip: TimelineClip }) {
  const content = subtitleContentSchema.parse(clip.content);
  const presentation = content.presentation ?? "caption";
  if (presentation === "bubble" || presentation === "hidden") return null;
  return <SubtitleText clip={clip} content={content} />;
}

function SubtitleText({
  clip,
  content,
}: {
  clip: TimelineClip;
  content: ReturnType<typeof subtitleContentSchema.parse>;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Object.fromEntries(
    subtitleFields.map((f) => [f.key, fieldValue(clip, f)]),
  );
  const frames = Math.max(
    1,
    Math.min(Number(p.animationFrames), Math.floor(clip.durationInFrames / 2)),
  );
  const entrance = interpolate(frame, [0, frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [Math.max(0, clip.durationInFrames - frames), clip.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const visible = p.animation === "none" ? 1 : Math.min(entrance, exit);
  const words = content.words;
  const karaokeMatches = p.karaoke && subtitleWordTimingMatchesText(content);
  const anchorTransforms: Record<
    string,
    { translate: string; origin: string }
  > = {
    "top-left": { translate: "0 0", origin: "top left" },
    "top-center": { translate: "-50% 0", origin: "top center" },
    "top-right": { translate: "-100% 0", origin: "top right" },
    "middle-left": { translate: "0 -50%", origin: "center left" },
    center: { translate: "-50% -50%", origin: "center" },
    "middle-right": { translate: "-100% -50%", origin: "center right" },
    "bottom-left": { translate: "0 -100%", origin: "bottom left" },
    "bottom-center": { translate: "-50% -100%", origin: "bottom center" },
    "bottom-right": { translate: "-100% -100%", origin: "bottom right" },
  };
  const anchor = anchorTransforms[String(p.anchor)] ?? anchorTransforms.center;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        data-subtitle-id={clip.id}
        data-local-frame={frame}
        data-karaoke-matches={karaokeMatches}
        style={{
          position: "absolute",
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: `translate(${anchor.translate}) rotate(${Number(p.rotation)}deg) translateY(${p.animation === "rise" ? (1 - entrance) * 35 : 0}px)`,
          transformOrigin: anchor.origin,
          width: `${p.width}%`,
          height: `${p.height}%`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: String(p.fontFamily),
          fontSize: Number(p.fontSize),
          fontWeight: 700,
          lineHeight: 1.2,
          color: String(p.color),
          whiteSpace: "pre-wrap",
          textShadow: "0 3px 12px #000",
          opacity: visible,
        }}
      >
        {karaokeMatches
          ? words!.map((w, i) => (
              <span
                key={w.id}
                data-word={i}
                data-active={frame / fps >= w.start && frame / fps < w.end}
                style={{
                  color:
                    frame / fps >= w.start && frame / fps < w.end
                      ? String(p.highlightColor)
                      : String(p.color),
                }}
              >
                {w.text}
                {i < words!.length - 1 ? " " : ""}
              </span>
            ))
          : content.text}
      </div>
    </AbsoluteFill>
  );
}
export const subtitleModule: EditableComponent = {
  id: "subtitles",
  name: "Subtitles / Lyrics",
  fields: subtitleFields,
  timelineBehavior: subtitleTimelineBehavior.id,
  canvas: {
    owner: "lyrics-sync.subtitles",
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
    visibilityField: "presentation",
    visibleValues: ["caption", "both"],
  },
  component: Subtitles,
};
