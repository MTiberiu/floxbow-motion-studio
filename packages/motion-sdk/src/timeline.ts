import { z } from "zod";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
export const clipSchema = z.object({
  id,
  trackId: id,
  /** Optional structural scene membership; legacy clips remain project-global. */
  sceneId: id.optional(),
  componentId: id,
  label: z.string().max(200),
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  content: z.record(z.string(), z.json()).default({}),
  props: z.record(z.string(), z.json()).default({}),
});
export const timelineSceneSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
});
export const sceneMomentSchema = z.object({
  id,
  sceneId: id,
  name: z.string().min(1).max(100),
  /** Frame offset from the owning scene's start. */
  atFrame: z.number().int().nonnegative(),
  characterStates: z
    .array(
      z.object({
        clipId: id,
        poseEventId: id,
      }),
    )
    .max(200),
});
export const visualAssetGroupMemberSchema = z.object({
  id,
  assetId: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  label: z.string().min(1).max(100),
  role: z.enum(["alternative", "pose"]).default("alternative"),
  offsetX: z.number().min(-100).max(100).default(0),
  offsetY: z.number().min(-100).max(100).default(0),
  /** Stable source pose identity when imported from a reusable pose library. */
  sourcePoseId: id.optional(),
});
export const visualAssetGroupSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  category: z.enum(["characters", "backgrounds", "props", "other"]),
  members: z.array(visualAssetGroupMemberSchema).min(1).max(100),
  /** Provenance for explicitly imported reusable pose-library actions. */
  source: z
    .object({
      kind: z.literal("pose-studio"),
      characterId: id,
      sheetId: id,
      comboId: id,
    })
    .strict()
    .optional(),
});
export const timelineTrackSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  /** Omitted on legacy v1 projects; soundtrack tracks are inferred by clip ID. */
  kind: z.enum(["visual", "audio"]).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});
export const editTimelineSchema = z
  .object({
    version: z.literal(1),
    fps: z.number().int().min(1).max(120),
    durationInFrames: z.number().int().min(1).max(216000),
    /** Missing means legacy array-order stacking. New editor actions use top-down visual rows. */
    trackOrder: z.enum(["legacy", "top-down"]).optional(),
    /** Optional scene row metadata; absent on existing Timeline v1 projects. */
    scenes: z.array(timelineSceneSchema).max(256).optional(),
    /** Named scene bookmarks referencing actual character pose events. */
    sceneMoments: z.array(sceneMomentSchema).max(2000).optional(),
    /** Organizer metadata references registered assets; it does not duplicate files or Timeline clips. */
    assetGroups: z.array(visualAssetGroupSchema).max(200).optional(),
    tracks: z.array(timelineTrackSchema).min(1).max(32),
    clips: z.array(clipSchema).max(3000),
  })
  .superRefine((t, ctx) => {
    const tracks = new Set(t.tracks.map((t) => t.id));
    const clips = new Set(t.clips.map((c) => c.id));
    const scenes = new Set((t.scenes ?? []).map((scene) => scene.id));
    if (tracks.size !== t.tracks.length || clips.size !== t.clips.length)
      ctx.addIssue({ code: "custom", message: "Duplicate track or clip IDs" });
    if (scenes.size !== (t.scenes ?? []).length)
      ctx.addIssue({ code: "custom", message: "Duplicate scene IDs" });
    const assetGroups = t.assetGroups ?? [];
    if (
      new Set(assetGroups.map((group) => group.id)).size !== assetGroups.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate asset group IDs" });
    for (const [groupIndex, group] of assetGroups.entries()) {
      if (
        new Set(group.members.map((member) => member.id)).size !==
        group.members.length
      )
        ctx.addIssue({
          code: "custom",
          path: ["assetGroups", groupIndex, "members"],
          message: `Duplicate member IDs in asset group ${group.id}`,
        });
    }
    let previousSceneEnd = 0;
    for (const [index, scene] of (t.scenes ?? []).entries()) {
      const end = scene.from + scene.durationInFrames;
      if (end > t.durationInFrames)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index],
          message: `Scene ${scene.id} exceeds project duration`,
        });
      if (index > 0 && scene.from < previousSceneEnd)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "from"],
          message: "Scenes must be ordered and cannot overlap",
        });
      previousSceneEnd = end;
    }
    for (const c of t.clips) {
      if (!tracks.has(c.trackId))
        ctx.addIssue({
          code: "custom",
          message: `Unknown track: ${c.trackId}`,
        });
      if (c.from + c.durationInFrames > t.durationInFrames)
        ctx.addIssue({
          code: "custom",
          message: `Clip ${c.id} exceeds project duration`,
        });
      if (c.sceneId) {
        const scene = (t.scenes ?? []).find((item) => item.id === c.sceneId);
        if (!scene)
          ctx.addIssue({
            code: "custom",
            path: ["clips", c.id, "sceneId"],
            message: `Unknown scene: ${c.sceneId}`,
          });
        else if (
          c.from < scene.from ||
          c.from + c.durationInFrames > scene.from + scene.durationInFrames
        )
          ctx.addIssue({
            code: "custom",
            path: ["clips", c.id],
            message: `Clip ${c.id} exceeds scene ${scene.id} boundaries`,
          });
      }
      if (c.componentId === "character") {
        const groupId = c.content.groupId;
        const group =
          typeof groupId === "string"
            ? assetGroups.find((item) => item.id === groupId)
            : undefined;
        if (!group)
          ctx.addIssue({
            code: "custom",
            path: ["clips", c.id, "content", "groupId"],
            message: `Character clip ${c.id} references an unknown asset group`,
          });
        const track = t.tracks.find((item) => item.id === c.trackId);
        if (
          track?.kind === "audio" ||
          (track?.kind === undefined && track?.id === "audio")
        )
          ctx.addIssue({
            code: "custom",
            path: ["clips", c.id, "trackId"],
            message: "Character clips must use a visual track",
          });
        const events = c.content.poseEvents;
        if (events !== undefined && !Array.isArray(events))
          ctx.addIssue({
            code: "custom",
            path: ["clips", c.id, "content", "poseEvents"],
            message: "Character poseEvents must be an array",
          });
        if (Array.isArray(events)) {
          const eventIds = new Set<string>();
          let previousFrame = -1;
          const scene = c.sceneId
            ? (t.scenes ?? []).find((item) => item.id === c.sceneId)
            : undefined;
          const clipLocalEvents = c.content.poseEventSpace === "clip";
          const sceneStart =
            scene && !clipLocalEvents ? c.from - scene.from : 0;
          const maxFrame =
            clipLocalEvents || !scene
              ? c.durationInFrames
              : scene.durationInFrames;
          events.forEach((rawEvent, eventIndex) => {
            if (
              !rawEvent ||
              typeof rawEvent !== "object" ||
              Array.isArray(rawEvent)
            ) {
              ctx.addIssue({
                code: "custom",
                path: ["clips", c.id, "content", "poseEvents", eventIndex],
                message: "Character pose event must be an object",
              });
              return;
            }
            const event = rawEvent as Record<string, unknown>;
            const eventId = event.id;
            const atFrame = event.atFrame;
            const memberId = event.memberId;
            if (
              typeof eventId !== "string" ||
              !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId) ||
              eventIds.has(eventId)
            )
              ctx.addIssue({
                code: "custom",
                path: [
                  "clips",
                  c.id,
                  "content",
                  "poseEvents",
                  eventIndex,
                  "id",
                ],
                message: "Character pose event IDs must be valid and unique",
              });
            else eventIds.add(eventId);
            if (
              typeof atFrame !== "number" ||
              !Number.isInteger(atFrame) ||
              atFrame < sceneStart ||
              atFrame >= maxFrame ||
              atFrame <= previousFrame
            )
              ctx.addIssue({
                code: "custom",
                path: [
                  "clips",
                  c.id,
                  "content",
                  "poseEvents",
                  eventIndex,
                  "atFrame",
                ],
                message:
                  "Character pose events must be ordered unique frames within their clip or scene",
              });
            if (typeof atFrame === "number") previousFrame = atFrame;
            if (
              group &&
              (typeof memberId !== "string" ||
                !group.members.some(
                  (member) => member.id === memberId && member.role === "pose",
                ))
            )
              ctx.addIssue({
                code: "custom",
                path: [
                  "clips",
                  c.id,
                  "content",
                  "poseEvents",
                  eventIndex,
                  "memberId",
                ],
                message:
                  "Character pose events must reference a pose member in their asset group",
              });
          });
        }
      }
    }
    const sceneMoments = t.sceneMoments ?? [];
    if (
      new Set(sceneMoments.map((moment) => moment.id)).size !==
      sceneMoments.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate Scene Moment IDs" });
    for (const [momentIndex, moment] of sceneMoments.entries()) {
      const scene = (t.scenes ?? []).find((item) => item.id === moment.sceneId);
      if (!scene) {
        ctx.addIssue({
          code: "custom",
          path: ["sceneMoments", momentIndex, "sceneId"],
          message: `Unknown Scene Moment scene: ${moment.sceneId}`,
        });
        continue;
      }
      if (moment.atFrame >= scene.durationInFrames)
        ctx.addIssue({
          code: "custom",
          path: ["sceneMoments", momentIndex, "atFrame"],
          message: `Scene Moment ${moment.id} is outside its scene`,
        });
      if (
        new Set(moment.characterStates.map((state) => state.clipId)).size !==
        moment.characterStates.length
      )
        ctx.addIssue({
          code: "custom",
          path: ["sceneMoments", momentIndex, "characterStates"],
          message: `Scene Moment ${moment.id} contains duplicate character clips`,
        });
      for (const [stateIndex, state] of moment.characterStates.entries()) {
        const clip = t.clips.find((item) => item.id === state.clipId);
        const event = Array.isArray(clip?.content.poseEvents)
          ? clip.content.poseEvents.find(
              (candidate) =>
                candidate &&
                typeof candidate === "object" &&
                !Array.isArray(candidate) &&
                candidate.id === state.poseEventId,
            )
          : undefined;
        if (
          !clip ||
          clip.componentId !== "character" ||
          clip.sceneId !== moment.sceneId ||
          !event ||
          typeof event !== "object" ||
          Array.isArray(event) ||
          typeof event.atFrame !== "number" ||
          event.atFrame > moment.atFrame
        )
          ctx.addIssue({
            code: "custom",
            path: ["sceneMoments", momentIndex, "characterStates", stateIndex],
            message: `Scene Moment ${moment.id} must reference a character pose already active in its scene`,
          });
      }
    }
  });
export type EditTimeline = z.infer<typeof editTimelineSchema>;
export type TimelineClip = z.infer<typeof clipSchema>;
export type TimelineTrack = z.infer<typeof timelineTrackSchema>;
export type TimelineScene = z.infer<typeof timelineSceneSchema>;
export type SceneMoment = z.infer<typeof sceneMomentSchema>;
export type VisualAssetGroup = z.infer<typeof visualAssetGroupSchema>;
export type VisualAssetGroupMember = z.infer<
  typeof visualAssetGroupMemberSchema
>;

export function isAudioTimelineTrack(
  timeline: Pick<EditTimeline, "tracks" | "clips">,
  track: TimelineTrack,
) {
  return (
    track.kind === "audio" ||
    (track.kind === undefined &&
      (track.id === "audio" ||
        timeline.clips.some(
          (clip) =>
            clip.trackId === track.id && clip.componentId === "soundtrack",
        )))
  );
}

/** Visual draw order: legacy is unchanged; top-down projects draw bottom rows first. */
export function visualTracksInRenderOrder(timeline: EditTimeline) {
  const tracks = timeline.tracks.filter(
    (track) => !isAudioTimelineTrack(timeline, track),
  );
  return timeline.trackOrder === "top-down" ? tracks.slice().reverse() : tracks;
}
export const fieldSchema = z.object({
  key: id,
  label: z.string().max(100),
  target: z.enum(["content", "props"]).default("props"),
  type: z.enum(["text", "number", "color", "select", "boolean"]),
  default: z.union([z.string(), z.number(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  options: z.array(z.string()).max(50).optional(),
});
export const canvasElementContractSchema = z
  .object({
    owner: z
      .string()
      .regex(/^[a-z][a-z0-9.-]*$/)
      .max(100)
      .optional(),
    coordinateSpace: z
      .literal("composition-percent")
      .default("composition-percent"),
    transform: z
      .object({
        x: id,
        y: id,
        width: id,
        height: id,
        rotation: id.optional(),
        anchor: id.optional(),
      })
      .strict(),
    operations: z
      .object({ move: z.boolean(), resize: z.boolean(), rotate: z.boolean() })
      .strict(),
    resizeMode: z.enum(["free", "preserve-aspect"]).default("free"),
    resizeScaleFields: z.array(id).max(10).optional(),
    lockedField: id.optional(),
    visibilityField: id.optional(),
    visibleValues: z.array(z.string().max(100)).max(50).optional(),
  })
  .strict();
export const componentInfoSchema = z
  .object({
    id,
    name: z.string().max(100),
    fields: z.array(fieldSchema).max(50),
    timelineBehavior: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .max(80)
      .optional(),
    canvas: canvasElementContractSchema.optional(),
  })
  .superRefine((info, ctx) => {
    const contract = info.canvas;
    if (!contract) return;
    const mapped: [string, string, "number" | "select" | "boolean"][] = [
      ["x", contract.transform.x, "number"],
      ["y", contract.transform.y, "number"],
      ["width", contract.transform.width, "number"],
      ["height", contract.transform.height, "number"],
    ];
    if (contract.transform.rotation)
      mapped.push(["rotation", contract.transform.rotation, "number"]);
    if (contract.transform.anchor)
      mapped.push(["anchor", contract.transform.anchor, "select"]);
    if (contract.lockedField)
      mapped.push(["lockedField", contract.lockedField, "boolean"]);
    for (const [key, fieldKey, type] of mapped) {
      const field = info.fields.find((candidate) => candidate.key === fieldKey);
      if (!field)
        ctx.addIssue({
          code: "custom",
          path: ["canvas", key],
          message: `Canvas ${key} must reference a declared editable field`,
        });
      else if (field.type !== type)
        ctx.addIssue({
          code: "custom",
          path: ["canvas", key],
          message: `Canvas ${key} must reference a ${type} field`,
        });
    }
    if (contract.visibilityField) {
      const visibility = info.fields.find(
        (candidate) => candidate.key === contract.visibilityField,
      );
      if (!visibility)
        ctx.addIssue({
          code: "custom",
          path: ["canvas", "visibilityField"],
          message: "Canvas visibility must reference a declared editable field",
        });
      else if (visibility.type !== "boolean" && visibility.type !== "select")
        ctx.addIssue({
          code: "custom",
          path: ["canvas", "visibilityField"],
          message: "Canvas visibility must reference a boolean or select field",
        });
      else if (
        visibility.type === "select" &&
        (!contract.visibleValues?.length ||
          contract.visibleValues.some(
            (value) => !visibility.options?.includes(value),
          ))
      )
        ctx.addIssue({
          code: "custom",
          path: ["canvas", "visibleValues"],
          message:
            "Canvas select visibility must declare permitted visible values",
        });
    }
    if (contract.operations.rotate && !contract.transform.rotation)
      ctx.addIssue({
        code: "custom",
        path: ["canvas", "operations", "rotate"],
        message: "Rotation requires a rotation field",
      });
  });
export const componentInfosSchema = z.array(componentInfoSchema).max(100);
export type ComponentInfo = z.infer<typeof componentInfoSchema>;
export type EditableField = z.infer<typeof fieldSchema>;
export type TimelineRange = { from: number; durationInFrames: number };
/** Convert a canonical frame index to project seconds. Frames remain the stored value. */
export function frameToSeconds(frame: number, fps: number) {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0)
    throw new Error("Frame and FPS must be finite, and FPS must be positive.");
  return frame / fps;
}
/** Convert a user-entered project time to the nearest canonical frame. */
export function secondsToFrame(seconds: number, fps: number) {
  if (!Number.isFinite(seconds) || !Number.isFinite(fps) || fps <= 0)
    throw new Error("Time and FPS must be finite, and FPS must be positive.");
  return Math.max(0, Math.round(seconds * fps));
}
/** Compact human-readable time, while preserving integer frames in project data. */
export function formatFrameTime(frame: number, fps: number) {
  const milliseconds = Math.max(
    0,
    Math.round(frameToSeconds(frame, fps) * 1000),
  );
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const fraction = milliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}
/** Trusted editor-side behavior hooks. Only serializable IDs cross the preview bridge. */
export type TimelineBehavior = {
  id: string;
  /** Shared editor operations a component permits; omitted operations are allowed. */
  operations?: Partial<
    Record<"move" | "copy" | "cut" | "paste" | "duplicate" | "delete", boolean>
  >;
  resizeContent?: (
    content: TimelineClip["content"],
    oldRange: TimelineRange,
    nextRange: TimelineRange,
    fps: number,
  ) => TimelineClip["content"];
  duplicateContent?: (
    content: TimelineClip["content"],
    sourceId: string,
  ) => TimelineClip["content"];
  editContent?: (
    content: TimelineClip["content"],
    key: string,
    value: string | number | boolean,
  ) => { content: TimelineClip["content"]; notice?: string } | undefined;
};
export function parseEditTimeline(
  input: unknown,
  expected?: { fps: number; durationInFrames: number },
) {
  const t = editTimelineSchema.parse(input);
  if (
    expected &&
    (t.fps !== expected.fps || t.durationInFrames !== expected.durationInFrames)
  )
    throw new Error("Timeline FPS and duration must match project.json");
  return t;
}
/** Generic range changes preserve content; registered behavior may transform it for trims. */
export function changeClipRange(
  t: EditTimeline,
  id: string,
  from: number,
  end: number,
  trim = false,
  behavior?: TimelineBehavior,
): EditTimeline {
  const next = structuredClone(t);
  const c = next.clips.find((c) => c.id === id);
  if (!c) return t;
  from = Math.max(0, Math.min(t.durationInFrames - 1, Math.round(from)));
  end = Math.max(from + 1, Math.min(t.durationInFrames, Math.round(end)));
  if (trim && behavior?.resizeContent)
    c.content = behavior.resizeContent(
      c.content,
      { from: c.from, durationInFrames: c.durationInFrames },
      { from, durationInFrames: end - from },
      t.fps,
    );
  c.from = from;
  c.durationInFrames = end - from;
  return parseEditTimeline(next);
}
export function fieldValue(clip: TimelineClip, field: EditableField) {
  return clip[field.target][field.key] ?? field.default;
}
export function validateField(field: EditableField, value: unknown) {
  if (field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    )
      throw new Error(`Invalid ${field.label}`);
  } else if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`Invalid ${field.label}`);
  } else {
    if (typeof value !== "string" || value.length > 20000)
      throw new Error(`Invalid ${field.label}`);
    if (field.type === "select" && !field.options?.includes(value))
      throw new Error(`Invalid ${field.label}`);
    if (field.type === "color" && !/^#[0-9a-f]{6}$/i.test(value))
      throw new Error(`Invalid ${field.label}`);
  }
  return value as string | number | boolean;
}
