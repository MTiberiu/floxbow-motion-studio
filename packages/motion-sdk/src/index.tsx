import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
export {
  AbsoluteFill,
  Sequence,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
export type { ProjectManifest } from "@motion/project-loader/schema";
export type { LyricTimeline, TimedWord, TimedLine } from "@motion/lyrics-sync";
export const SDK_VERSION = "0.1.0";
export const secondsToFrames = (seconds: number, fps: number) =>
  Math.round(seconds * fps);
export const progress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
export function Scene({
  from,
  duration,
  children,
}: {
  from: number;
  duration: number;
  children: ReactNode;
}) {
  return (
    <Sequence from={from} durationInFrames={duration}>
      {children}
    </Sequence>
  );
}
export function Fade({
  children,
  frames = 15,
}: {
  children: ReactNode;
  frames?: number;
}) {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(
          progress(f, 0, frames),
          1 - progress(f, durationInFrames - frames, durationInFrames),
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
export function Canvas({
  children,
  background = "#101725",
  style,
}: {
  children: ReactNode;
  background?: string;
  style?: CSSProperties;
}) {
  return (
    <AbsoluteFill
      style={{
        background,
        color: "#f6f5ef",
        fontFamily: "Arial, sans-serif",
        padding: 80,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
export type AudioReference = {
  src: string;
  startFrom?: number;
  volume?: number;
};
