import { Narration } from "@motion/audio";

export function NarrationAudioExample({ src }: { src: string }) {
  return <Narration src={src} volume={0.8} />;
}
