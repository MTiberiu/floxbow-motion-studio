import type {
  ComponentInfo,
  EditTimeline,
  TimelineClip,
} from "@motion/sdk/timeline";
import { resolveTimelineBehavior } from "./timeline-behaviors";
import { MAX_TIMELINE_DURATION_FRAMES } from "./timeline-track-utils";

export type TimelineOperation =
  "move" | "copy" | "cut" | "paste" | "duplicate" | "delete";

export function canPerformTimelineOperation(
  clip: TimelineClip,
  operation: TimelineOperation,
  components: readonly ComponentInfo[],
) {
  if (clip.componentId === "soundtrack") return operation === "delete";
  return (
    resolveTimelineBehavior(clip.componentId, components).operations?.[
      operation
    ] !== false
  );
}

export function cloneTimelineClip(
  clip: TimelineClip,
  id: string,
  from: number,
  components: readonly ComponentInfo[],
) {
  const copy = structuredClone(clip);
  copy.id = id;
  copy.from = from;
  copy.label = `${clip.label} (copy)`;
  const behavior = resolveTimelineBehavior(clip.componentId, components);
  if (behavior.duplicateContent)
    copy.content = behavior.duplicateContent(clip.content, clip.id);
  return copy;
}

export function addTimelineClipCopy(
  document: EditTimeline,
  clip: TimelineClip,
  id: string,
  from: number,
  components: readonly ComponentInfo[],
  operation: "duplicate" | "paste" = "duplicate",
): EditTimeline {
  if (!canPerformTimelineOperation(clip, operation, components))
    throw new Error(`This clip does not allow ${operation}.`);
  if (document.clips.length >= 3000)
    throw new Error("The Timeline clip limit has been reached.");
  if (!document.tracks.some((track) => track.id === clip.trackId))
    throw new Error("The clip's original track is no longer available.");
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
    document.clips.some((item) => item.id === id)
  )
    throw new Error("The new clip ID is invalid or already in use.");
  const safeFrom = Math.max(0, Math.round(from));
  const end = safeFrom + clip.durationInFrames;
  if (end > MAX_TIMELINE_DURATION_FRAMES)
    throw new Error("The copy would exceed the maximum project duration.");
  const copy = cloneTimelineClip(clip, id, safeFrom, components);
  return {
    ...document,
    durationInFrames: Math.max(document.durationInFrames, end),
    clips: [...document.clips, copy],
  };
}

export function removeTimelineClip(
  document: EditTimeline,
  clip: TimelineClip,
  components: readonly ComponentInfo[],
) {
  if (!canPerformTimelineOperation(clip, "delete", components))
    throw new Error("This clip cannot be deleted from the Timeline.");
  return {
    ...document,
    clips: document.clips.filter((item) => item.id !== clip.id),
  };
}
