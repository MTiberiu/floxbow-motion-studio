import type { EditTimeline } from "@motion/sdk/timeline";

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

/** Soundtrack clips remain fixed for the selected asset in the current editor. */
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
      candidate.trackId === clip.trackId &&
      candidate.from === clip.from &&
      candidate.durationInFrames === clip.durationInFrames &&
      candidate.content.assetId === clip.content.assetId
    );
  });
}
