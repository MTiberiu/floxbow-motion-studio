import { Audio } from "remotion";
import type { AudioReference } from "@motion/sdk";
export function Narration({ src, startFrom = 0, volume = 1 }: AudioReference) {
  return <Audio src={src} startFrom={startFrom} volume={volume} />;
}
