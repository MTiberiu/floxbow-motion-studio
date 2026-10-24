import type { ComponentInfo, TimelineBehavior } from "@motion/sdk/timeline";
import { subtitleTimelineBehavior } from "@motion/lyrics-sync/subtitles";

const genericBehavior: TimelineBehavior = { id: "generic-visual" };
export const videoTimelineBehavior: TimelineBehavior = {
  id: "core-video",
  resizeContent(content, oldRange, nextRange, fps) {
    const actualStart = Number(content.sourceStartSeconds ?? 0);
    const sourceDuration = Number(content.sourceDurationSeconds);
    const sourceStart = actualStart + (nextRange.from - oldRange.from) / fps;
    const sourceEnd = sourceStart + nextRange.durationInFrames / fps;
    const tolerance = 1 / fps;
    if (
      !Number.isFinite(sourceDuration) ||
      sourceStart < 0 ||
      sourceEnd > sourceDuration + tolerance
    )
      throw new Error(
        "The Video trim exceeds the registered MP4 source duration.",
      );
    return {
      ...content,
      sourceStartSeconds: Math.round(sourceStart * 1000) / 1000,
    };
  },
  editContent(content, key, value) {
    if (key !== "sourceStartSeconds") return undefined;
    const start = Number(value);
    const duration = Number(content.sourceDurationSeconds);
    if (!Number.isFinite(start) || start < 0 || start > duration)
      throw new Error("The source start time is outside the MP4 duration.");
    return { content: { ...content, sourceStartSeconds: start } };
  },
};
export const videoAudioTimelineBehavior: TimelineBehavior = {
  id: "core-video-audio",
  resizeContent(content, oldRange, nextRange, fps) {
    const actualStart = Number(content.sourceStartSeconds);
    const sourceDuration = Number(content.sourceDurationSeconds);
    const sourceStart = actualStart + (nextRange.from - oldRange.from) / fps;
    const sourceEnd = sourceStart + nextRange.durationInFrames / fps;
    if (
      !Number.isFinite(sourceDuration) ||
      !Number.isFinite(sourceStart) ||
      sourceStart < 0 ||
      sourceEnd > sourceDuration + 1 / fps
    )
      throw new Error(
        "The detached Video audio trim exceeds the registered MP4 source duration.",
      );
    return {
      ...content,
      sourceStartSeconds: Math.round(sourceStart * 1000) / 1000,
    };
  },
};
const trustedBehaviors = new Map<string, TimelineBehavior>([
  ["generic-visual", genericBehavior],
  [videoTimelineBehavior.id, videoTimelineBehavior],
  [videoAudioTimelineBehavior.id, videoAudioTimelineBehavior],
  [subtitleTimelineBehavior.id, subtitleTimelineBehavior],
]);

/** Resolve only built-in behavior IDs; metadata never supplies executable behavior code. */
export function resolveTimelineBehavior(
  componentId: string,
  components: readonly ComponentInfo[],
): TimelineBehavior {
  const info = components.find((component) => component.id === componentId);
  if (info?.timelineBehavior !== undefined)
    return trustedBehaviors.get(info.timelineBehavior) ?? genericBehavior;
  // Compatibility for existing projects/modules that predate behavior metadata.
  if (componentId === "subtitles") return subtitleTimelineBehavior;
  if (componentId === "video-audio") return videoAudioTimelineBehavior;
  return genericBehavior;
}
