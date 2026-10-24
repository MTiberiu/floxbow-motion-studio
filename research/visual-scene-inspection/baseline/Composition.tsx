import {
  AbsoluteFill,
  Canvas,
  Fade,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "@motion/sdk";
import { ComicPop, KineticText } from "@motion/animations";
import {
  TimelineComposition,
  type EditableComponent,
  type EditableVideoProps,
} from "@motion/sdk/editor";
import {
  fieldValue,
  parseEditTimeline,
  type TimelineClip,
} from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import { internetMessageModule } from "./InternetMessageScene";
import savedTimeline from "./edit-timeline.json";
import projectManifest from "./project.json";
import curiosity from "./assets/scene-01.png";
import firstPrompt from "./assets/scene-02.png";
import firstResult from "./assets/scene-03.png";
import tinyFix from "./assets/scene-04.png";
import cascade from "./assets/scene-05.png";
import storyboard from "./assets/scene-06.png";
import editorBuild from "./assets/scene-07.png";
import dawnFinish from "./assets/scene-08.png";
import openingRoomCleanplate from "./assets/opening-room-cleanplate.png";
import openingRoomScreenOff from "./assets/opening-room-screen-off.png";
import openingCreatorChair from "./assets/opening-creator-chair-cutout.png";
import openingCreatorTyping from "./assets/opening-creator-typing-cutout.png";
import dragonMascot from "./assets/dragon-mascot.png";
import thumbnailOnePrompt from "./assets/thumbnail-one-prompt.png";
import thumbnailNoEdit from "./assets/thumbnail-no-edit.png";
import thumbnailWholeFilm from "./assets/thumbnail-whole-film.png";
import thumbnailDragon from "./assets/thumbnail-dragon.png";

const images: Record<string, string> = {
  curiosity,
  firstPrompt,
  firstResult,
  tinyFix,
  cascade,
  storyboard,
  editorBuild,
  dawnFinish,
  openingRoomOff: openingRoomScreenOff,
  openingCreator: openingCreatorChair,
  openingCreatorTyping,
  thumbnailOnePrompt,
  thumbnailNoEdit,
  thumbnailWholeFilm,
  thumbnailDragon,
};

function textValue(clip: TimelineClip, key: string, fallback = "") {
  const value = fieldValue(clip, {
    key,
    target: "content",
    label: key,
    type: "text",
    default: fallback,
  });
  return typeof value === "string" ? value : fallback;
}

function numberValue(clip: TimelineClip, key: string, fallback: number) {
  const value = fieldValue(clip, {
    key,
    target: "props",
    label: key,
    type: "number",
    default: fallback,
  });
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function StoryImage({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const imageId = textValue(clip, "imageId", "curiosity");
  const image = images[imageId] ?? curiosity;
  const zoomStart = numberValue(clip, "zoomStart", 1.02);
  const zoomEnd = numberValue(clip, "zoomEnd", 1.1);
  const panDistance = numberValue(clip, "panDistance", 28);
  const panDirection = textValue(clip, "panDirection", "right");
  const cameraMove = String(fieldValue(clip, {
    key: "cameraMove", target: "props", label: "Camera move", type: "select",
    default: "push", options: ["push", "pull", "pan-left", "pan-right", "hold"],
  }));
  const fadeFrames = numberValue(clip, "fadeFrames", 20);
  const chaos = numberValue(clip, "chaos", 0);
  const progress = interpolate(frame, [0, clip.durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = progress * progress * (3 - 2 * progress);
  const panSign = cameraMove === "pan-left" ? 1 : cameraMove === "pan-right" ? -1 :
    panDirection === "left" ? -1 : panDirection === "right" ? 1 : 0;
  const zoom = cameraMove === "push"
    ? interpolate(eased, [0, 1], [zoomStart, zoomEnd])
    : cameraMove === "pull"
      ? interpolate(eased, [0, 1], [zoomEnd, zoomStart])
      : zoomStart;
  const panX = cameraMove === "pan-left" || cameraMove === "pan-right"
    ? interpolate(eased, [0, 1], [-panSign * panDistance / 2, panSign * panDistance / 2])
    : 0;
  const chaosEnvelope = chaos > 0 ? interpolate(
    frame,
    [0, clip.durationInFrames * 0.22, clip.durationInFrames * 0.38, clip.durationInFrames * 0.76, clip.durationInFrames * 0.9, clip.durationInFrames],
    [0, 0, 1, 1, 0, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  ) : 0;
  const shakeX = Math.sin(frame * 2.7) * chaos * chaosEnvelope;
  const shakeY = Math.cos(frame * 3.1) * chaos * chaosEnvelope * 0.55;
  const focusPoints: Record<string, string> = {
    firstPrompt: "67,31 88,29 89,52 67,54",
    firstResult: "68,30 88,29 89,52 68,53",
    tinyFix: "66,28 90,26 91,55 66,57",
    cascade: "67,31 89,29 90,54 67,56",
    editorBuild: "57,31 88,27 89,58 58,62",
  };
  const focusOpacity = interpolate(progress, [0.12, 0.23, 0.76, 0.9], [0, 0.9, 0.9, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <Fade frames={fadeFrames}>
      <AbsoluteFill style={{ overflow: "hidden", background: "#101722" }}>
        <Img
          src={imageId === "curiosity" ? openingRoomCleanplate : image}
          alt={textValue(clip, "alt", "A moment in the making of a video editor")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translate3d(${panX + shakeX}px,${shakeY}px,0) scale(${zoom})`,
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(90deg,rgba(7,12,20,.34),rgba(7,12,20,.02) 68%),linear-gradient(0deg,rgba(5,9,15,.72),transparent 56%),linear-gradient(180deg,rgba(5,9,15,.23),transparent 36%),radial-gradient(ellipse at 52% 46%,transparent 44%,rgba(5,9,15,.2) 100%)",
          }}
        />
        {focusPoints[imageId] ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: focusOpacity, pointerEvents: "none" }} aria-hidden="true">
            <polygon points={focusPoints[imageId]} fill="rgba(114,226,255,.045)" stroke="rgba(141,235,255,.84)" strokeWidth=".18" vectorEffect="non-scaling-stroke" />
            <polyline points={focusPoints[imageId]} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".08" strokeDasharray="1 1.4" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {chaos > 3 && Math.sin(frame * 1.9) > 0.72 ? (
          <AbsoluteFill style={{ background: "rgba(255,35,65,.13)", mixBlendMode: "screen" }} />
        ) : null}
      </AbsoluteFill>
    </Fade>
  );
}

function StoryTitle({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const motion = textValue(clip, "motion", "kinetic");
  const text = textValue(clip, "text", "A story in progress");
  const size = numberValue(clip, "size", 72);
  const visibleFrames = numberValue(clip, "visibleFrames", 140);
  const x = numberValue(clip, "x", 7);
  const y = numberValue(clip, "y", 9);
  const fadeFrames = numberValue(clip, "fadeFrames", 12);
  const color = String(fieldValue(clip, {
    key: "color",
    target: "props",
    label: "Text color",
    type: "color",
    default: "#fff7ea",
  }));
  const accent = String(fieldValue(clip, {
    key: "accentColor",
    target: "props",
    label: "Accent color",
    type: "color",
    default: "#d3b58f",
  }));
  const titleOpacity = interpolate(
    frame,
    [Math.max(0, visibleFrames - fadeFrames), visibleFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <Fade frames={fadeFrames}>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            maxWidth: "84%",
            opacity: titleOpacity,
            color,
            textShadow: "0 3px 24px rgba(0,0,0,.5)",
          }}
        >
          <div
            style={{
              width: 58,
              height: 4,
              marginBottom: 19,
              background: accent,
              boxShadow: `0 0 22px ${accent}`,
            }}
          />
          {motion === "pop" ? (
            <ComicPop text={text} color={accent} />
          ) : (
            <KineticText text={text} size={size} color={color} />
          )}
        </div>
      </AbsoluteFill>
    </Fade>
  );
}

function SceneObject({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const assetId = textValue(clip, "assetId", "openingCreator");
  const source = images[assetId];
  if (!source) return null;
  const offsetX = numberValue(clip, "offsetX", 0);
  const offsetY = numberValue(clip, "offsetY", 0);
  const scale = numberValue(clip, "scale", 1);
  const breathing = numberValue(clip, "breathing", 1.2);
  const period = Math.max(1, numberValue(clip, "breathingPeriod", 90));
  const entranceFrames = Math.max(0, numberValue(clip, "entranceFrames", 22));
  const entrance = entranceFrames === 0 ? 1 : interpolate(frame, [0, entranceFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ease = entrance * entrance * (3 - 2 * entrance);
  const breath = Math.sin((frame / period) * Math.PI * 2) * breathing / 10;
  const entranceX = numberValue(clip, "entranceX", -12);
  const entranceY = numberValue(clip, "entranceY", 1.2);
  const fadeInFrames = Math.max(0, numberValue(clip, "fadeInFrames", 0));
  const fadeOutFrames = Math.max(0, numberValue(clip, "fadeOutFrames", 0));
  const fadeIn = fadeInFrames === 0 ? 1 : interpolate(frame, [0, fadeInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = fadeOutFrames === 0 ? 1 : interpolate(frame, [
    Math.max(0, clip.durationInFrames - fadeOutFrames), clip.durationInFrames,
  ], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Img
      src={source}
      alt={textValue(clip, "alt", "A foreground scene object")}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: Math.min(ease, fadeIn, fadeOut),
        transform: `translate3d(${offsetX + entranceX * (1 - ease)}%,${offsetY + entranceY * (1 - ease) + breath}%,0) scale(${0.97 + (scale - 0.97) * ease})`,
        transformOrigin: "center bottom",
        pointerEvents: "none",
      }}
    />
  );
}

function SceneGlow({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const x = numberValue(clip, "x", 69.4);
  const y = numberValue(clip, "y", 43.5);
  const width = numberValue(clip, "width", 17.2);
  const height = numberValue(clip, "height", 20);
  const intensity = numberValue(clip, "intensity", 0.12);
  const fadeInFrames = Math.max(0, numberValue(clip, "fadeInFrames", 18));
  const fadeOutFrames = Math.max(0, numberValue(clip, "fadeOutFrames", 12));
  const fadeIn = fadeInFrames === 0 ? 1 : interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = fadeOutFrames === 0 ? 1 : interpolate(frame, [
    Math.max(0, clip.durationInFrames - fadeOutFrames), clip.durationInFrames,
  ], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = intensity * Math.min(fadeIn, fadeOut) * (0.72 + (Math.sin(frame / 22) + 1) * 0.14);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        borderRadius: "2%",
        background: `radial-gradient(ellipse at 52% 55%,rgba(98,211,255,${pulse}),transparent 72%)`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
}

const sceneObjectModule: EditableComponent = {
  id: "scene-object",
  name: "Scene object · PNG layer",
  component: SceneObject,
  fields: [
    { key: "assetId", target: "content", label: "PNG object", type: "select", default: "openingCreator", options: ["openingCreator"] },
    { key: "alt", target: "content", label: "Object description", type: "text", default: "The creator seated at her editing desk" },
    { key: "offsetX", target: "props", label: "Horizontal offset (%)", type: "number", default: 0, min: -20, max: 20 },
    { key: "offsetY", target: "props", label: "Vertical offset (%)", type: "number", default: 0, min: -20, max: 20 },
    { key: "scale", target: "props", label: "Layer scale", type: "number", default: 1, min: 0.5, max: 1.5 },
    { key: "breathing", target: "props", label: "Subtle movement", type: "number", default: 1.2, min: 0, max: 8 },
    { key: "breathingPeriod", target: "props", label: "Movement cycle (frames)", type: "number", default: 90, min: 1, max: 300 },
    { key: "entranceFrames", target: "props", label: "Entrance duration (frames)", type: "number", default: 22, min: 0, max: 120 },
    { key: "entranceX", target: "props", label: "Entrance X (%)", type: "number", default: -12, min: -40, max: 40 },
    { key: "entranceY", target: "props", label: "Entrance Y (%)", type: "number", default: 1.2, min: -20, max: 20 },
    { key: "fadeInFrames", target: "props", label: "Fade in (frames)", type: "number", default: 0, min: 0, max: 120 },
    { key: "fadeOutFrames", target: "props", label: "Fade out (frames)", type: "number", default: 0, min: 0, max: 120 },
  ],
};

const sceneGlowModule: EditableComponent = {
  id: "scene-glow",
  name: "Scene light · screen glow",
  component: SceneGlow,
  fields: [
    { key: "x", target: "props", label: "Horizontal position (%)", type: "number", default: 69.4, min: 0, max: 100 },
    { key: "y", target: "props", label: "Vertical position (%)", type: "number", default: 43.5, min: 0, max: 100 },
    { key: "width", target: "props", label: "Width (%)", type: "number", default: 17.2, min: 0, max: 100 },
    { key: "height", target: "props", label: "Height (%)", type: "number", default: 20, min: 0, max: 100 },
    { key: "intensity", target: "props", label: "Light intensity", type: "number", default: 0.12, min: 0, max: 0.5 },
    { key: "fadeInFrames", target: "props", label: "Fade in (frames)", type: "number", default: 18, min: 0, max: 120 },
    { key: "fadeOutFrames", target: "props", label: "Fade out (frames)", type: "number", default: 12, min: 0, max: 120 },
  ],
};

const storyImageModule: EditableComponent = {
  id: "story-image",
  name: "Story image",
  fields: [
    {
      key: "imageId",
      target: "content",
      label: "Image",
      type: "select",
      default: "curiosity",
      options: [
        "curiosity",
        "firstPrompt",
        "firstResult",
        "tinyFix",
        "cascade",
        "storyboard",
        "editorBuild",
        "dawnFinish",
      ],
    },
    {
      key: "alt",
      target: "content",
      label: "Image description",
      type: "text",
      default: "A creator works on a video project",
    },
    {
      key: "zoomStart",
      target: "props",
      label: "Zoom at start",
      type: "number",
      default: 1.02,
      min: 1,
      max: 1.2,
      step: 0.005,
    },
    {
      key: "zoomEnd",
      target: "props",
      label: "Zoom at end",
      type: "number",
      default: 1.1,
      min: 1,
      max: 1.25,
      step: 0.005,
    },
    {
      key: "panDirection",
      target: "props",
      label: "Pan direction",
      type: "select",
      default: "right",
      options: ["left", "right", "none"],
    },
    {
      key: "cameraMove",
      target: "props",
      label: "Camera move",
      type: "select",
      default: "push",
      options: ["push", "pull", "pan-left", "pan-right", "hold"],
    },
    {
      key: "panDistance",
      target: "props",
      label: "Pan distance (px)",
      type: "number",
      default: 28,
      min: 0,
      max: 120,
      step: 1,
    },
    {
      key: "fadeFrames",
      target: "props",
      label: "Fade frames",
      type: "number",
      default: 20,
      min: 1,
      max: 60,
      step: 1,
    },
    {
      key: "chaos",
      target: "props",
      label: "Camera frenzy",
      type: "number",
      default: 0,
      min: 0,
      max: 18,
      step: 1,
    },
  ],
  component: StoryImage,
};

function FakeChat({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const message = textValue(clip, "message", "Change the item to red.");
  const speaker = textValue(clip, "speaker", "YOU");
  const side = textValue(clip, "side", "right");
  const isOpeningPrompt = clip.id === "story-chat-01";
  const isOpeningReply = clip.id === "story-chat-02";
  if (isOpeningPrompt || isOpeningReply) {
    const priorMessage = isOpeningReply
      ? textValue(clip, "previousMessage", "Make me a video.")
      : message;
    const replyReveal = Math.min(message.length, Math.floor(Math.max(0, frame - 7) * 0.8));
    const alpha = interpolate(frame, [0, 8, Math.max(9, clip.durationInFrames - 8), clip.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const card = (label: string, text: string, top: string, accent: string, textOpacity = 1) => <div style={{ position: "absolute", top, left: "50%", width: "min(900px, 76vw)", padding: "20px 26px", borderRadius: 20, color: "#f7f8ff", background: "rgba(16,25,42,.97)", border: `2px solid ${accent}`, boxShadow: `0 0 36px ${accent}44`, opacity: alpha * textOpacity, transform: "translateX(-50%)", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 850, letterSpacing: 2, color: accent }}><span>{label}</span><span>● LIVE</span></div>
      <div style={{ marginTop: 12, fontSize: 34, lineHeight: 1.15, fontWeight: 700 }}>{text}</div>
    </div>;
    return <AbsoluteFill style={{ pointerEvents: "none" }}>
      {isOpeningReply ? <>
        {card("AI", `${message.slice(0, replyReveal)}${replyReveal < message.length ? "▌" : ""}`, "31%", "#aaa0ff")}
        {card("YOU", priorMessage, "52%", "#ff7387")}
      </> : card("YOU", message, "43%", "#ff7387")}
    </AbsoluteFill>;
  }
  const isAI = speaker === "AI";
  const reveal = Math.min(message.length, Math.floor(frame * 0.8) + 1);
  const pulse = 1 + Math.max(0, Math.sin(frame * 0.7)) * numberValue(clip, "pulse", 0.035);
  const alpha = interpolate(frame, [0, 7, Math.max(8, clip.durationInFrames - 7), clip.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slide = interpolate(frame, [0, 7], [side === "left" ? -42 : 42, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute", top: "12%", [side === "left" ? "left" : "right"]: "6%",
        width: "min(620px, 42vw)", padding: "22px 26px", borderRadius: 22,
        color: "#f7f8ff", background: isAI ? "rgba(16,25,42,.94)" : "rgba(31,37,54,.94)",
        border: `2px solid ${isAI ? "#8f7dff" : "#ff5470"}`,
        boxShadow: `0 0 40px ${isAI ? "rgba(143,125,255,.38)" : "rgba(255,55,85,.35)"}`,
        opacity: alpha,
        transform: `translateX(${slide}px) rotate(${Math.sin(frame * 0.43) * 1.1}deg) scale(${pulse})`,
        fontFamily: "Arial, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: 800, letterSpacing: 2, color: isAI ? "#aaa0ff" : "#ff7387" }}>
          <span>{isAI ? "FLOXBOW AI" : "CREATOR"}</span><span>● LIVE</span>
        </div>
        <div style={{ marginTop: 15, fontSize: 31, lineHeight: 1.16, fontWeight: 650, minHeight: 74 }}>
          {message.slice(0, reveal)}{reveal < message.length ? <span style={{ color: "#ff5470" }}>▌</span> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function EditorBeat({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const mode = textValue(clip, "mode", "red-title");
  const title = textValue(clip, "title", "THE CASCADE");
  const message = textValue(clip, "message", "Change the title to red.");
  const speaker = textValue(clip, "speaker", "YOU");
  const exitEffect = textValue(clip, "exitEffect", "none");
  const shake = numberValue(clip, "shake", 0);
  const x = Math.sin(frame * 2.9) * shake;
  const y = Math.cos(frame * 2.4) * shake * 0.45;
  const wrongTarget = mode === "wrong-target";
  const allRed = wrongTarget || mode === "chaos";
  const flash = mode === "chaos" && Math.sin(frame * 2.1) > 0.68;
  const burnProgress = exitEffect === "burn"
    ? interpolate(frame, [clip.durationInFrames - 30, clip.durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const revealedMessage = message.slice(0, Math.floor(frame * 0.8) + 1);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", alignItems: "center", justifyContent: "center", background: flash ? "rgba(255,20,45,.2)" : "transparent" }}>
      {burnProgress > 0 ? <>
        <div style={{ position: "absolute", zIndex: 2, left: "12%", right: "12%", top: "15%", height: "70%", borderRadius: 18, opacity: burnProgress, background: `linear-gradient(0deg, rgba(15,5,2,${0.9 * burnProgress}) 0%, rgba(171,37,8,${0.55 * burnProgress}) 15%, rgba(255,91,15,${0.18 * burnProgress}) 35%, transparent 68%)`, boxShadow: `0 0 ${16 + burnProgress * 48}px rgba(255,76,12,${0.75 * burnProgress}), inset 0 0 ${8 + burnProgress * 28}px rgba(255,111,25,${0.65 * burnProgress})`, mixBlendMode: "screen" }} />
        {Array.from({ length: 15 }, (_, index) => {
          const flicker = 11 + Math.sin(frame * 0.9 + index * 1.7) * 4;
          const sway = Math.sin(frame * 0.55 + index * 2.1) * 5;
          return <div key={`flame-${index}`} style={{ position: "absolute", zIndex: 3, left: `${12 + index * 5.4}%`, bottom: "13%", width: `${5 + (index % 3)}%`, height: `${flicker}%`, opacity: burnProgress, borderRadius: "55% 48% 20% 18%", transformOrigin: "50% 100%", transform: `translateX(${sway}px) rotate(${Math.sin(frame * 0.7 + index) * 9}deg)`, background: "radial-gradient(ellipse at 50% 92%, #fffbd1 0%, #ffe052 19%, #ff902b 43%, #f23813 66%, rgba(167,20,9,.65) 78%, transparent 82%)", filter: "blur(1px)", mixBlendMode: "screen" }} />;
        })}
        {Array.from({ length: 7 }, (_, index) => {
          const travel = ((frame - (clip.durationInFrames - 30)) * (1.8 + (index % 3) * 0.3)) % 65;
          const sway = Math.sin(frame * 0.7 + index * 2.4) * 24;
          return <div key={`ember-${index}`} style={{ position: "absolute", zIndex: 4, left: `${19 + index * 9}%`, top: `${68 - travel}%`, width: 7, height: 7, borderRadius: "50%", opacity: Math.max(0, burnProgress * (1 - travel / 72)), transform: `translateX(${sway}px)`, background: index % 2 ? "#ffb333" : "#fff1a1", boxShadow: "0 0 14px 5px rgba(255,91,17,.8)" }} />;
        })}
      </> : null}
      <div style={{ position: "relative", zIndex: 1, width: "76%", height: "70%", padding: 25, borderRadius: 18, background: "rgba(8,13,24,.94)", border: `2px solid ${burnProgress > 0.15 ? `rgba(255,${Math.round(115 - burnProgress * 90)},35,${1 - burnProgress * 0.55})` : "#75819d"}`, boxShadow: burnProgress > 0 ? `0 24px ${100 + burnProgress * 32}px rgba(0,0,0,.65), 0 0 ${burnProgress * 36}px rgba(255,79,13,.8)` : "0 24px 100px rgba(0,0,0,.65)", opacity: burnProgress > 0.88 ? 1 - (burnProgress - 0.88) * 4.5 : 1, clipPath: burnProgress > 0 ? `inset(0 0 ${burnProgress * 100}% 0 round 18px)` : undefined, filter: burnProgress > 0 ? `brightness(${1 - burnProgress * 0.62}) sepia(${burnProgress * 0.55})` : undefined, transform: `translate(${x}px,${y - burnProgress * 14}px) rotate(${Math.sin(frame * 1.6) * (shake / 10) + burnProgress * 1.5}deg)`, fontFamily: "Arial, sans-serif", color: "#eef2ff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#aeb9d2", fontSize: 18, letterSpacing: 2 }}><span>FLOXBOW · EDIT SESSION</span><span>● SAVING…</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 22, height: "58%", marginTop: 20 }}>
            <div style={{ display: "grid", placeItems: "center", borderRadius: 12, background: "linear-gradient(135deg,#182b45,#382d50 55%,#171d2e)", border: "1px solid #53617d" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 43, fontWeight: 900, color: mode === "red-title" || mode === "chaos" ? "#ff334d" : "#fff4e6", textShadow: "0 0 24px currentColor", transform: `scale(${1 + Math.sin(frame / 5) * 0.035})` }}>{title}</div>
              <div style={{ marginTop: 12, fontSize: 21, fontWeight: 700, color: allRed ? "#ff334d" : "#d5dbea" }}>{wrongTarget || mode === "chaos" ? "THE CAPTION CHANGED" : "A story on screen"}</div>
            </div>
          </div>
          <div style={{ padding: 18, borderRadius: 12, background: "#151d2d", border: `2px solid ${allRed ? "#ff334d" : "#485571"}` }}>
            <div style={{ color: "#91a0c0", fontSize: 16, letterSpacing: 1 }}>INSPECTOR · {wrongTarget ? "CAPTION COLOR" : mode === "chaos" ? "TOO MANY ITEMS" : "TITLE COLOR"}</div>
            <div style={{ marginTop: 17, padding: 15, borderRadius: 8, background: allRed ? "#9f2034" : "#26344c", fontSize: 23, fontWeight: 700 }}>{wrongTarget ? "Selected caption → RED" : mode === "chaos" ? "Title + everything → RED" : "Selected title → RED"}</div>
            <div style={{ marginTop: 17, height: 18, borderRadius: 12, background: "linear-gradient(90deg,#f7f2e9,#ff243d)" }} />
          </div>
        </div>
        <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
          {["VIDEO  ▰━━━━━━▰━━━━━━", "TITLE  ▰━━━━▰━━━━━━━━", "CAPTION ▰━━━━━━━▰━━━"].map((row, i) => <div key={row} style={{ height: 26, paddingLeft: 10, borderRadius: 5, background: i === 1 ? "linear-gradient(90deg,#7c51ee 0 70%,#252d40 70%)" : "linear-gradient(90deg,#238e9d 0 54%,#252d40 54%)", color: "white", fontSize: 15, lineHeight: "26px", transform: mode === "chaos" ? `translateX(${Math.sin(frame * 1.8 + i) * 30}px)` : undefined }}>{row}</div>)}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", minHeight: 46, display: "flex", alignItems: "center", gap: 12, borderRadius: 9, background: speaker === "AI" ? "rgba(115,91,229,.22)" : "rgba(255,69,94,.18)", border: `1px solid ${speaker === "AI" ? "#8878e8" : "#e75b70"}`, fontSize: 19 }}>
          <strong style={{ flexShrink: 0, color: speaker === "AI" ? "#b6aaff" : "#ff8b9d" }}>{speaker === "AI" ? "AI →" : "YOU →"}</strong>
          <span>{revealedMessage}{revealedMessage.length < message.length ? "▌" : ""}</span>
        </div>
        {allRed ? <div style={{ position: "absolute", top: "-5%", right: "-3%", padding: "12px 18px", color: "white", background: "#e52442", fontWeight: 900, transform: `rotate(${Math.sin(frame) * 4}deg)` }}>{mode === "chaos" ? "UNDO! UNDO!" : "WRONG ITEM"}</div> : null}
      </div>
      {burnProgress > 0.15 ? <div style={{ position: "absolute", zIndex: 5, left: "18%", top: `${Math.max(5, 16 - burnProgress * 15)}%`, width: "64%", height: "22%", borderRadius: "50%", opacity: burnProgress * 0.6, background: "radial-gradient(ellipse, rgba(95,91,91,.65), rgba(48,47,52,.34) 48%, transparent 72%)", filter: `blur(${5 + burnProgress * 9}px)`, transform: `scale(${1 + burnProgress * 0.35})` }} /> : null}
    </AbsoluteFill>
  );
}

const fakeChatModule: EditableComponent = {
  id: "fake-chat", name: "Staged AI chat", component: FakeChat,
  fields: [
    { key: "message", target: "content", label: "Chat message", type: "text", default: "Change the item to red." },
    { key: "previousMessage", target: "content", label: "Opening message to keep visible", type: "text", default: "Make me a video." },
    { key: "speaker", target: "content", label: "Speaker", type: "select", default: "YOU", options: ["YOU", "AI"] },
    { key: "side", target: "content", label: "Screen side", type: "select", default: "right", options: ["left", "right"] },
    { key: "pulse", target: "props", label: "Pulse", type: "number", default: 0.035, min: 0, max: 0.12, step: 0.005 },
  ],
};

const editorBeatModule: EditableComponent = {
  id: "editor-beat", name: "Editable editor beat", component: EditorBeat,
  fields: [
    { key: "mode", target: "content", label: "Edit beat", type: "select", default: "red-title", options: ["red-title", "wrong-target", "chaos", "manual"] },
    { key: "title", target: "content", label: "Preview title", type: "text", default: "THE CASCADE" },
    { key: "message", target: "content", label: "Chat message", type: "text", default: "Change the title to red." },
    { key: "speaker", target: "content", label: "Speaker", type: "select", default: "YOU", options: ["YOU", "AI"] },
    { key: "exitEffect", target: "content", label: "Exit effect", type: "select", default: "none", options: ["none", "burn"] },
    { key: "shake", target: "props", label: "UI shake", type: "number", default: 0, min: 0, max: 16, step: 1 },
  ],
};

const storyTitleModule: EditableComponent = {
  id: "story-title",
  name: "Story title (KineticText)",
  fields: [
    {
      key: "text",
      target: "content",
      label: "Title text",
      type: "text",
      default: "A story in progress",
    },
    {
      key: "motion",
      target: "content",
      label: "Motion style",
      type: "select",
      default: "kinetic",
      options: ["kinetic", "pop"],
    },
    {
      key: "size",
      target: "props",
      label: "Font size",
      type: "number",
      default: 72,
      min: 32,
      max: 120,
      step: 1,
    },
    {
      key: "visibleFrames",
      target: "props",
      label: "Visible frames",
      type: "number",
      default: 140,
      min: 30,
      max: 420,
      step: 1,
    },
    {
      key: "color",
      target: "props",
      label: "Text color",
      type: "color",
      default: "#fff7ea",
    },
    {
      key: "accentColor",
      target: "props",
      label: "Accent color",
      type: "color",
      default: "#d3b58f",
    },
    {
      key: "x",
      target: "props",
      label: "Position X (%)",
      type: "number",
      default: 7,
      min: 3,
      max: 80,
      step: 1,
    },
    {
      key: "y",
      target: "props",
      label: "Position Y (%)",
      type: "number",
      default: 9,
      min: 4,
      max: 65,
      step: 1,
    },
    {
      key: "fadeFrames",
      target: "props",
      label: "Fade frames",
      type: "number",
      default: 12,
      min: 1,
      max: 60,
      step: 1,
    },
  ],
  component: StoryTitle,
};

function StoryInsert({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const kind = textValue(clip, "kind", "dragon");
  const label = textValue(clip, "label", "Final_FINAL_reallyfinal_12.mp4");
  const x = numberValue(clip, "x", 78);
  const y = numberValue(clip, "y", 48);
  const width = numberValue(clip, "width", 22);
  const rotation = numberValue(clip, "rotation", 0);
  const fadeFrames = Math.min(numberValue(clip, "fadeFrames", 10), Math.floor(clip.durationInFrames / 3));
  const enterFrom = textValue(clip, "enterFrom", "right");
  const accent = String(fieldValue(clip, {
    key: "accent",
    target: "props",
    label: "Accent color",
    type: "color",
    default: "#ff4964",
  }));
  const direction = enterFrom === "left" ? -1 : enterFrom === "right" ? 1 : 0;
  const fadeIn = interpolate(frame, [0, Math.max(1, fadeFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, clip.durationInFrames - fadeFrames), clip.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const travelX = direction * (1 - fadeIn) * 150 + direction * (1 - fadeOut) * 80;
  const bob = kind === "dragon" ? Math.sin(frame * 0.12) * 8 : 0;
  const wiggle = kind === "dragon" ? Math.sin(frame * 0.16) * 2.5 : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        zIndex: kind === "cursor" ? 20 : undefined,
        opacity: Math.min(fadeIn, fadeOut),
        transform: `translate(calc(-50% + ${travelX}px), calc(-50% + ${bob}px)) rotate(${rotation + wiggle}deg)`,
        filter: "drop-shadow(0 16px 28px rgba(0,0,0,.48))",
      }}>
        {kind === "dragon" ? (
          <Img src={dragonMascot} alt="A mischievous green dragon sneaks into the video preview" style={{ display: "block", width: "100%", height: "auto" }} />
        ) : null}
        {kind === "version-stack" ? (
          <div style={{ position: "relative", padding: "22px 24px", borderRadius: 15, background: "#f4eee4", color: "#152033", border: `3px solid ${accent}`, font: "700 22px Arial, sans-serif", boxShadow: "0 20px 50px rgba(0,0,0,.45)" }}>
            <div style={{ position: "absolute", inset: 8, border: "1px solid rgba(20,30,50,.12)", borderRadius: 9 }} />
            <div style={{ position: "relative", color: accent, fontSize: 14, letterSpacing: 2, marginBottom: 12 }}>SAVED VERSIONS</div>
            <div style={{ position: "relative", overflowWrap: "anywhere" }}>{label}</div>
            <div style={{ position: "relative", marginTop: 10, color: "#788399", fontSize: 13 }}>and 11 more…</div>
          </div>
        ) : null}
        {kind === "timeline" ? (
          <div style={{ padding: 18, borderRadius: 14, background: "rgba(9,15,27,.94)", border: "2px solid rgba(255,255,255,.7)", boxShadow: "0 18px 55px rgba(0,0,0,.5)", font: "700 14px Arial, sans-serif", color: "white" }}>
            {[["VIDEO", "#1aa3ad"], ["TITLE", "#8055e8"], ["CAPTION", "#ed9a42"]].map(([name, color], index) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: index ? 8 : 0 }}>
                <span style={{ width: 62, color: "#bbc5d8", letterSpacing: 1 }}>{name}</span>
                <div style={{ position: "relative", height: 18, flex: 1, borderRadius: 4, background: "#202a3b", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0 28% 0 4%", borderRadius: 4, background: color as string }} />
                  {index === 1 ? <div style={{ position: "absolute", left: "61%", top: -4, bottom: -4, width: 3, background: "#fff", boxShadow: "0 0 9px white" }} /> : null}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10, color: accent, textAlign: "right", letterSpacing: 1 }}>ONE CLIP · YOUR CONTROL</div>
          </div>
        ) : null}
        {kind === "cursor" ? (
          <svg viewBox="0 0 64 80" style={{ display: "block", width: "80%", minWidth: 80, height: "auto", overflow: "visible", transform: `scale(${interpolate(frame, [23, 27, 31], [1, .78, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})` }} aria-label="Timeline selection cursor">
            <path d="M5 4 L5 62 L20 48 L31 73 L42 68 L31 43 L52 41 Z" fill={accent} stroke="white" strokeWidth="5" strokeLinejoin="round" />
            <circle cx="31" cy="41" r="29" fill="none" stroke={accent} strokeWidth="3" opacity={frame >= 23 ? .95 : .65} />
            {frame >= 23 && frame <= 34 ? <circle cx="31" cy="41" r={interpolate(frame, [23, 34], [15, 38])} fill="none" stroke={accent} strokeWidth="3" opacity={interpolate(frame, [23, 34], [.7, 0])} /> : null}
          </svg>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

const storyInsertModule: EditableComponent = {
  id: "story-insert",
  name: "Story visual insert",
  component: StoryInsert,
  fields: [
    { key: "kind", target: "content", label: "Visual", type: "select", default: "dragon", options: ["dragon", "version-stack", "timeline", "cursor"] },
    { key: "label", target: "content", label: "Label", type: "text", default: "Final_FINAL_reallyfinal_12.mp4" },
    { key: "x", target: "props", label: "Position X (%)", type: "number", default: 78, min: 0, max: 100, step: 1 },
    { key: "y", target: "props", label: "Position Y (%)", type: "number", default: 48, min: 0, max: 100, step: 1 },
    { key: "width", target: "props", label: "Width (%)", type: "number", default: 22, min: 8, max: 70, step: 1 },
    { key: "rotation", target: "props", label: "Rotation (degrees)", type: "number", default: 0, min: -30, max: 30, step: 1 },
    { key: "fadeFrames", target: "props", label: "Entrance / exit (frames)", type: "number", default: 10, min: 1, max: 60, step: 1 },
    { key: "enterFrom", target: "props", label: "Entrance direction", type: "select", default: "right", options: ["left", "right", "none"] },
    { key: "accent", target: "props", label: "Accent color", type: "color", default: "#ff4964" },
  ],
};

function TutorialBaitSequence({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const sampleLine = textValue(clip, "sampleLine", "THREE VERY DIFFERENT MOVES.");
  const setupLine = textValue(clip, "setupLine", "ONE PROMPT.");
  const prompt = textValue(clip, "prompt", "Three dragons. Three moves.");
  const sitePitch = textValue(clip, "sitePitch", "Want to see how?");
  const buttonLabel = textValue(clip, "buttonLabel", "GET THE PROMPT");
  const formTitle = textValue(clip, "formTitle", "GET THE PROMPT");
  const formLabels = textValue(clip, "formLabels", "Full name\nEmail\nPhone\nStreet address").split("\n").slice(0, 4);
  const moneyLine = textValue(clip, "moneyLine", "NOW GIVE ME YOUR MONEY.");
  const dragonLine = textValue(clip, "dragonLine", "I came to dance, not hand over my address.");
  const chars = Math.min(prompt.length, Math.max(0, Math.floor((frame - 114) * 1)));
  // The dragons finish their one-second spin, then hold a still pose for two full seconds.
  const sampleOpacity = interpolate(frame, [0, 6, 90, 96], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const promptOpacity = interpolate(frame, [96, 104, 170, 178], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pitchOpacity = interpolate(frame, [178, 184, 212, 218], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const formOpacity = interpolate(frame, [218, 224, 282, 288], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const moneyOpacity = interpolate(frame, [288, 294, 324, 330], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dragonOpacity = interpolate(frame, [330, 340, clip.durationInFrames - 8, clip.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dragonsOpacity = sampleOpacity;
  const pointerClick = frame >= 203 && frame < 218;

  return <AbsoluteFill style={{ pointerEvents: "none", fontFamily: "Arial,sans-serif" }}>
    <div style={{ position: "absolute", left: "50%", top: "38%", width: "72%", display: "flex", justifyContent: "center", alignItems: "center", gap: "1.5%", transform: "translate(-50%,-50%)" }}>
      {[-1, 0, 1].map((offset) => {
        const localDance = Math.min(frame, 30);
        const bounce = offset === -1
          ? Math.pow(Math.max(0, Math.sin(localDance * 0.18)), 7) * 34
          : offset === 0
            ? Math.pow(Math.max(0, Math.sin(localDance * 0.22)), 6) * 24
            : Math.sin(localDance * 0.16) * 10;
        const rotation = offset === -1
          ? Math.sin(localDance * 0.12) * 6
          : offset === 0
            ? interpolate(localDance, [0, 30], [-18, 342])
            : Math.sin(localDance * 0.2) * 12;
        const sway = offset === 1 ? Math.sin(localDance * 0.24) * 14 : Math.sin(localDance * 0.1 + offset) * 5;
        const squash = offset === 0 ? 1 + Math.max(0, Math.sin(localDance * 0.22)) * 0.04 : 1;
        return <div key={offset} style={{ width: "27%", opacity: dragonsOpacity, transform: `translate(${sway}px,${-bounce + Math.sin(localDance * .08 + offset) * 4}px) rotate(${rotation}deg) scale(${squash})`, filter: "drop-shadow(0 15px 25px rgba(0,0,0,.55))" }}><Img src={dragonMascot} alt="Three tiny dragons dance in the tutorial sample" style={{ display: "block", width: "100%", height: "auto" }} /></div>;
      })}
    </div>
    <AbsoluteFill style={{ display: "grid", placeItems: "end center", paddingBottom: "8%", opacity: sampleOpacity }}>
      <div style={{ padding: "14px 24px", color: "white", background: "rgba(11,17,29,.94)", border: "2px solid #a999ff", borderRadius: 10, fontSize: 30, fontWeight: 900, letterSpacing: 1.5, textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>{sampleLine}</div>
    </AbsoluteFill>
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: promptOpacity }}>
      <div style={{ width: "72%", padding: "22px 28px", borderRadius: 16, background: "rgba(12,17,27,.97)", border: "2px solid #a999ff", boxShadow: "0 20px 70px rgba(0,0,0,.65)", color: "#f7f4ff" }}>
        <div style={{ color: "#b9aaff", fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>{setupLine}</div>
        <div style={{ marginTop: 14, padding: 16, minHeight: 82, borderRadius: 10, background: "rgba(38,44,61,.92)", fontSize: 29, lineHeight: 1.22, fontWeight: 650 }}>{prompt.slice(0, chars)}{chars < prompt.length ? <span style={{ color: "#ff4964" }}>▌</span> : null}</div>
      </div>
    </AbsoluteFill>
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: pitchOpacity }}>
      <div style={{ width: "78%", padding: "27px 32px", borderRadius: 16, background: "rgba(13,18,29,.98)", color: "#f8f5ee", border: "2px solid #ff4964", boxShadow: "0 20px 70px rgba(0,0,0,.7)", textAlign: "center" }}>
        <div style={{ fontSize: 36, lineHeight: 1.2, fontWeight: 850 }}>{sitePitch}</div>
        <div style={{ display: "inline-block", marginTop: 18, padding: "13px 22px", borderRadius: 8, background: "#f4c542", color: "#191817", fontSize: 24, fontWeight: 950, letterSpacing: 1, boxShadow: pointerClick ? "0 0 0 8px rgba(244,197,66,.22)" : "0 8px 24px rgba(0,0,0,.35)", transform: pointerClick ? "scale(.94)" : "scale(1)" }}>{buttonLabel}</div>
        <div style={{ marginTop: 10, color: "#aeb6c6", fontSize: 16 }}>example.com · prompt access</div>
      </div>
      {frame >= 196 && frame < 220 ? <div style={{ position: "absolute", left: "57%", top: "64%", fontSize: 76, color: "white", textShadow: "0 3px 10px #000", transform: `translate(${frame < 211 ? -130 : 0}px,${frame < 211 ? -75 : 0}px) scale(${pointerClick ? .82 : 1})` }}>↖</div> : null}
    </AbsoluteFill>
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: formOpacity }}>
      <div style={{ width: "58%", padding: "23px 30px", borderRadius: 14, background: "#f1f2f3", color: "#212630", boxShadow: "0 22px 75px rgba(0,0,0,.68)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, fontWeight: 900 }}><span>{formTitle}</span><span style={{ color: "#d82e43" }}>FREE*</span></div>
        {formLabels.map((label, index) => {
          const rowOpacity = interpolate(frame, [224 + index * 7, 230 + index * 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div key={`${label}-${index}`} style={{ marginTop: 8, opacity: rowOpacity }}><div style={{ marginBottom: 3, fontSize: 13, fontWeight: 800, color: "#49515d" }}>{label}</div><div style={{ height: 29, padding: "0 10px", display: "flex", alignItems: "center", border: "1px solid #aeb5bf", borderRadius: 5, background: "white", color: "#9aa1aa", fontSize: 14 }}>Enter {label.toLowerCase()}</div></div>;
        })}
        <div style={{ marginTop: 10, textAlign: "right", color: "#d82e43", fontSize: 12, fontWeight: 700 }}>*FREE TRIAL · PAYMENT DETAILS REQUIRED</div>
      </div>
    </AbsoluteFill>
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: moneyOpacity }}>
      <div style={{ padding: "31px 40px", border: "5px solid #fff", background: "#d7273d", color: "white", boxShadow: "0 0 90px rgba(255,30,60,.65)", fontSize: 59, fontWeight: 1000, letterSpacing: 1, textAlign: "center", transform: `scale(${1 + Math.sin(frame * .5) * .025}) rotate(-1deg)` }}>{moneyLine}</div>
    </AbsoluteFill>
    <AbsoluteFill style={{ opacity: dragonOpacity, background: "radial-gradient(circle at 50% 48%, rgba(255,30,50,.42), transparent 42%)" }}>
      <div style={{ position: "absolute", right: "8%", top: "15%", width: "28%", transform: `rotate(${Math.sin(frame * .55) * 3}deg) scale(${1 + Math.sin(frame * .8) * .025})`, filter: "drop-shadow(0 0 30px rgba(255,85,30,.6))" }}><Img src={dragonMascot} alt="The dragon refuses the fake checkout" style={{ display: "block", width: "100%", height: "auto" }} /></div>
      <div style={{ position: "absolute", left: "6%", top: "37%", width: "58%", padding: "25px 27px", background: "#101521", border: "3px solid #ff354d", color: "#fff", fontSize: 39, lineHeight: 1.14, fontWeight: 950, boxShadow: "0 0 40px rgba(255,30,50,.4)" }}>{dragonLine}</div>
      <div style={{ position: "absolute", left: "8%", top: "68%", color: "#ffce73", fontSize: 31, fontWeight: 900, transform: `rotate(${Math.sin(frame * .2) * 2}deg)` }}>NOPE.</div>
    </AbsoluteFill>
  </AbsoluteFill>;
}
const tutorialBaitModule: EditableComponent = {
  id: "tutorial-bait", name: "Tutorial promise · sample and paywall", component: TutorialBaitSequence,
  fields: [
    { key: "sampleLine", target: "content", label: "Sample animation caption", type: "text", default: "THREE VERY DIFFERENT MOVES." },
    { key: "setupLine", target: "content", label: "Prompt setup", type: "text", default: "ONE PROMPT." },
    { key: "prompt", target: "content", label: "Animation prompt", type: "text", default: "Three dragons. Three moves." },
    { key: "sitePitch", target: "content", label: "Website pitch", type: "text", default: "Want to see how?" },
    { key: "buttonLabel", target: "content", label: "Fake website button", type: "text", default: "GET THE PROMPT" },
    { key: "formTitle", target: "content", label: "Fake form title", type: "text", default: "GET THE PROMPT" },
    { key: "formLabels", target: "content", label: "Fake signup fields", type: "text", default: "Full name\nEmail\nPhone\nStreet address" },
    { key: "moneyLine", target: "content", label: "Money punchline", type: "text", default: "NOW GIVE ME YOUR MONEY." },
    { key: "dragonLine", target: "content", label: "Dragon's reply", type: "text", default: "I came to dance, not hand over my address." },
  ],
};

function ClickbaitThumbnail({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const headline = textValue(clip, "headline", "ONE PROMPT. ONE MOVIE?");
  const badge = textValue(clip, "badge", "THE NEW AI METHOD");
  const imageId = textValue(clip, "imageId", "firstResult");
  const image = images[imageId] ?? firstResult;
  const x = numberValue(clip, "x", 78);
  const y = numberValue(clip, "y", 48);
  const width = numberValue(clip, "width", 27);
  const rotation = numberValue(clip, "rotation", 0);
  const clickFrame = numberValue(clip, "clickFrame", 90);
  const expandFrames = Math.max(1, numberValue(clip, "expandFrames", 30));
  const expandOnClick = fieldValue(clip, {
    key: "expandOnClick",
    target: "content",
    label: "Expand on click",
    type: "boolean",
    default: false,
  }) === true;
  const expansion = expandOnClick
    ? interpolate(frame, [clickFrame, clickFrame + expandFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const cardX = interpolate(expansion, [0, 1], [x, 50]);
  const cardY = interpolate(expansion, [0, 1], [y, 50]);
  const cardWidth = interpolate(expansion, [0, 1], [width, 100]);
  const cardRotation = interpolate(expansion, [0, 1], [rotation, 0]);
  const cardTextOpacity = 1 - (expandOnClick
    ? interpolate(frame, [clickFrame, clickFrame + Math.min(20, expandFrames)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0);
  const fadeFrames = Math.min(numberValue(clip, "fadeFrames", 8), Math.floor(clip.durationInFrames / 3));
  const enterFrom = textValue(clip, "enterFrom", "right");
  const accent = String(fieldValue(clip, {
    key: "accent",
    target: "props",
    label: "Thumbnail accent",
    type: "color",
    default: "#ff303c",
  }));
  const direction = enterFrom === "left" ? -1 : enterFrom === "right" ? 1 : 0;
  const fadeIn = interpolate(frame, [0, Math.max(1, fadeFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, clip.durationInFrames - fadeFrames), clip.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const travelX = direction * (1 - fadeIn) * 170 + direction * (1 - fadeOut) * 110;
  const pop = interpolate(frame, [0, Math.max(1, fadeFrames)], [0.78, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute",
        left: `${cardX}%`,
        top: `${cardY}%`,
        width: `${cardWidth}%`,
        opacity: Math.min(fadeIn, fadeOut),
        transform: `translate(calc(-50% + ${travelX * (1 - expansion)}px), -50%) rotate(${cardRotation}deg) scale(${pop})`,
        filter: "drop-shadow(0 16px 26px rgba(0,0,0,.6))",
      }}>
        <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "4px solid white", borderRadius: 9, background: "#121b2c", boxShadow: `0 0 0 3px ${accent}, 0 12px 32px rgba(0,0,0,.42)` }}>
          <Img src={image} alt={`Clickbait video thumbnail: ${headline}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "saturate(1.35) brightness(.72)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.05) 18%,rgba(0,0,0,.1) 34%,rgba(0,0,0,.86) 100%)" }} />
          <div style={{ position: "absolute", inset: 0, opacity: cardTextOpacity }}>
            <div style={{ position: "absolute", left: 15, top: 13, padding: "7px 12px", borderRadius: 5, background: accent, color: "white", font: "900 16px Arial, sans-serif", letterSpacing: 1.2, textShadow: "0 1px 4px rgba(0,0,0,.4)" }}>{badge}</div>
            <svg viewBox="0 0 130 120" style={{ position: "absolute", right: "8%", top: "17%", width: "28%", height: "55%", overflow: "visible", filter: "drop-shadow(0 3px 3px rgba(0,0,0,.75))" }} aria-hidden="true">
              <path d="M8 16 C38 10 49 22 67 43 L91 70" fill="none" stroke="white" strokeWidth="20" strokeLinecap="round" />
              <path d="M8 16 C38 10 49 22 67 43 L91 70" fill="none" stroke={accent} strokeWidth="13" strokeLinecap="round" />
              <path d="M65 68 L99 83 L101 47 Z" fill={accent} stroke="white" strokeWidth="6" strokeLinejoin="round" />
            </svg>
            <div style={{ position: "absolute", left: 15, right: 15, bottom: 10, color: "white", font: "1000 36px/0.9 Arial, sans-serif", letterSpacing: -1.1, textTransform: "uppercase", textShadow: "0 3px 7px rgba(0,0,0,.8)", whiteSpace: "pre-line" }}>{headline}</div>
            <div style={{ position: "absolute", right: 13, bottom: 12, padding: "5px 8px", borderRadius: 4, background: "rgba(0,0,0,.82)", color: "white", font: "700 13px Arial, sans-serif" }}>10:42</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

const clickbaitThumbnailModule: EditableComponent = {
  id: "clickbait-thumbnail",
  name: "Clickbait thumbnail",
  component: ClickbaitThumbnail,
  fields: [
    { key: "headline", target: "content", label: "Thumbnail headline", type: "text", default: "ONE PROMPT. ONE MOVIE?" },
    { key: "badge", target: "content", label: "Thumbnail badge", type: "text", default: "THE NEW AI METHOD" },
    { key: "imageId", target: "content", label: "Thumbnail image", type: "select", default: "firstResult", options: ["curiosity", "firstPrompt", "firstResult", "tinyFix", "cascade", "storyboard", "editorBuild", "dawnFinish", "thumbnailOnePrompt", "thumbnailNoEdit", "thumbnailWholeFilm", "thumbnailDragon"] },
    { key: "expandOnClick", target: "content", label: "Expand on click", type: "boolean", default: false },
    { key: "clickFrame", target: "props", label: "Click at frame", type: "number", default: 90, min: 0, max: 1000 },
    { key: "expandFrames", target: "props", label: "Expand duration (frames)", type: "number", default: 30, min: 1, max: 300 },
    { key: "x", target: "props", label: "Position X (%)", type: "number", default: 78, min: 0, max: 100, step: 1 },
    { key: "y", target: "props", label: "Position Y (%)", type: "number", default: 48, min: 0, max: 100, step: 1 },
    { key: "width", target: "props", label: "Width (%)", type: "number", default: 27, min: 12, max: 60, step: 1 },
    { key: "rotation", target: "props", label: "Rotation (degrees)", type: "number", default: 0, min: -20, max: 20, step: 1 },
    { key: "fadeFrames", target: "props", label: "Entrance / exit (frames)", type: "number", default: 8, min: 1, max: 30, step: 1 },
    { key: "enterFrom", target: "props", label: "Entrance direction", type: "select", default: "right", options: ["left", "right", "none"] },
    { key: "accent", target: "props", label: "Thumbnail accent", type: "color", default: "#ff303c" },
  ],
};

function SearchPrompt({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const query = textValue(clip, "query", "how to make a video with Claude");
  const width = numberValue(clip, "width", 62);
  const reveal = Math.min(query.length, Math.max(0, Math.floor((frame - 4) * 1.15)));
  const opacity = interpolate(frame, [0, 8, clip.durationInFrames - 12, clip.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 12, clip.durationInFrames - 12, clip.durationInFrames], [0.94, 1, 1, 0.96], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
    <div style={{ position: "absolute", left: "50%", top: "18%", width: `${width}%`, transform: `translate(-50%,-50%) scale(${scale})`, padding: "13px 20px", display: "flex", alignItems: "center", gap: 15, borderRadius: 40, background: "rgba(248,249,251,.97)", color: "#1d2430", boxShadow: "0 12px 45px rgba(0,0,0,.55)", fontFamily: "Arial,sans-serif" }}>
      <span style={{ color: "#ff424e", fontSize: 24 }}>▶</span>
      <span style={{ flex: 1, fontSize: 24, minHeight: 30 }}>{query.slice(0, reveal)}{reveal < query.length ? <span style={{ color: "#ff424e" }}>▏</span> : null}</span>
      <span style={{ borderLeft: "1px solid #ccd0d6", paddingLeft: 16, fontSize: 24 }}>⌕</span>
    </div>
  </AbsoluteFill>;
}

const searchPromptModule: EditableComponent = {
  id: "search-prompt", name: "Opening search", component: SearchPrompt,
  fields: [
    { key: "query", target: "content", label: "Search text", type: "text", default: "how to make a video with Claude" },
    { key: "width", target: "props", label: "Search bar width (%)", type: "number", default: 62, min: 35, max: 90, step: 1 },
  ],
};

function solveLinearSystem(matrix: number[][], values: number[]) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  const size = values.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-8) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row) => row[size]);
}

function quadTransform(points: Array<[number, number]>) {
  const source = [[0, 0], [1920, 0], [1920, 1080], [0, 1080]];
  const matrix: number[][] = [];
  const values: number[] = [];
  source.forEach(([x, y], index) => {
    const [targetX, targetY] = points[index];
    matrix.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y]);
    values.push(targetX);
    matrix.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y]);
    values.push(targetY);
  });
  const h = solveLinearSystem(matrix, values);
  if (!h) return "matrix(1, 0, 0, 1, 0, 0)";
  return `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
}

function EditorPopout({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const holdFrames = Math.min(numberValue(clip, "holdFrames", 36), clip.durationInFrames - 1);
  const travelFrames = Math.min(numberValue(clip, "travelFrames", 84), clip.durationInFrames - holdFrames);
  const progress = interpolate(frame, [holdFrames, holdFrames + Math.max(1, travelFrames)], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const startDefaults = [
    ["screenTLX", 58.2], ["screenTLY", 24], ["screenTRX", 94], ["screenTRY", 19],
    ["screenBRX", 94.6], ["screenBRY", 64.5], ["screenBLX", 57.1], ["screenBLY", 60.5],
  ] as const;
  const start = startDefaults.map(([key, fallback]) => numberValue(clip, key, fallback));
  const flatX = numberValue(clip, "flatX", 50);
  const flatY = numberValue(clip, "flatY", 52);
  const flatWidth = numberValue(clip, "flatWidth", 80);
  const flatHeight = numberValue(clip, "flatHeight", 76);
  const end = [
    flatX - flatWidth / 2, flatY - flatHeight / 2,
    flatX + flatWidth / 2, flatY - flatHeight / 2,
    flatX + flatWidth / 2, flatY + flatHeight / 2,
    flatX - flatWidth / 2, flatY + flatHeight / 2,
  ];
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 8; index += 2) {
    points.push([
      interpolate(progress, [0, 1], [start[index] * 19.2, end[index] * 19.2]),
      interpolate(progress, [0, 1], [start[index + 1] * 10.8, end[index + 1] * 10.8]),
    ]);
  }
  const alpha = interpolate(frame, [0, 8, Math.max(9, clip.durationInFrames - 12), clip.durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const accent = String(fieldValue(clip, {
    key: "accent", target: "props", label: "Panel accent", type: "color", default: "#a999ff",
  }));
  const selectedClip = textValue(clip, "selectedClip", "The story becomes editable");
  const inspectorRows = ["Start", "Duration", "Position", "Scale", "Opacity"];
  const timelineRows = [
    { label: "VIDEO", color: "#35a6c0", width: 63 },
    { label: "TITLES", color: "#916de0", width: 47 },
    { label: "CAPTIONS", color: "#e5aa47", width: 58 },
    { label: "AUDIO", color: "#46b982", width: 72 },
  ];

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", transformOrigin: "0 0",
        transform: quadTransform(points), opacity: alpha, zIndex: 20,
        filter: `drop-shadow(0 ${interpolate(progress, [0, 1], [5, 30])}px ${interpolate(progress, [0, 1], [16, 70])}px rgba(0,0,0,.72))`,
      }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 18, border: `2px solid ${accent}`, background: "#111722", color: "#f1f4ff", fontFamily: "Arial, sans-serif", boxShadow: `0 0 32px ${accent}55` }}>
          <div style={{ height: "7%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2%", background: "#1b2432", borderBottom: "1px solid #39465a", fontSize: "1.35vw", letterSpacing: ".04em" }}>
            <strong><span style={{ color: accent }}>✳</span> FLOXBOW <span style={{ color: "#93a0b5", fontWeight: 500 }}>MOTION STUDIO</span></strong>
            <span style={{ color: "#aab6c9" }}>Project · Origin Story　　Preview　　Export</span>
            <span style={{ color: "#91d4a8" }}>● SAVED</span>
          </div>
          <div style={{ position: "absolute", top: "7%", bottom: "27%", left: 0, right: 0, display: "grid", gridTemplateColumns: "17% 1fr 19%", gap: 1, background: "#303b4c" }}>
            <div style={{ background: "#151d29", padding: "4% 5%", color: "#a9b5c9", fontSize: "1vw" }}>
              <div style={{ color: "#dbe2ef", fontWeight: 800, letterSpacing: ".12em", marginBottom: 18 }}>PROJECT</div>
              {[["▧", "Media"], ["◫", "Scenes"], ["T", "Titles"], ["♫", "Audio"]].map(([icon, name]) => <div key={name} style={{ padding: "8px 5px", borderBottom: "1px solid #283243" }}><span style={{ color: accent }}>{icon}</span>　{name}</div>)}
              <div style={{ marginTop: 25, color: "#75839b", fontSize: ".8vw" }}>WORKSPACE<br /><br />Human in control</div>
            </div>
            <div style={{ background: "#0c1119", padding: "2% 3%", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ color: "#aebbd0", fontSize: ".9vw", marginBottom: 10 }}>CANVAS　　1920 × 1080　　30 FPS</div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #58657b", background: `linear-gradient(0deg,rgba(8,12,20,.7),transparent),url(${dawnFinish}) center 42% / cover`, display: "grid", placeItems: "center", position: "relative" }}>
                <div style={{ padding: "1.6% 2.2%", border: `1px solid ${accent}`, background: "rgba(11,16,27,.83)", color: "white", fontSize: "2vw", fontWeight: 900, letterSpacing: ".05em", boxShadow: `0 0 28px ${accent}88` }}>HUMAN IN CONTROL</div>
                <div style={{ position: "absolute", left: "3%", bottom: "3%", color: "white", background: "rgba(0,0,0,.6)", padding: "6px 10px", fontSize: ".85vw" }}>Preview　▶　00:02:27</div>
              </div>
              <div style={{ height: "13%", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9eabc0", fontSize: ".9vw" }}><span>◀　▶　 Play　　Frame 4,429</span><span style={{ color: accent }}>Selected: {selectedClip}</span></div>
            </div>
            <div style={{ background: "#151d29", padding: "5% 7%", color: "#aab6ca", fontSize: ".88vw" }}>
              <div style={{ color: "#e1e7f1", fontWeight: 800, letterSpacing: ".1em", marginBottom: 18 }}>INSPECTOR</div>
              <div style={{ color: accent, marginBottom: 16 }}>Selected clip</div>
              {inspectorRows.map((label, index) => <div key={label} style={{ marginBottom: 12 }}>{label}<div style={{ height: 10, marginTop: 5, borderRadius: 5, background: "#293448", overflow: "hidden" }}><div style={{ width: `${[72, 54, 62, 48, 86][index]}%`, height: "100%", background: index === 0 ? accent : "#71809a" }} /></div></div>)}
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "27%", background: "#101722", borderTop: "1px solid #465269", padding: "1% 1.5%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#aebbd0", fontSize: "1vw", marginBottom: 10 }}><strong style={{ color: "#f2f5fb" }}>TIMELINE</strong><span>30 FPS　　00:02:27</span><span style={{ color: accent }}>+ Add track</span></div>
            {timelineRows.map((row) => <div key={row.label} style={{ display: "grid", gridTemplateColumns: "10% 1fr", alignItems: "center", height: "18%", borderTop: "1px solid #273244", color: "#98a6bb", fontSize: ".75vw" }}><span>{row.label}</span><div style={{ height: "58%", background: "#1d2838", position: "relative", borderRadius: 4 }}><div style={{ position: "absolute", left: "5%", top: 2, bottom: 2, width: `${row.width}%`, borderRadius: 3, background: `linear-gradient(90deg,${row.color} 0 32%,${row.color}99 32% 68%,${row.color} 68%)`, boxShadow: row.label === "TITLES" ? `0 0 0 2px ${accent}` : undefined }} /></div></div>)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

const editorPopoutModule: EditableComponent = {
  id: "editor-popout",
  name: "Editor UI pop-out",
  component: EditorPopout,
  fields: [
    { key: "selectedClip", target: "content", label: "Selected clip label", type: "text", default: "The story becomes editable" },
    { key: "screenTLX", target: "props", label: "Screen · top-left X (%)", type: "number", default: 58.2, min: 0, max: 100, step: 0.1 },
    { key: "screenTLY", target: "props", label: "Screen · top-left Y (%)", type: "number", default: 24, min: 0, max: 100, step: 0.1 },
    { key: "screenTRX", target: "props", label: "Screen · top-right X (%)", type: "number", default: 94, min: 0, max: 100, step: 0.1 },
    { key: "screenTRY", target: "props", label: "Screen · top-right Y (%)", type: "number", default: 19, min: 0, max: 100, step: 0.1 },
    { key: "screenBRX", target: "props", label: "Screen · bottom-right X (%)", type: "number", default: 94.6, min: 0, max: 100, step: 0.1 },
    { key: "screenBRY", target: "props", label: "Screen · bottom-right Y (%)", type: "number", default: 64.5, min: 0, max: 100, step: 0.1 },
    { key: "screenBLX", target: "props", label: "Screen · bottom-left X (%)", type: "number", default: 57.1, min: 0, max: 100, step: 0.1 },
    { key: "screenBLY", target: "props", label: "Screen · bottom-left Y (%)", type: "number", default: 60.5, min: 0, max: 100, step: 0.1 },
    { key: "flatX", target: "props", label: "Floating panel · center X (%)", type: "number", default: 50, min: 0, max: 100, step: 1 },
    { key: "flatY", target: "props", label: "Floating panel · center Y (%)", type: "number", default: 52, min: 0, max: 100, step: 1 },
    { key: "flatWidth", target: "props", label: "Floating panel · width (%)", type: "number", default: 80, min: 20, max: 100, step: 1 },
    { key: "flatHeight", target: "props", label: "Floating panel · height (%)", type: "number", default: 76, min: 20, max: 100, step: 1 },
    { key: "holdFrames", target: "props", label: "Hold on screen (frames)", type: "number", default: 36, min: 0, max: 240, step: 1 },
    { key: "travelFrames", target: "props", label: "Exit animation (frames)", type: "number", default: 84, min: 1, max: 240, step: 1 },
    { key: "accent", target: "props", label: "Panel accent", type: "color", default: "#a999ff" },
  ],
};

export const editorComponents: EditableComponent[] = [
  storyImageModule,
  sceneObjectModule,
  sceneGlowModule,
  storyTitleModule,
  fakeChatModule,
  editorBeatModule,
  storyInsertModule,
  clickbaitThumbnailModule,
  searchPromptModule,
  tutorialBaitModule,
  editorPopoutModule,
  internetMessageModule,
  subtitleModule,
];

export default function Video({ timeline }: EditableVideoProps) {
  return (
    <Canvas background="#101722" style={{ padding: 0, color: "#fff7ea" }}>
      <TimelineComposition
        timeline={timeline ?? parseEditTimeline(savedTimeline, {
          fps: projectManifest.fps,
          durationInFrames: projectManifest.durationInFrames,
        })}
        components={editorComponents}
      />
    </Canvas>
  );
}

