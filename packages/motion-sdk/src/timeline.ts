import { z } from "zod";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
export const clipSchema = z.object({
  id,
  trackId: id,
  componentId: id,
  label: z.string().max(200),
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  content: z.record(z.string(), z.json()).default({}),
  props: z.record(z.string(), z.json()).default({}),
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
    tracks: z.array(timelineTrackSchema).min(1).max(32),
    clips: z.array(clipSchema).max(3000),
  })
  .superRefine((t, ctx) => {
    const tracks = new Set(t.tracks.map((t) => t.id));
    const clips = new Set(t.clips.map((c) => c.id));
    if (tracks.size !== t.tracks.length || clips.size !== t.clips.length)
      ctx.addIssue({ code: "custom", message: "Duplicate track or clip IDs" });
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
    }
  });
export type EditTimeline = z.infer<typeof editTimelineSchema>;
export type TimelineClip = z.infer<typeof clipSchema>;
export type TimelineTrack = z.infer<typeof timelineTrackSchema>;

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
