import {
  parseEditTimeline,
  type EditTimeline,
  type TimelineBehavior,
} from "@motion/sdk/timeline";
import {
  changeClipRangeWithDurationExtension,
  MAX_TIMELINE_DURATION_FRAMES,
} from "./timeline-track-utils";

export function changeTimelineClipRangeWithRipple(
  document: EditTimeline,
  clipId: string,
  from: number,
  durationInFrames: number,
  trim: boolean,
  ripple: boolean,
  behavior?: TimelineBehavior,
): EditTimeline {
  const clip = document.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error("The clip being edited no longer exists.");
  const safeFrom = Math.max(0, Math.round(from));
  const safeDuration = Math.max(1, Math.round(durationInFrames));
  const oldEnd = clip.from + clip.durationInFrames;
  const newEnd = safeFrom + safeDuration;
  const delta = newEnd - oldEnd;
  if (!ripple || !trim || delta === 0 || clip.componentId === "soundtrack")
    return changeClipRangeWithDurationExtension(
      document,
      clipId,
      safeFrom,
      newEnd,
      trim,
      behavior,
    );

  const sameScope = (candidate: (typeof document.clips)[number]) =>
    candidate.id !== clip.id && candidate.sceneId === clip.sceneId;
  const downstream = document.clips.filter(
    (candidate) => sameScope(candidate) && candidate.from >= oldEnd,
  );
  const downstreamIds = new Set(downstream.map((candidate) => candidate.id));
  const boundaryOverlap = document.clips.find(
    (candidate) =>
      sameScope(candidate) &&
      candidate.from < oldEnd &&
      candidate.from + candidate.durationInFrames > oldEnd,
  );
  if (boundaryOverlap)
    throw new Error(
      `Ripple edit is ambiguous because clip ${boundaryOverlap.id} crosses the edit boundary.`,
    );
  for (const candidate of downstream) {
    const track = document.tracks.find((item) => item.id === candidate.trackId);
    if (track?.locked)
      throw new Error(
        `Ripple edit cannot move ${candidate.label} because track ${track.name} is locked.`,
      );
    const movedFrom = candidate.from + delta;
    if (movedFrom < 0)
      throw new Error(
        `Ripple edit would move ${candidate.label} before frame zero.`,
      );
    const collision = document.clips.find(
      (other) =>
        !downstreamIds.has(other.id) &&
        other.id !== clip.id &&
        other.sceneId === clip.sceneId &&
        other.trackId === candidate.trackId &&
        movedFrom < other.from + other.durationInFrames &&
        movedFrom + candidate.durationInFrames > other.from,
    );
    if (collision)
      throw new Error(
        `Ripple edit would overlap ${candidate.label} with ${collision.label} on the same track.`,
      );
  }

  let next: EditTimeline = structuredClone(document);
  const scene = clip.sceneId
    ? next.scenes?.find((item) => item.id === clip.sceneId)
    : undefined;
  if (scene && delta > 0) {
    const expandedEnd = Math.max(
      scene.from + scene.durationInFrames,
      newEnd,
      ...downstream.map(
        (candidate) => candidate.from + delta + candidate.durationInFrames,
      ),
    );
    const extension = expandedEnd - (scene.from + scene.durationInFrames);
    if (extension > 0) {
      const laterSceneIds = new Set(
        next.scenes
          ?.filter((item) => item.from >= scene.from + scene.durationInFrames)
          .map((item) => item.id),
      );
      next = {
        ...next,
        scenes: next.scenes?.map((item) =>
          laterSceneIds.has(item.id)
            ? { ...item, from: item.from + extension }
            : item,
        ),
        clips: next.clips.map((item) =>
          item.sceneId && laterSceneIds.has(item.sceneId)
            ? { ...item, from: item.from + extension }
            : item,
        ),
      };
      next.scenes = next.scenes?.map((item) =>
        item.id === scene.id
          ? { ...item, durationInFrames: item.durationInFrames + extension }
          : item,
      );
    }
  }
  const shiftedClipEnds = next.clips.map((candidate) =>
    downstreamIds.has(candidate.id)
      ? candidate.from + delta + candidate.durationInFrames
      : candidate.id === clipId
        ? newEnd
        : candidate.from + candidate.durationInFrames,
  );
  const shiftedSceneEnds = (next.scenes ?? []).map(
    (item) => item.from + item.durationInFrames,
  );
  const requiredDuration = Math.max(
    next.durationInFrames,
    ...shiftedClipEnds,
    ...shiftedSceneEnds,
  );
  if (requiredDuration > MAX_TIMELINE_DURATION_FRAMES)
    throw new Error("Ripple edit exceeds the maximum project duration.");
  next.durationInFrames = requiredDuration;
  next = changeClipRangeWithDurationExtension(
    next,
    clipId,
    safeFrom,
    newEnd,
    trim,
    behavior,
  );
  next = {
    ...next,
    clips: next.clips.map((candidate) =>
      downstreamIds.has(candidate.id)
        ? { ...candidate, from: candidate.from + delta }
        : candidate,
    ),
  };
  return parseEditTimeline({
    ...next,
    durationInFrames: Math.max(
      next.durationInFrames,
      ...next.clips.map(
        (candidate) => candidate.from + candidate.durationInFrames,
      ),
      ...(next.scenes ?? []).map((item) => item.from + item.durationInFrames),
    ),
  });
}
