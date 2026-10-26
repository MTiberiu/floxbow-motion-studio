import {
  parseEditTimeline,
  visualAssetGroupSchema,
  type EditTimeline,
  type VisualAssetGroup,
} from "@motion/sdk/timeline";

export type PoseStudioImportStep = Readonly<{
  memberId: string;
  durationMs: number;
}>;

export type PoseStudioImportRequest = Readonly<{
  group: VisualAssetGroup;
  steps: readonly PoseStudioImportStep[];
  speed: number;
  sceneId?: string;
  startFrame: number;
  label: string;
}>;

export function addPoseStudioActionToTimeline(
  input: EditTimeline,
  request: PoseStudioImportRequest,
) {
  const timeline = parseEditTimeline(input);
  const group = visualAssetGroupSchema.parse(request.group);
  if (timeline.assetGroups?.some((item) => item.id === group.id))
    throw new Error("This imported pose group already exists in the project.");
  if (!request.steps.length || request.steps.length > 2_000)
    throw new Error(
      "The selected action must contain 1–2,000 animation frames.",
    );
  if (
    !Number.isFinite(request.speed) ||
    request.speed < 0.25 ||
    request.speed > 3
  )
    throw new Error("The action playback speed is invalid.");
  const members = new Set(
    group.members
      .filter((member) => member.role === "pose")
      .map((member) => member.id),
  );
  const durations = request.steps.map((step) => {
    if (!members.has(step.memberId))
      throw new Error(
        "An animation frame points to a pose outside its imported character.",
      );
    if (
      !Number.isFinite(step.durationMs) ||
      step.durationMs < 16 ||
      step.durationMs > 60_000
    )
      throw new Error("An animation frame has an invalid duration.");
    return Math.max(
      1,
      Math.round((step.durationMs * timeline.fps) / (1000 * request.speed)),
    );
  });
  const cycleFrames = durations.reduce((sum, value) => sum + value, 0);
  if (!Number.isInteger(request.startFrame) || request.startFrame < 0)
    throw new Error("Choose a valid start position on the Timeline.");

  const scene = request.sceneId
    ? timeline.scenes?.find((item) => item.id === request.sceneId)
    : undefined;
  if (request.sceneId && !scene)
    throw new Error(
      "The selected scene is no longer available. Refresh the scene list.",
    );
  if (
    scene &&
    (request.startFrame < scene.from ||
      request.startFrame >= scene.from + scene.durationInFrames)
  )
    throw new Error("The start position must be inside the selected scene.");

  const visualTrack = timeline.tracks.find(
    (track) =>
      track.kind !== "audio" &&
      !(track.kind === undefined && track.id === "audio") &&
      !track.locked,
  );
  if (!visualTrack)
    throw new Error(
      "Add or unlock a visual Timeline track before importing this action.",
    );

  const durationInFrames = cycleFrames;
  const sceneEnd = scene ? scene.from + scene.durationInFrames : undefined;
  if (sceneEnd !== undefined && request.startFrame + cycleFrames > sceneEnd)
    throw new Error("This action does not fit inside the selected scene.");
  if (request.startFrame + durationInFrames > 216_000)
    throw new Error(
      "The imported action would exceed the maximum Timeline duration.",
    );

  const poseEvents: Array<{
    id: string;
    atFrame: number;
    memberId: string;
  }> = [];
  let offset = 0;
  for (const [stepIndex, step] of request.steps.entries()) {
    poseEvents.push({
      id: `pose-${crypto.randomUUID()}`,
      atFrame: offset,
      memberId: step.memberId,
    });
    offset += durations[stepIndex];
  }
  if (!poseEvents.length)
    throw new Error(
      "The selected action does not fit at this Timeline position.",
    );

  const clipId = `character-${crypto.randomUUID()}`;
  const clip = {
    id: clipId,
    ...(scene ? { sceneId: scene.id } : {}),
    trackId: visualTrack.id,
    componentId: "character",
    label: request.label.slice(0, 200),
    from: request.startFrame,
    durationInFrames,
    content: {
      groupId: group.id,
      poseEvents,
      poseEventSpace: "clip",
      // Imported actions are reusable animation assets: repeat their one
      // compact cycle for the entire Timeline clip duration.
      loop: true,
      cycleFrames,
    },
    props: {
      x: 50,
      y: 90,
      width: 34,
      height: 66,
      rotation: 0,
      anchor: "bottom-center",
      opacity: 1,
      fit: "contain",
    },
  };
  const next = parseEditTimeline({
    ...timeline,
    durationInFrames: Math.max(
      timeline.durationInFrames,
      request.startFrame + durationInFrames,
    ),
    assetGroups: [...(timeline.assetGroups ?? []), group],
    clips: [...timeline.clips, clip],
  });
  return {
    timeline: next,
    clipId,
    durationInFrames,
    poseEventCount: poseEvents.length,
  };
}
