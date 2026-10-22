import { Audio } from "remotion";
import type { AudioReference } from "@motion/sdk";
export function Narration({ src, startFrom = 0, volume = 1 }: AudioReference) {
  return <Audio src={src} startFrom={startFrom} volume={volume} />;
}

/** Remotion audio rendered inside the same timeline sequence and player as its video. */
export function SoundtrackAudio({ src }: { src: string }) {
  return <Audio src={src} />;
}
