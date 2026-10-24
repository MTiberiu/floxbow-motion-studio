import {
  isAudioTimelineTrack,
  type EditTimeline,
  type TimelineClip,
  type TimelineTrack,
} from "@motion/sdk/timeline";
import { changeClipRange, type TimelineBehavior } from "@motion/sdk/timeline";

export const MAX_TIMELINE_DURATION_FRAMES = 216_000;

export function isAudioTrack(document: EditTimeline, track: TimelineTrack) {
  return (
    isAudioTimelineTrack(document, track) ||
    (track.kind === undefined &&
      /^(audio|soundtrack)$/i.test(track.name.trim()))
  );
}

export function isAudioTimelineClip(clip: Pick<TimelineClip, "componentId">) {
  return (
    clip.componentId === "soundtrack" || clip.componentId === "video-audio"
  );
}

/** Convert legacy bottom-row-on-top stacking without changing the rendered result. */
export function normalizeTopDownTracks(document: EditTimeline): EditTimeline {
  if (document.trackOrder === "top-down") return document;
  const visuals = document.tracks.filter(
    (track) => !isAudioTrack(document, track),
  );
  const audio = document.tracks.filter((track) =>
    isAudioTrack(document, track),
  );
  return {
    ...document,
    trackOrder: "top-down",
    tracks: [
      ...visuals
        .slice()
        .reverse()
        .map((track) => ({ ...track, kind: "visual" as const })),
      ...audio.map((track) => ({ ...track, kind: "audio" as const })),
    ],
  };
}

export function reorderTimelineTrack(
  document: EditTimeline,
  trackId: string,
  direction: -1 | 1,
): EditTimeline {
  const normalized = normalizeTopDownTracks(document);
  const track = normalized.tracks.find((item) => item.id === trackId);
  if (!track) return document;
  const audio = isAudioTrack(normalized, track);
  const compatible = normalized.tracks.filter(
    (item) => isAudioTrack(normalized, item) === audio,
  );
  const index = compatible.findIndex((item) => item.id === trackId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= compatible.length) return normalized;
  const target = compatible[nextIndex];
  const tracks = normalized.tracks.slice();
  const trackIndex = tracks.findIndex((item) => item.id === trackId);
  const targetIndex = tracks.findIndex((item) => item.id === target.id);
  [tracks[trackIndex], tracks[targetIndex]] = [
    tracks[targetIndex],
    tracks[trackIndex],
  ];
  return { ...normalized, tracks };
}

export function createVisualTimelineTrack(
  document: EditTimeline,
  id: string,
  name: string,
  position: "top" | "bottom" = "top",
): EditTimeline {
  if (document.tracks.length >= 32)
    throw new Error("The Timeline track limit has been reached.");
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
    document.tracks.some((t) => t.id === id)
  )
    throw new Error("The new Timeline track ID is invalid or already in use.");
  const normalized = normalizeTopDownTracks(document);
  const cleanName = name.trim().slice(0, 100);
  if (!cleanName) throw new Error("A Timeline track needs a name.");
  const visuals = normalized.tracks.filter(
    (track) => !isAudioTrack(normalized, track),
  );
  const audio = normalized.tracks.filter((track) =>
    isAudioTrack(normalized, track),
  );
  const created: TimelineTrack = { id, name: cleanName, kind: "visual" };
  return {
    ...normalized,
    tracks:
      position === "top"
        ? [created, ...visuals, ...audio]
        : [...visuals, created, ...audio],
  };
}

/** Add an empty audio row after existing audio rows, keeping visual rows grouped above. */
export function createAudioTimelineTrack(
  document: EditTimeline,
  id: string,
  name: string,
): EditTimeline {
  if (document.tracks.length >= 32)
    throw new Error("The Timeline track limit has been reached.");
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
    document.tracks.some((t) => t.id === id)
  )
    throw new Error("The new Timeline track ID is invalid or already in use.");
  const normalized = normalizeTopDownTracks(document);
  const cleanName = name.trim().slice(0, 100);
  if (!cleanName) throw new Error("A Timeline track needs a name.");
  return {
    ...normalized,
    tracks: [...normalized.tracks, { id, name: cleanName, kind: "audio" }],
  };
}

export function moveTimelineClipsToTrack(
  document: EditTimeline,
  clipIds: readonly string[],
  trackId: string,
): EditTimeline {
  const target = document.tracks.find((track) => track.id === trackId);
  if (!target)
    throw new Error("The destination Timeline track no longer exists.");
  if (target.locked)
    throw new Error("Unlock this Timeline track before moving clips into it.");
  const ids = new Set(clipIds);
  if (!ids.size) return document;
  const targetIsAudio = isAudioTrack(document, target);
  const clips = document.clips.map((clip) => {
    if (!ids.has(clip.id)) return clip;
    const source = document.tracks.find((track) => track.id === clip.trackId);
    if (!source || isAudioTrack(document, source) !== targetIsAudio)
      throw new Error("Clips can only move between tracks of the same type.");
    if (source.locked)
      throw new Error("Unlock the source Timeline track before moving clips.");
    if (clip.componentId === "soundtrack" && !targetIsAudio)
      throw new Error("The soundtrack cannot be moved to a visual track.");
    return { ...clip, trackId };
  });
  if (clips.filter((clip) => ids.has(clip.id)).length !== ids.size)
    throw new Error("One or more selected Timeline clips no longer exist.");
  return { ...document, clips };
}

/** Move the fixed soundtrack vertically without changing its source or timing. */
export function moveSoundtrackToAudioTrack(
  document: EditTimeline,
  clipId: string,
  trackId: string,
): EditTimeline {
  const clip = document.clips.find(
    (item) => item.id === clipId && item.componentId === "soundtrack",
  );
  const source = clip
    ? document.tracks.find((track) => track.id === clip.trackId)
    : undefined;
  const destination = document.tracks.find((track) => track.id === trackId);
  if (!clip || !source || !destination || !isAudioTrack(document, destination))
    throw new Error("Choose an existing audio track for the soundtrack.");
  if (source.locked || destination.locked)
    throw new Error("Unlock both audio tracks before moving the soundtrack.");
  return {
    ...document,
    clips: document.clips.map((item) =>
      item.id === clipId ? { ...item, trackId } : item,
    ),
  };
}

/** Reject edits that alter, remove, or add clips on a locked track. */
export function lockedTrackEditError(
  current: EditTimeline,
  next: EditTimeline,
): string | undefined {
  const currentById = new Map(current.clips.map((clip) => [clip.id, clip]));
  const nextById = new Map(next.clips.map((clip) => [clip.id, clip]));
  for (const clip of current.clips) {
    const sourceTrack = current.tracks.find(
      (track) => track.id === clip.trackId,
    );
    const destination = nextById.get(clip.id);
    const destinationTrack = destination
      ? next.tracks.find((track) => track.id === destination.trackId)
      : undefined;
    if (
      (sourceTrack?.locked || destinationTrack?.locked) &&
      (!destination || JSON.stringify(clip) !== JSON.stringify(destination))
    )
      return `Unlock the ${sourceTrack?.name ?? "source"} Timeline track before editing its clips.`;
  }
  for (const clip of next.clips) {
    if (currentById.has(clip.id)) continue;
    const track = next.tracks.find((item) => item.id === clip.trackId);
    if (track?.locked)
      return `Unlock the ${track.name} Timeline track before adding clips.`;
  }
  return undefined;
}

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
  const editableVisual = document.tracks.filter(
    (track) => !isAudioTrack(document, track) && !track.locked,
  );
  return (
    editableVisual.find((track) =>
      /^(captions|subtitles|lyrics)$/i.test(track.name.trim()),
    )?.id ??
    (preferredTrackId &&
    editableVisual.some((track) => track.id === preferredTrackId)
      ? preferredTrackId
      : undefined) ??
    editableVisual[0]?.id ??
    document.tracks.find((track) => !isAudioTrack(document, track))?.id ??
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
  if (proposed.length > existing.length) return false;
  const existingById = new Map(existing.map((clip) => [clip.id, clip]));
  if (proposed.some((clip) => !existingById.has(clip.id))) return false;
  const proposedById = new Map(proposed.map((clip) => [clip.id, clip]));
  return existing.every((clip) => {
    const candidate = proposedById.get(clip.id);
    if (!candidate) return true;
    const destination = candidate
      ? next.tracks.find((track) => track.id === candidate.trackId)
      : undefined;
    return (
      candidate !== undefined &&
      candidate.from === clip.from &&
      candidate.durationInFrames === clip.durationInFrames &&
      candidate.content.assetId === clip.content.assetId &&
      destination !== undefined &&
      isAudioTrack(next, destination)
    );
  });
}
