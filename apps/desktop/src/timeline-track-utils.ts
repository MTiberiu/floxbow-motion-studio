import type { EditTimeline } from "@motion/sdk/timeline";
import { changeClipRange, type TimelineBehavior } from "@motion/sdk/timeline";

export const MAX_TIMELINE_DURATION_FRAMES = 216_000;

/** Move or trim a clip, extending the document when needed without shrinking it. */
export function changeClipRangeWithDurationExtension(
  document: EditTimeline,
  clipId: string,
  from: number,
  end: number,
  trim = false,
  behavior?: TimelineBehavior,
) {
  const safeFrom = Math.max(0, Math.round(from));
  const safeEnd = Math.max(safeFrom + 1, Math.round(end));
  if (safeEnd > MAX_TIMELINE_DURATION_FRAMES)
    throw new Error("The maximum project duration has been reached.");
  const extended = {
    ...document,
    durationInFrames: Math.max(document.durationInFrames, safeEnd),
  };
  return changeClipRange(extended, clipId, safeFrom, safeEnd, trim, behavior);
}

export function subtitleTrackId(
  document: EditTimeline,
  preferredTrackId?: string,
) {
  const soundtrackTrackIds = new Set(
    document.clips
      .filter((clip) => clip.componentId === "soundtrack")
      .map((clip) => clip.trackId),
  );
  const isAudioTrack = (trackId: string) => {
    const track = document.tracks.find((candidate) => candidate.id === trackId);
    return (
      soundtrackTrackIds.has(trackId) ||
      Boolean(track && /^(audio|soundtrack)$/i.test(track.name.trim()))
    );
  };
  return (
    document.tracks.find((track) =>
      /^(captions|subtitles|lyrics)$/i.test(track.name.trim()),
    )?.id ??
    (preferredTrackId && !isAudioTrack(preferredTrackId)
      ? preferredTrackId
      : undefined) ??
    document.tracks.find((track) => !isAudioTrack(track.id))?.id ??
    document.tracks.at(-1)!.id
  );
}

/** Soundtrack stays at frame zero with its selected source and full duration. */
export function soundtrackTimingUnchanged(
  current: EditTimeline,
  next: EditTimeline,
) {
  const existing = current.clips.filter(
    (clip) => clip.componentId === "soundtrack",
  );
  const proposed = next.clips.filter(
    (clip) => clip.componentId === "soundtrack",
  );
  if (existing.length !== proposed.length) return false;

  const proposedById = new Map(proposed.map((clip) => [clip.id, clip]));
  return existing.every((clip) => {
    const candidate = proposedById.get(clip.id);
    return (
      candidate !== undefined &&
      candidate.from === clip.from &&
      candidate.trackId === clip.trackId &&
      candidate.durationInFrames === clip.durationInFrames &&
      candidate.content.assetId === clip.content.assetId
    );
  });
}
