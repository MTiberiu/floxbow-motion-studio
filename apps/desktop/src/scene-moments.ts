import {
  parseEditTimeline,
  type EditTimeline,
  type SceneMoment,
} from "@motion/sdk/timeline";

export function createSceneMoment(
  document: EditTimeline,
  sceneId: string,
  globalFrame: number,
  name: string,
): EditTimeline {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 100)
    throw new Error("Scene Moment name must contain 1 to 100 characters.");
  const scene = document.scenes?.find((item) => item.id === sceneId);
  if (!scene) throw new Error("Scene no longer exists.");
  if (
    !Number.isInteger(globalFrame) ||
    globalFrame < scene.from ||
    globalFrame >= scene.from + scene.durationInFrames
  )
    throw new Error("Move the playhead inside the selected scene first.");
  const atFrame = globalFrame - scene.from;
  const characterStates = document.clips.flatMap((clip) => {
    if (clip.componentId !== "character" || clip.sceneId !== sceneId) return [];
    const events = Array.isArray(clip.content.poseEvents)
      ? (clip.content.poseEvents as Array<{
          id: string;
          atFrame: number;
        }>)
      : [];
    const event = events
      .filter((candidate) => candidate.atFrame <= atFrame)
      .at(-1);
    return event ? [{ clipId: clip.id, poseEventId: event.id }] : [];
  });
  const moment: SceneMoment = {
    id: `moment-${crypto.randomUUID()}`,
    sceneId,
    name: cleanName,
    atFrame,
    characterStates,
  };
  return parseEditTimeline({
    ...document,
    sceneMoments: [...(document.sceneMoments ?? []), moment],
  });
}

export function renameSceneMoment(
  document: EditTimeline,
  momentId: string,
  name: string,
): EditTimeline {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 100)
    throw new Error("Scene Moment name must contain 1 to 100 characters.");
  if (!document.sceneMoments?.some((moment) => moment.id === momentId))
    throw new Error("Scene Moment no longer exists.");
  return parseEditTimeline({
    ...document,
    sceneMoments: document.sceneMoments.map((moment) =>
      moment.id === momentId ? { ...moment, name: cleanName } : moment,
    ),
  });
}

export function removeSceneMoment(
  document: EditTimeline,
  momentId: string,
): EditTimeline {
  return parseEditTimeline({
    ...document,
    sceneMoments: (document.sceneMoments ?? []).filter(
      (moment) => moment.id !== momentId,
    ),
  });
}
