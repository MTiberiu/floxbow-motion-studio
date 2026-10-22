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
