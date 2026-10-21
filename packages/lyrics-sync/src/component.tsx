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
} from "./subtitles";
export const subtitleFields: EditableField[] = [
  { key: "text", target: "content", label: "Text", type: "text", default: "" },
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
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const content = subtitleContentSchema.parse(clip.content);
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
          transform: `translate(-50%,-50%) translateY(${p.animation === "rise" ? (1 - entrance) * 35 : 0}px)`,
          width: "88%",
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
  component: Subtitles,
};
