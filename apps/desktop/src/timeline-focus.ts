import type { TimelineClip } from "@motion/sdk/timeline";

export function clipsForTrack(
  clips: readonly TimelineClip[],
  trackId: string,
): TimelineClip[] {
  return clips.filter((clip) => clip.trackId === trackId);
}

export function tracksForFocusedTimeline<T extends { id: string }>(
  tracks: readonly T[],
  focusedTrackId?: string,
): T[] {
  return focusedTrackId
    ? tracks.filter((track) => track.id === focusedTrackId)
    : [...tracks];
}
