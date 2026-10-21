import type { ReactNode } from "react";
import { Canvas, Fade, Scene } from "@motion/sdk";
import {
  ChatBubble,
  ComicPop,
  Counter,
  KaraokeWords,
  KineticText,
} from "@motion/animations";
import type { TimedWord } from "@motion/lyrics-sync";

function SampleFrame({ children }: { children: ReactNode }) {
  return (
    <Canvas
      background="#15202b"
      style={{ padding: 90, color: "#eef4fa", justifyContent: "center" }}
    >
      {children}
    </Canvas>
  );
}

export function CanvasExample() {
  return (
    <Scene from={0} duration={180}>
      <SampleFrame>
        <div style={{ textAlign: "center" }}>
          <small style={{ color: "#9eb8ca", letterSpacing: 6 }}>CANVAS</small>
          <h1 style={{ fontSize: 88, margin: "20px 0" }}>Frame 001</h1>
          <div style={{ height: 3, background: "#8ac6b7", width: "55%", margin: "auto" }} />
        </div>
      </SampleFrame>
    </Scene>
  );
}

export function FadeExample() {
  return (
    <SampleFrame>
      <Fade frames={24}>
        <div style={{ textAlign: "center", fontSize: 76, fontWeight: 700 }}>Fade by frame</div>
      </Fade>
    </SampleFrame>
  );
}

export function KineticTextExample() {
  return (
    <SampleFrame>
      <KineticText text="Words move in time" size={84} color="#eef4fa" />
    </SampleFrame>
  );
}

export function ChatBubbleExample() {
  return (
    <SampleFrame>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <ChatBubble text="Frame-driven motion" side="left" />
        <ChatBubble text="Reusable message" side="right" delay={18} />
      </div>
    </SampleFrame>
  );
}

export function ComicPopExample() {
  return (
    <SampleFrame>
      <ComicPop text="MOTION" color="#8ac6b7" />
    </SampleFrame>
  );
}

export function CounterExample() {
  return (
    <SampleFrame>
      <div style={{ textAlign: "center", fontSize: 92, fontWeight: 700 }}>
        <Counter from={0} to={100} frames={120} suffix="%" />
      </div>
    </SampleFrame>
  );
}

const words: TimedWord[] = [
  { id: "word-1", text: "Time", start: 0.2, end: 1.1, confidence: 1, source: "demo" },
  { id: "word-2", text: "follows", start: 1.1, end: 2.1, confidence: 1, source: "demo" },
  { id: "word-3", text: "words", start: 2.1, end: 3.4, confidence: 1, source: "demo" },
];

export function KaraokeWordsExample() {
  return (
    <SampleFrame>
      <KaraokeWords words={words} color="#8ac6b7" />
    </SampleFrame>
  );
}
