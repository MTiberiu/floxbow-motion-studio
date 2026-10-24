import {
  parseEditTimeline,
  type EditTimeline,
  type TimelineScene,
} from "@motion/sdk/timeline";

export const MAX_SCENE_DURATION_FRAMES = 216_000;

export function createTimelineScene(
  document: EditTimeline,
  scene: TimelineScene,
  clipIds: readonly string[] = [],
): EditTimeline {
  if ((document.scenes?.length ?? 0) >= 256)
    throw new Error("A Timeline can contain at most 256 scenes.");
  const selected = new Set(clipIds);
  const existingIds = new Set((document.scenes ?? []).map((item) => item.id));
  if (existingIds.has(scene.id)) throw new Error("Scene ID already exists.");
  const sceneEnd = scene.from + scene.durationInFrames;
  if (
    scene.from < 0 ||
    scene.durationInFrames < 1 ||
    sceneEnd > MAX_SCENE_DURATION_FRAMES
  )
    throw new Error("Scene timing is outside supported project limits.");
  const scenes = [...(document.scenes ?? []), scene].sort(
    (left, right) => left.from - right.from,
  );
  const selectedClips = document.clips.filter((clip) => selected.has(clip.id));
  if (selectedClips.length !== selected.size)
    throw new Error("One or more selected clips no longer exist.");
  for (const clip of selectedClips) {
    if (clip.sceneId)
      throw new Error(`Clip ${clip.id} already belongs to a scene.`);
    if (clip.from < scene.from || clip.from + clip.durationInFrames > sceneEnd)
      throw new Error(`Clip ${clip.id} does not fit inside this scene.`);
  }
  const next: EditTimeline = {
    ...document,
    durationInFrames: Math.max(document.durationInFrames, sceneEnd),
    scenes,
    clips: document.clips.map((clip) =>
      selected.has(clip.id) ? { ...clip, sceneId: scene.id } : clip,
    ),
  };
  return parseEditTimeline(next);
}

export function renameTimelineScene(
  document: EditTimeline,
  sceneId: string,
  name: string,
): EditTimeline {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 100)
    throw new Error("Scene name must contain 1 to 100 characters.");
  if (!document.scenes?.some((scene) => scene.id === sceneId))
    throw new Error("Scene no longer exists.");
  return parseEditTimeline({
    ...document,
    scenes: document.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, name: cleanName } : scene,
    ),
  });
}

/** Resize one scene and ripple later scenes without stretching their contents. */
export function resizeTimelineScene(
  document: EditTimeline,
  sceneId: string,
  durationInFrames: number,
): EditTimeline {
  const scenes = document.scenes ?? [];
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) throw new Error("Scene no longer exists.");
  if (
    !Number.isInteger(durationInFrames) ||
    durationInFrames < 1 ||
    durationInFrames > MAX_SCENE_DURATION_FRAMES
  )
    throw new Error("Scene duration is outside supported project limits.");
  const target = scenes[index];
  const delta = durationInFrames - target.durationInFrames;
  const nextTargetEnd = target.from + durationInFrames;
  const following = scenes.slice(index + 1);
  if (following.length > 0 && nextTargetEnd > following[0].from + delta)
    throw new Error("Scene resize would overlap the following scene.");
  if (durationInFrames < target.durationInFrames) {
    const spill = document.clips.find(
      (clip) =>
        clip.sceneId === sceneId &&
        clip.from + clip.durationInFrames > nextTargetEnd,
    );
    if (spill)
      throw new Error(
        `Cannot shorten this scene because clip ${spill.id} extends past its new end. Move or trim that clip first.`,
      );
  }
  const nextScenes = scenes.map((scene, sceneIndex) =>
    sceneIndex === index
      ? { ...scene, durationInFrames }
      : sceneIndex > index
        ? { ...scene, from: scene.from + delta }
        : scene,
  );
  const movedSceneIds = new Set(following.map((scene) => scene.id));
  const clips = document.clips.map((clip) =>
    clip.sceneId && movedSceneIds.has(clip.sceneId)
      ? { ...clip, from: clip.from + delta }
      : clip,
  );
  const contentEnd = clips.reduce(
    (end, clip) => Math.max(end, clip.from + clip.durationInFrames),
    0,
  );
  const sceneEnd = nextScenes.reduce(
    (end, scene) => Math.max(end, scene.from + scene.durationInFrames),
    0,
  );
  const duration = Math.max(document.durationInFrames, contentEnd, sceneEnd);
  return parseEditTimeline({
    ...document,
    durationInFrames: duration,
    scenes: nextScenes,
    clips,
  });
}

export function sceneLocalFrame(scene: TimelineScene, globalFrame: number) {
  return globalFrame - scene.from;
}
