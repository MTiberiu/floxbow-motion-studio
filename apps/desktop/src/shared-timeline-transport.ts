import { useSyncExternalStore } from "react";
import type { EditTimeline } from "@motion/sdk/timeline";

export type SharedTimelineTransport = Readonly<{
  projectId: string;
  sessionId: string;
  timeline: EditTimeline;
  audioAssetId: string | null;
  frame: number;
  fps: number;
  playing: boolean;
  masterVolume: number;
  play: () => void;
  pause: () => void;
  seek: (frame: number) => void;
  setVolume: (volume: number) => void;
}>;

let currentTransport: SharedTimelineTransport | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function publishSharedTimelineTransport(
  transport: SharedTimelineTransport,
) {
  currentTransport = transport;
  notify();
}

export function clearSharedTimelineTransport(sessionId: string) {
  if (currentTransport?.sessionId !== sessionId) return;
  currentTransport = null;
  notify();
}

export function subscribeSharedTimelineTransport(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSharedTimelineTransport() {
  return currentTransport;
}

export function useSharedTimelineTransport() {
  return useSyncExternalStore(
    subscribeSharedTimelineTransport,
    getSharedTimelineTransport,
    () => null,
  );
}
