import { isAudioTimelineTrack, type EditTimeline } from "./timeline";

export type TimelineGap = Readonly<{
  trackId: string;
  from: number;
  end: number;
  previousClipId: string | null;
  nextClipId: string | null;
}>;

export type TimelineGapWarning = TimelineGap &
  Readonly<{
    trackName: string;
    kind: "late" | "between" | "tail";
  }>;

/** Latest exclusive clip end; this is a structural hint, not pixel/content analysis. */
export function lastTimelineClipEnd(timeline: EditTimeline) {
  return timeline.clips.reduce(
    (end, clip) => Math.max(end, clip.from + clip.durationInFrames),
    0,
  );
}

/**
 * Returns the preview-only playback boundary. Choosing the last clip never
 * changes the saved project/export duration; an empty Timeline plays to the
 * project end so playback remains usable.
 */
export function timelinePlaybackEnd(
  timeline: EditTimeline,
  includeProjectTail = false,
) {
  return includeProjectTail || timeline.clips.length === 0
    ? timeline.durationInFrames
    : Math.max(1, lastTimelineClipEnd(timeline));
}

/** Find long intervals with no visual clip on any track; never changes duration. */
export function findLargeTimelineGaps(
  timeline: EditTimeline,
  thresholdFrames = timeline.fps * 5,
): TimelineGap[] {
  const gaps: TimelineGap[] = [];
  const audioTrackIds = new Set(
    timeline.tracks
      .filter((track) => isAudioTimelineTrack(timeline, track))
      .map((track) => track.id),
  );
  const hiddenTrackIds = new Set(
    timeline.tracks
      .filter((track) => track.visible === false)
      .map((track) => track.id),
  );
  const clips = timeline.clips
    .filter(
      (clip) =>
        clip.componentId !== "soundtrack" &&
        clip.componentId !== "audio" &&
        clip.componentId !== "narration" &&
        !audioTrackIds.has(clip.trackId) &&
        !hiddenTrackIds.has(clip.trackId),
    )
    .sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));
  if (!clips.length) return gaps;
  let cursor = 0;
  let previousClipId: string | null = null;
  for (const clip of clips) {
    if (clip.from - cursor >= thresholdFrames)
      gaps.push({
        trackId: "visual-composition",
        from: cursor,
        end: clip.from,
        previousClipId,
        nextClipId: clip.id,
      });
    if (clip.from + clip.durationInFrames > cursor) {
      cursor = clip.from + clip.durationInFrames;
      previousClipId = clip.id;
    }
  }
  if (timeline.durationInFrames - cursor >= thresholdFrames)
    gaps.push({
      trackId: "visual-composition",
      from: cursor,
      end: timeline.durationInFrames,
      previousClipId,
      nextClipId: null,
    });
  return gaps;
}

/** Editor-facing, non-destructive warnings for globally empty visual intervals. */
export function timelineGapWarnings(
  timeline: EditTimeline,
  thresholdFrames = 1,
): TimelineGapWarning[] {
  return findLargeTimelineGaps(timeline, thresholdFrames).map((gap) => ({
    ...gap,
    trackName: "all visual tracks",
    kind:
      gap.previousClipId === null && gap.nextClipId
        ? ("late" as const)
        : gap.previousClipId && gap.nextClipId
          ? ("between" as const)
          : ("tail" as const),
  }));
}
