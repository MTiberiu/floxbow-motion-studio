import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  progress,
  type TimedWord,
} from "@motion/sdk";
export function KineticText({
  text,
  delay = 0,
  size = 82,
  color = "inherit",
}: {
  text: string;
  delay?: number;
  size?: number;
  color?: string;
}) {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.06,
        letterSpacing: -3,
        color,
      }}
    >
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            marginRight: 18,
            opacity: progress(f, delay + i * 5, delay + i * 5 + 12),
            transform: `translateY(${(1 - progress(f, delay + i * 5, delay + i * 5 + 16)) * 40}px)`,
          }}
        >
          {word + " "}
        </span>
      ))}
    </div>
  );
}
export function ChatBubble({
  text,
  side = "left",
  delay = 0,
}: {
  text: string;
  side?: "left" | "right";
  delay?: number;
}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        alignSelf: side === "left" ? "flex-start" : "flex-end",
        background: side === "left" ? "#25344c" : "#bded80",
        color: side === "left" ? "white" : "#172310",
        padding: "25px 32px",
        borderRadius: 28,
        maxWidth: "78%",
        fontSize: 32,
        transform: `scale(${p})`,
        transformOrigin: side === "left" ? "bottom left" : "bottom right",
      }}
    >
      {text}
    </div>
  );
}
export function ComicPop({
  text,
  color = "#c5f18a",
}: {
  text: string;
  color?: string;
}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 9 } });
  return (
    <div
      style={{
        fontSize: 110,
        fontWeight: 900,
        color,
        transform: `scale(${s}) rotate(-5deg)`,
        textShadow: "6px 6px 0 #263448",
      }}
    >
      {text}
    </div>
  );
}
export function Counter({
  to,
  from = 0,
  frames = 60,
  suffix = "",
}: {
  to: number;
  from?: number;
  frames?: number;
  suffix?: string;
}) {
  const f = useCurrentFrame();
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {Math.round(
        interpolate(f, [0, frames], [from, to], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      )}
      {suffix}
    </span>
  );
}
export function KaraokeWords({
  words,
  time,
  color = "#c5f18a",
}: {
  words: TimedWord[];
  time?: number;
  color?: string;
}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = time ?? f / fps;
  return (
    <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.25 }}>
      {words.map((w) => (
        <span
          key={w.id}
          style={{
            marginRight: 20,
            color:
              w.start !== null &&
              w.end !== null &&
              now >= w.start &&
              now < w.end
                ? color
                : "#7d879a",
          }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}
