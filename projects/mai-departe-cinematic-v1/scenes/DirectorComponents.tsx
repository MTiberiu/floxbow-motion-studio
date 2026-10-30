import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties } from "react";
import type { EditableComponent } from "@motion/sdk/editor";
import { fieldValue, type EditableField, type TimelineClip } from "@motion/sdk/timeline";
import { subtitleModule, subtitleFields } from "@motion/lyrics-sync/component";
import {
  splitSubtitleTextForKaraoke,
  subtitleContentSchema,
  subtitleWordTimingMatchesText,
} from "@motion/lyrics-sync/subtitles";
import guides from "../motion-guides.json";
import shotPlan from "../director-shot-plan.json";
import actorStanding from "../assets/actors/standing.png";
import actorWalking from "../assets/actors/walking.png";
import actorSeated from "../assets/actors/seated.png";
import actorClose from "../assets/actors/close.png";

const guide = guides as {
  fps: number;
  sampleStepSeconds: number;
  samples: Array<{ wordGravity: number; phraseEmotional: number; vocalProsody: number; vocalProsodyWithoutPitch: number; vocalRms: number; f0Quality: number }>;
  phraseContrasts: Array<{ cueId: string; wordId: string; orangeDurationScore: number; phraseContrastP: number }>;
};
const actors: Record<string, string> = {
  standing: actorStanding,
  walking: actorWalking,
  seated: actorSeated,
  close: actorClose,
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const numeric = (clip: TimelineClip, key: string, fallback: number) => {
  const value = clip.props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};
const text = (clip: TimelineClip, key: string, fallback: string) => {
  const value = clip.props[key];
  return typeof value === "string" ? value : fallback;
};
const propFields = (items: Array<Omit<EditableField, "target">>): EditableField[] =>
  items.map((field) => ({ ...field, target: "props" }));
function motionAt(seconds: number) {
  const index = clamp(Math.floor(seconds / guide.sampleStepSeconds), 0, guide.samples.length - 1);
  const next = Math.min(guide.samples.length - 1, index + 1);
  const fraction = clamp((seconds / guide.sampleStepSeconds) - index, 0, 1);
  const a = guide.samples[index];
  const b = guide.samples[next];
  const blend = (key: keyof typeof a) => a[key] + (b[key] - a[key]) * fraction;
  return {
    wordGravity: blend("wordGravity"),
    phraseEmotional: blend("phraseEmotional"),
    vocalProsody: blend("vocalProsody"),
    vocalProsodyWithoutPitch: blend("vocalProsodyWithoutPitch"),
    vocalRms: blend("vocalRms"),
    f0Quality: blend("f0Quality"),
  };
}

const stageFields = propFields([
  { key: "background", label: "Stage", type: "select", default: "white", options: ["white", "dark"] },
]);
function DirectorPlate({ clip }: { clip: TimelineClip }) {
  const background = text(clip, "background", "white");
  return <AbsoluteFill data-director-stage={clip.id} style={{ background: background === "dark" ? "#17191e" : "#ffffff", overflow: "hidden" }} />;
}
export const directorPlateModule: EditableComponent = { id: "director-plate", name: "Director · Clean stage", fields: stageFields, component: DirectorPlate };

const actorFields = propFields([
  { key: "pose", label: "Pose", type: "select", default: "standing", options: Object.keys(actors) },
  { key: "x", label: "X (%)", type: "number", default: 50, min: 0, max: 100, step: 0.5 },
  { key: "y", label: "Y (%)", type: "number", default: 99, min: 0, max: 100, step: 0.5 },
  { key: "width", label: "Width (%)", type: "number", default: 43, min: 5, max: 100, step: 1 },
  { key: "height", label: "Height (%)", type: "number", default: 88, min: 5, max: 100, step: 1 },
  { key: "rotation", label: "Rotation (°)", type: "number", default: 0, min: -20, max: 20, step: 0.5 },
  { key: "anchor", label: "Anchor", type: "select", default: "bottom-center", options: ["center", "bottom-center", "middle-left", "middle-right"] },
  { key: "opacity", label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01 },
  { key: "motion", label: "Motion guide", type: "select", default: "phrase-emotional", options: ["none", "word-gravity", "phrase-emotional", "vocal-prosody", "combined"] },
  { key: "motionGain", label: "Motion strength", type: "number", default: 0.35, min: 0, max: 1.5, step: 0.05 },
]);
const anchorOffsets: Record<string, string> = { center: "-50%, -50%", "bottom-center": "-50%, -100%", "middle-left": "0, -50%", "middle-right": "-100%, -50%" };
function DirectorActor({ clip, frame = 0 }: { clip: TimelineClip; frame?: number }) {
  const { fps } = useVideoConfig();
  const time = (clip.from + frame) / fps;
  const signals = motionAt(time);
  const mode = text(clip, "motion", "none");
  const gain = numeric(clip, "motionGain", 0.3);
  const gravity = mode === "word-gravity" || mode === "combined" ? signals.wordGravity : 0;
  const phrase = mode === "phrase-emotional" || mode === "combined" ? signals.phraseEmotional : 0;
  const prosody = mode === "vocal-prosody" || mode === "combined" ? signals.vocalProsody : 0;
  const rms = mode === "vocal-prosody" || mode === "combined" ? signals.vocalRms : 0;
  const x = numeric(clip, "x", 50);
  const y = numeric(clip, "y", 99);
  const width = numeric(clip, "width", 43);
  const height = numeric(clip, "height", 88);
  const rotation = numeric(clip, "rotation", 0);
  const anchor = text(clip, "anchor", "bottom-center");
  const entrance = interpolate(frame, [0, Math.min(18, clip.durationInFrames / 3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [Math.max(0, clip.durationInFrames - 16), clip.durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = -gravity * gain * 1.1 - phrase * gain * 1.4 - prosody * gain * 1.25;
  const nudge = phrase * gain * 0.65;
  const scale = 1 + clamp(Math.abs(gravity) * gain * 0.001 + Math.abs(prosody) * gain * 0.0008, 0, 0.012);
  const style: CSSProperties = {
    position: "absolute", left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`,
    transform: `translate(${anchorOffsets[anchor] ?? anchorOffsets["bottom-center"]}) translate(${nudge}px, ${lift}px) rotate(${rotation}deg) scale(${scale})`,
    transformOrigin: "center bottom", objectFit: "contain", objectPosition: "center bottom", opacity: entrance * exit * numeric(clip, "opacity", 1),
    filter: `drop-shadow(0 18px 30px rgba(31,35,42,${0.12 + Math.min(0.10, rms * gain * 0.08)}))`,
  };
  return <Img data-director-actor={clip.id} src={actors[text(clip, "pose", "standing")]} style={style} />;
}
export const directorActorModule: EditableComponent = {
  id: "director-actor", name: "Director · Protagonist", fields: actorFields,
  canvas: {
    owner: "project.director-actor", coordinateSpace: "composition-percent",
    transform: { x: "x", y: "y", width: "width", height: "height", rotation: "rotation", anchor: "anchor" },
    operations: { move: true, resize: true, rotate: true }, resizeMode: "preserve-aspect", resizeScaleFields: ["width", "height"],
  },
  component: DirectorActor,
};

type AccentEvent = { time: number; intensity: number; category: string; source: string };
const effectFields = propFields([
  { key: "movement", label: "Audio motion source", type: "select", default: "combined", options: ["word-gravity", "phrase-emotional", "vocal-prosody", "combined"] },
  { key: "tone", label: "Story tone", type: "select", default: "neutral", options: ["cool", "neutral", "warm", "quiet"] },
  { key: "strength", label: "Curve response", type: "number", default: 0.25, min: 0, max: 1, step: 0.01 },
]);
function DirectorAccent({ clip, frame = 0 }: { clip: TimelineClip; frame?: number }) {
  const { fps } = useVideoConfig();
  const time = (clip.from + frame) / fps;
  const signals = motionAt(time);
  const events = Array.isArray(clip.props.accentEvents) ? clip.props.accentEvents as AccentEvent[] : [];
  let pulse = 0;
  for (const event of events) {
    const distance = Math.abs(time - event.time);
    const response = Math.exp(-distance * (event.category === "section_change" ? 5 : 9));
    pulse = Math.max(pulse, response * clamp(event.intensity + (event.category === "section_change" ? 0.3 : 0), 0, 1));
  }
  const rmsPulse = clamp(signals.vocalRms, 0, 1);
  const strength = numeric(clip, "strength", 0.25);
  const movement = text(clip, "movement", "combined");
  const gravity = movement === "word-gravity" || movement === "combined" ? signals.wordGravity : 0;
  const phrase = movement === "phrase-emotional" || movement === "combined" ? signals.phraseEmotional : 0;
  const prosody = movement === "vocal-prosody" || movement === "combined" ? signals.vocalProsody : 0;
  const contour = clamp(gravity * 0.2 + phrase * 0.35 + prosody * 0.25, -1, 1);
  const intensity = clamp(strength * (0.08 + rmsPulse * 0.3 + pulse * 0.52 + Math.abs(contour) * 0.12), 0, 0.5);
  const progress = clamp(frame / Math.max(1, clip.durationInFrames), 0, 1);
  const dark = text(clip, "backgroundMode", "white") === "dark";
  const tone = text(clip, "tone", "neutral");
  const toneColor: Record<string, string> = { cool: "#7f91a8", neutral: "#8e9293", warm: "#e96c49", quiet: "#c5a36c" };
  const stroke = dark ? "#f0a06d" : toneColor[tone] ?? toneColor.neutral;
  const center = 465 + contour * 56;
  const amplitude = 10 + rmsPulse * 24 + Math.abs(contour) * 22 + pulse * 18;
  const d = `M 250 ${center} C 520 ${center - amplitude}, 680 ${center + amplitude}, 960 ${center + contour * 24} S 1400 ${center - amplitude * 0.7}, 1680 ${center + amplitude * 0.45}`;
  const secondary = `M 360 ${center + 48} C 620 ${center + 48 + amplitude * 0.42}, 840 ${center + 48 - amplitude * 0.48}, 1090 ${center + 48 + contour * 18} S 1450 ${center + 48 + amplitude * 0.3}, 1620 ${center + 48 - amplitude * 0.2}`;
  const entrance = interpolate(frame, [0, Math.min(14, clip.durationInFrames / 3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const offset = 1600 * (1 - progress);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeDasharray="1600" strokeDashoffset={offset} opacity={intensity * entrance} />
        <path d={secondary} fill="none" stroke={dark ? "rgba(255,255,255,.65)" : "rgba(30,34,38,.62)"} strokeWidth={1} strokeLinecap="round" strokeDasharray="1320" strokeDashoffset={1320 * (1 - progress)} opacity={intensity * 0.62 * entrance} />
        <circle cx={250 + progress * 1430} cy={center + contour * 24} r={2 + pulse * 3} fill={stroke} opacity={clamp(intensity * 1.4, 0, 0.6) * entrance} />
      </svg>
    </AbsoluteFill>
  );
}
export const directorAccentModule: EditableComponent = { id: "director-accent", name: "Director · Music accents and light", fields: effectFields, component: DirectorAccent };

const paperFields = propFields([
  { key: "count", label: "Falling bills", type: "number", default: 8, min: 1, max: 16, step: 1 },
  { key: "landingY", label: "Table height", type: "number", default: 680, min: 420, max: 850, step: 5 },
  { key: "fallDuration", label: "Fall duration (s)", type: "number", default: 0.9, min: 0.35, max: 2, step: 0.05 },
]);
function DirectorPaperFall({ clip, frame = 0 }: { clip: TimelineClip; frame?: number }) {
  const { fps } = useVideoConfig();
  const time = (clip.from + frame) / fps;
  const signals = motionAt(time);
  const count = Math.round(numeric(clip, "count", 8));
  const landingY = numeric(clip, "landingY", 680);
  const fallDuration = numeric(clip, "fallDuration", 0.9);
  const events = Array.isArray(clip.props.musicEvents) ? clip.props.musicEvents as AccentEvent[] : [];
  const eventFor = (index: number) => events[index] ?? { time: clip.from / fps + index * 0.22, intensity: 0.3, category: "phrase-timed-design", source: "art-direction fallback" };
  const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={`M 790 ${landingY} L 1625 ${landingY} M 850 ${landingY} L 850 ${landingY + 126} M 1565 ${landingY} L 1565 ${landingY + 126} M 850 ${landingY + 126} L 1565 ${landingY + 126}`} fill="none" stroke="#cbc8c1" strokeWidth="2" opacity="0.68" />
        <line x1="790" y1={landingY + 5} x2="1625" y2={landingY + 5} stroke="#e96c49" strokeWidth="1" opacity={0.12 + signals.vocalRms * 0.2} />
        {Array.from({ length: count }, (_, index) => {
          const event = eventFor(index);
          const seed = (index * 37 % 17) / 17;
          const elapsed = time - event.time;
          if (elapsed < 0) return null;
          const duration = Math.max(0.35, fallDuration * (1.12 - Math.min(0.25, (event.intensity ?? 0) * 0.18)));
          const progress = clamp(elapsed / duration, 0, 1);
          const eased = easeOut(progress);
          const targetX = 970 + (index % 4) * 128 + Math.sin(index * 2.3) * 32;
          const startX = targetX + Math.sin(index * 3.7) * 210;
          const stackLevel = Math.floor(index / 4);
          const targetY = landingY - 160 - stackLevel * 5;
          const sway = Math.sin(elapsed * 5.2 + index * 1.8) * 48 * (1 - eased) * (0.65 + signals.vocalRms * 0.35);
          const x = startX + (targetX - startX) * eased + sway;
          const y = -180 + (targetY + 180) * eased;
          const rotation = (seed - 0.5) * 64 * (1 - eased) + (index % 3 - 1) * 2;
          const flutter = 0.83 + Math.abs(Math.sin(elapsed * 7 + index)) * 0.17 * (1 - eased);
          const width = 112 + seed * 20;
          const height = 154 + (1 - seed) * 16;
          return (
            <g key={index} transform={`translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2}) scale(${flutter} 1)`} opacity={progress < 1 ? 0.9 : 0.86}>
              <rect width={width} height={height} rx="2" fill="#fcfbf8" stroke="#c9c5bd" strokeWidth="2" />
              <path d={`M 14 25 H ${width - 14} M 14 39 H ${width - 30} M 14 56 H ${width - 14} M 14 70 H ${width - 18} M 14 94 H ${width - 14} M 14 109 H ${width - 34} M 14 130 H ${width - 14}`} stroke="#a7a39b" strokeWidth="2" opacity="0.58" />
              <rect x={width - 38} y={height - 29} width="24" height="12" fill="#e96c49" opacity={0.24 + signals.vocalRms * 0.34} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}
export const directorPaperFallModule: EditableComponent = { id: "director-paper-fall", name: "Director · Bills fall on accents", fields: paperFields, component: DirectorPaperFall };

function DirectorLyrics({ clip, frame = 0 }: { clip: TimelineClip; frame?: number }) {
  const { fps } = useVideoConfig();
  const content = subtitleContentSchema.parse(clip.content);
  const presentation = content.presentation ?? "caption";
  if (presentation === "hidden" || presentation === "bubble") return null;
  const props = Object.fromEntries(subtitleFields.map((field) => [field.key, fieldValue(clip, field)]));
  const localTime = frame / fps;
  const globalTime = (clip.from + frame) / fps;
  const currentScene = (shotPlan as { scenes: Array<{ start: number; end: number; background: string }> }).scenes.find((scene) => globalTime >= scene.start && globalTime < scene.end);
  const darkStage = currentScene?.background === "dark";
  const words = content.words ?? [];
  const karaoke = Boolean(props.karaoke) && subtitleWordTimingMatchesText(content);
  const parts = karaoke ? splitSubtitleTextForKaraoke(content.text) : [];
  const baseColor = darkStage ? "#fbfaf7" : "#17191c";
  const activeColor = String(props.highlightColor || "#ef6847");
  const futureColor = darkStage ? "#aeb0b4" : "#a9a9a6";
  const textLength = content.text.length;
  const dynamicSize = clamp(61 - Math.max(0, textLength - 24) * 0.7, 38, 61);
  const color = textLength > 46 ? baseColor : String(props.color || baseColor);
  const lineStyle: CSSProperties = {
    position: "absolute", left: "7%", top: "76%", width: "86%", height: "16%",
    display: "flex", justifyContent: String(props.alignment || "center") === "left" ? "flex-start" : String(props.alignment || "center") === "right" ? "flex-end" : "center",
    alignItems: "center", textAlign: String(props.alignment || "center") as CSSProperties["textAlign"],
    fontFamily: "Arial, Helvetica, sans-serif", fontSize: dynamicSize, fontWeight: 800,
    lineHeight: 1.1, letterSpacing: "-0.045em", whiteSpace: "pre-wrap", overflow: "visible",
    color, opacity: Number(props.opacity ?? 1),
  };
  const gravityByWord = new Map(guide.phraseContrasts.filter((item) => item.cueId === clip.id).map((item) => [item.wordId, item]));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div data-director-lyrics={clip.id} style={lineStyle}>
        {karaoke ? parts.map((part) => {
          if (part.kind === "space") return <span key={`space-${part.index}`} style={{ whiteSpace: "pre" }}>{part.text}</span>;
          const word = words[part.index];
          if (!word) return null;
          const active = localTime >= word.start && localTime < word.end;
          const wasSung = localTime >= word.end;
          const entrance = clamp((localTime - word.start) / 0.09, 0, 1);
          const release = clamp((word.end - localTime) / 0.09, 0, 1);
          const ease = (value: number) => value * value * (3 - 2 * value);
          const lift = active ? 7 * Math.min(ease(entrance), ease(release)) : 0;
          const timing = gravityByWord.get(word.id);
          const contrastScale = timing ? clamp(1 + timing.phraseContrastP * 0.008, 0.975, 1.025) : 1;
          const wordStyle: CSSProperties = {
            display: "inline-block", color: active ? activeColor : wasSung ? baseColor : futureColor,
            transform: `translateY(${-lift}px) scaleX(${contrastScale})`, transformOrigin: "center bottom",
            marginInlineEnd: "0.18em", whiteSpace: "pre",
          };
          return <span key={word.id} data-word-id={word.id} data-active={active} style={wordStyle}>{part.text}</span>;
        }) : <span style={{ color: baseColor }}>{content.text}</span>}
      </div>
    </AbsoluteFill>
  );
}
export const directorLyricsModule: EditableComponent = { ...subtitleModule, name: "Director · Kinetic lyrics", component: DirectorLyrics };

