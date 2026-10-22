import type { EditTimeline } from "./timeline";

export type TimelineGap = Readonly<{
  trackId: string;
  from: number;
  end: number;
  previousClipId: string | null;
  nextClipId: string | null;
}>;

/** Latest exclusive clip end; this is a structural hint, not pixel/content analysis. */
export function lastTimelineClipEnd(timeline: EditTimeline) {
  return timeline.clips.reduce(
    (end, clip) => Math.max(end, clip.from + clip.durationInFrames),
    0,
  );
}

/** Find long empty intervals per occupied track; never changes duration. */
export function findLargeTimelineGaps(
  timeline: EditTimeline,
  thresholdFrames = timeline.fps * 5,
): TimelineGap[] {
  const gaps: TimelineGap[] = [];
  for (const track of timeline.tracks) {
    const clips = timeline.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));
    if (!clips.length) continue;
    let cursor = 0;
    let previousClipId: string | null = null;
    for (const clip of clips) {
      if (clip.from - cursor >= thresholdFrames)
        gaps.push({
          trackId: track.id,
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
        trackId: track.id,
        from: cursor,
        end: timeline.durationInFrames,
        previousClipId,
        nextClipId: null,
      });
  }
  return gaps;
}
