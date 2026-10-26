import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const note = z.string().max(20000);
const seconds = z.number().finite().min(0).max(86400);
const coordinate = z.number().finite().min(-100000).max(100000);
const drawingElementSchema = z.object({
  id,
  kind: z.enum(["pencil", "rectangle", "ellipse", "line", "text"]),
  x: coordinate,
  y: coordinate,
  width: z.number().min(0.01).max(10000),
  height: z.number().min(0.01).max(10000),
  points: z.array(z.tuple([coordinate, coordinate])).max(10000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  thickness: z.number().min(1).max(100),
  text: note,
}).strict();
const rasterBoundsSchema = z.object({ x: coordinate, y: coordinate, width: z.number().min(0.01).max(10000), height: z.number().min(0.01).max(10000) }).strict();
export const representationSchema = z
  .object({
    id,
    layerName: z.string().min(1).max(200).optional(),
    elements: z.array(drawingElementSchema).max(20000).optional(),
    rasterDataUrl: z.string().max(90_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).optional(),
    rasterBounds: rasterBoundsSchema.optional(),
    objectId: id.nullable(),
    setId: id,
    coordinateSpace: z.literal("composition-percent"),
    anchor: z.literal("top-left"),
    rotation: z.number().finite().min(-360).max(360),
    zOrder: z.number().int().min(0),
    spatialNote: note,
    referenceId: id.nullable(),
    kind: z.enum([
      "pencil",
      "rectangle",
      "ellipse",
      "line",
      "text",
      "reference",
    ]),
    x: coordinate,
    y: coordinate,
    width: z.number().min(0.01).max(10000),
    height: z.number().min(0.01).max(10000),
    points: z.array(z.tuple([coordinate, coordinate])).max(10000),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    thickness: z.number().min(1).max(100),
    text: note,
    visible: z.boolean(),
    opacity: z.number().min(0).max(1),
    locked: z.boolean(),
    pose: note,
    instructions: note,
    motion: note,
  })
  .strict();
export const anchorSchema = z
  .object({
    cueId: z.string().max(200),
    wordIds: z.array(z.string().max(200)).max(1000),
    text: note,
    start: seconds.nullable(),
    end: seconds.nullable(),
    status: z.enum(["demo", "unverified", "reviewed"]),
    sourceRevision: z.string().max(100),
    actionTime: seconds.nullable(),
    instruction: note,
  })
  .strict();
const setSchema = z
  .object({
    id,
    name: z.string().min(1).max(200),
    description: note,
    start: seconds.nullable(),
    duration: seconds.positive().nullable(),
    timing: note,
    transition: note,
    compositionNote: note,
    cameraNote: note,
    referenceIds: z.array(id).max(500),
    tracing: z
      .object({ referenceId: id, opacity: z.number().min(0).max(1) })
      .strict()
      .nullable(),
    representations: z.array(representationSchema).max(2000),
    anchors: z.array(anchorSchema).max(1000),
  })
  .strict();
const objectSchema = z
  .object({
    id,
    name: z.string().min(1).max(200),
    category: note,
    description: note,
    instructions: note,
    referenceIds: z.array(id).max(500),
  })
  .strict();
const actionPoseSchema = z.object({
  id,
  libraryPoseId: id.optional(),
  name: z.string().min(1).max(120),
  note,
  status: z.enum(["needed", "supplied", "generated"]),
  referenceId: id.nullable(),
}).strict();
const actionPlanSchema = z
  .object({
    id,
    libraryActionId: id,
    libraryActionName: z.string().min(1).max(160),
    type: z.enum(["walk", "run", "jump", "dance", "idle", "custom"]),
    sceneId: id,
    objectId: id,
    fromSetId: id,
    toSetId: id.nullable(),
    start: seconds.nullable(),
    duration: z.number().positive().max(86400).nullable(),
    loop: z.boolean(),
    direction: note,
    view: note,
    poseGuidance: note,
    poses: z.array(actionPoseSchema).max(40),
    note,
    status: z.enum(["planned", "requested", "assets-ready"]),
  })
  .strict();
const aiImageRequestSchema = z
  .object({
    id,
    kind: z.enum(["generate", "revise"]),
    sceneId: id,
    setId: id,
    objectId: id,
    representationId: id,
    sourceReferenceId: id.nullable(),
    outputReferenceId: id,
    outputFile: z
      .string()
      .regex(/^assets\/storyboard\/references\/[a-z0-9-]+\.png$/),
    instruction: note,
    status: z.enum(["pending", "completed", "cancelled"]),
  })
  .strict();
const sceneSchema = z
  .object({
    id,
    name: z.string().min(1).max(200),
    description: note,
    directions: note,
    style: note,
    duration: seconds.positive().nullable(),
    timelineSceneId: z.string().max(200).nullable(),
    objects: z.array(objectSchema).max(2000),
    sets: z.array(setSchema).max(500),
  })
  .strict();
export const storyboardSchema = z
  .object({
    version: z.literal(1),
    projectId: id,
    composition: z
      .object({
        width: z.number().int().min(16).max(7680),
        height: z.number().int().min(16).max(7680),
        fps: z.number().int().min(1).max(120),
      })
      .strict(),
    scenes: z.array(sceneSchema).max(200),
    references: z
      .array(
        z
          .object({
            id,
            assetId: id,
            file: z
              .string()
              .regex(/^assets\/storyboard\/references\/[a-z0-9-]+\.png$/)
              .optional(),
            name: z.string().min(1).max(200),
            category: note,
            description: note,
            origin: z.enum(["user", "ai"]).optional(),
            prompt: note.optional(),
            basedOnReferenceIds: z.array(id).max(100).optional(),
            requestId: id.optional(),
          })
          .strict(),
      )
      .max(2000),
    aiRequests: z.array(aiImageRequestSchema).max(1000).default([]),
    actionPlans: z.array(actionPlanSchema).max(1000).default([]),
    briefs: z
      .array(
        z
          .object({
            id,
            sceneId: id,
            text: note,
            sourceFingerprint: z.string().max(100),
            approved: z.boolean(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    const check = (value: string) => {
      if (seen.has(value))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate identity: ${value}`,
        });
      seen.add(value);
    };
    const refs = new Set(doc.references.map((r) => r.id));
    const link = (values: string[]) =>
      values.forEach((value) => {
        if (!refs.has(value))
          ctx.addIssue({
            code: "custom",
            message: `Unknown reference: ${value}`,
          });
      });
    doc.references.forEach((reference) => {
      if (
        reference.file &&
        reference.file !==
          `assets/storyboard/references/${reference.id}.png`
      )
        ctx.addIssue({
          code: "custom",
          message: "Reference file path must match its stable ID",
        });
      link(reference.basedOnReferenceIds ?? []);
    });
    doc.references.forEach((r) => check(r.id));
    doc.scenes.forEach((scene) => {
      check(scene.id);
      const objects = new Set(scene.objects.map((o) => o.id));
      scene.objects.forEach((o) => {
        check(o.id);
        link(o.referenceIds);
      });
      scene.sets.forEach((set) => {
        check(set.id);
        link(set.referenceIds);
        if (set.tracing) link([set.tracing.referenceId]);
        set.representations.forEach((r, i) => {
          check(r.id);
          if (r.setId !== set.id || r.zOrder !== i)
            ctx.addIssue({
              code: "custom",
              message: "Representation Set or layer order mismatch",
            });
          if (r.referenceId) link([r.referenceId]);
          if (r.kind === "reference" && !r.referenceId)
            ctx.addIssue({
              code: "custom",
              message: "Reference placement needs a reference",
            });
          if (r.objectId && !objects.has(r.objectId))
            ctx.addIssue({
              code: "custom",
              message:
                "Representation object belongs to another scene or is missing",
            });
        });
        set.anchors.forEach((a) => {
          if (a.start !== null && a.end !== null && a.end <= a.start)
            ctx.addIssue({
              code: "custom",
              message: "Anchor end must follow start",
            });
        });
      });
    });
    doc.briefs.forEach((b) => {
      check(b.id);
      if (!doc.scenes.some((s) => s.id === b.sceneId))
        ctx.addIssue({ code: "custom", message: "Brief scene is missing" });
    });
    const requestIds = new Set(doc.aiRequests.map((request) => request.id));
    doc.actionPlans.forEach((action) => {
      check(action.id);
      const scene = doc.scenes.find((candidate) => candidate.id === action.sceneId);
      if (!scene?.objects.some((object) => object.id === action.objectId))
        ctx.addIssue({ code: "custom", message: "Motion plan story object is missing" });
      if (!scene?.sets.some((candidate) => candidate.id === action.fromSetId))
        ctx.addIssue({ code: "custom", message: "Motion plan starting Set is missing" });
      if (action.toSetId && !scene?.sets.some((candidate) => candidate.id === action.toSetId))
        ctx.addIssue({ code: "custom", message: "Motion plan destination Set is missing" });
      action.poses.forEach((pose) => {
        check(pose.id);
        if (pose.referenceId) link([pose.referenceId]);
      });
    });
    doc.aiRequests.forEach((request) => {
      check(request.id);
      const scene = doc.scenes.find((candidate) => candidate.id === request.sceneId);
      const set = scene?.sets.find((candidate) => candidate.id === request.setId);
      const representation = set?.representations.find(
        (candidate) => candidate.id === request.representationId,
      );
      const object = scene?.objects.find((candidate) => candidate.id === request.objectId);
      if (!scene || !set)
        ctx.addIssue({ code: "custom", message: "AI image request Set is missing" });
      if (!scene?.objects.some((object) => object.id === request.objectId))
        ctx.addIssue({ code: "custom", message: "AI image request object is missing" });
      if (representation?.objectId !== request.objectId)
        ctx.addIssue({ code: "custom", message: "AI image request target changed" });
      if (request.sourceReferenceId && !refs.has(request.sourceReferenceId))
        ctx.addIssue({ code: "custom", message: "AI image request source is missing" });
      if (
        request.sourceReferenceId &&
        !object?.referenceIds.includes(request.sourceReferenceId) &&
        representation?.referenceId !== request.sourceReferenceId
      )
        ctx.addIssue({ code: "custom", message: "AI image request source is not linked to its object" });
      if (
        request.outputFile !==
        `assets/storyboard/references/${request.outputReferenceId}.png`
      )
        ctx.addIssue({ code: "custom", message: "AI output path must match its reference ID" });
      if (
        request.status === "completed" &&
        !refs.has(request.outputReferenceId)
      )
        ctx.addIssue({ code: "custom", message: "Completed AI image request has no output" });
      if (request.status === "completed") {
        const output = doc.references.find((reference) => reference.id === request.outputReferenceId);
        if (
          output?.origin !== "ai" ||
          output.requestId !== request.id ||
          output.file !== request.outputFile
        )
          ctx.addIssue({ code: "custom", message: "AI request output provenance does not match" });
        if (
          !set?.representations.some(
            (candidate) => candidate.objectId === request.objectId && candidate.referenceId === request.outputReferenceId,
          )
        )
          ctx.addIssue({ code: "custom", message: "AI output must add a new representation of the requested object" });
      }
    });
    doc.references.forEach((reference) => {
      if (reference.requestId && !requestIds.has(reference.requestId))
        ctx.addIssue({ code: "custom", message: "Generated reference request is missing" });
      if (reference.origin === "ai" && !reference.requestId)
        ctx.addIssue({ code: "custom", message: "Generated reference needs its AI request ID" });
    });
  });
export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryScene = Storyboard["scenes"][number];
export type StorySet = StoryScene["sets"][number];
export type Representation = z.infer<typeof representationSchema>;
export type DrawingElement = z.infer<typeof drawingElementSchema>;
export const emptyStoryboard = (
  projectId: string,
  composition = { width: 1920, height: 1080, fps: 30 },
): Storyboard => ({
  version: 1,
  projectId,
  composition,
  scenes: [],
  references: [],
  aiRequests: [],
  actionPlans: [],
  briefs: [],
});
export const newSet = (id: string, name: string): StorySet => ({
  id,
  name,
  description: "",
  start: null,
  duration: null,
  timing: "",
  transition: "",
  compositionNote: "",
  cameraNote: "",
  referenceIds: [],
  tracing: null,
  representations: [],
  anchors: [],
});
export const newScene = (id: string, name: string): StoryScene => ({
  id,
  name,
  description: "",
  directions: "",
  style: "",
  duration: null,
  timelineSceneId: null,
  objects: [],
  sets: [],
});
/** Stable content fingerprint, not a security digest; excludes imported suggestions. */
export function sceneFingerprint(doc: Storyboard, scene: StoryScene) {
  const text = JSON.stringify({
    scene,
    actionPlans: doc.actionPlans.filter((action) => action.sceneId === scene.id),
    references: doc.references,
    composition: doc.composition,
  });
  let a = 2166136261,
    b = 5381;
  for (const char of text) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ char.charCodeAt(0);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
export function timingWarnings(scene: StoryScene) {
  const warnings: string[] = [];
  scene.sets.forEach((set, i) => {
    if (set.start === null || set.duration === null)
      warnings.push(`${set.name}: timing is unspecified.`);
    else {
      if (scene.duration !== null && set.start + set.duration > scene.duration)
        warnings.push(`${set.name}: exceeds the scene estimate.`);
      if (
        scene.sets
          .slice(0, i)
          .some(
            (p) =>
              p.start !== null &&
              p.duration !== null &&
              p.start < set.start! + set.duration! &&
              p.start + p.duration > set.start!,
          )
      )
        warnings.push(`${set.name}: overlaps another Set estimate.`);
    }
  });
  return warnings;
}
export type StoryFormat = {
  name: string;
  width: number;
  height: number;
  fps: number;
};
export function directorBrief(doc: Storyboard, format: StoryFormat) {
  const lines = [
    `# ${format.name} — Director brief`,
    "",
    "## The build",
    `${format.width} × ${format.height}; ${format.fps} FPS. Project: ${doc.projectId}.`,
    "Timing is approximate unless linked to source audio. Sketches describe intent, not final artwork.",
    `Aspect ratio: ${format.width}:${format.height} (${format.width / format.height}). Total scene estimates: ${doc.scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0)} seconds${doc.scenes.some((s) => s.duration === null) ? "; incomplete — some estimates unspecified" : ""}. All sketch/reference opacity is authoring presentation, not a final animation instruction.`,
    "",
    "## Instructions for the AI Director",
    "Preserve original instructions and stable identities. Propose timing, camera and motion separately. Identify uncertainty; do not invent word timing. Return Scene, Set, object, representation, reference and request IDs with suggestions. Reference files use project-relative paths in storyboard.json.",
  ];
  for (const scene of doc.scenes) {
    lines.push(
      "",
      `# Scene: ${scene.name} (${scene.id})`,
      "## The story",
      scene.description,
      `Estimated duration: ${scene.duration ?? "unspecified"} seconds. Timeline scene: ${scene.timelineSceneId ?? "unlinked"}.`,
      scene.directions,
      "## The look",
      scene.style || "Style unspecified.",
      "## The cast and objects",
    );
    for (const o of scene.objects)
      lines.push(
        `- ${o.name} (${o.id}), ${o.category}: ${o.description}`,
        o.instructions,
        `References: ${
          o.referenceIds
            .map((id) => {
              const r = doc.references.find((r) => r.id === id)!;
              return `${r.name} (${id}): ${r.description}`;
            })
            .join("; ") || "none"
        }`,
      );
    lines.push("## The sequence and motion");
    for (const set of scene.sets) {
      lines.push(
        `### ${set.name} (${set.id})`,
        set.description,
        `Approximate start ${set.start ?? "unknown"}s; duration ${set.duration ?? "unknown"}s; end ${set.start !== null && set.duration !== null ? set.start + set.duration : "unknown"}s.`,
        `Timing constraints: ${set.timing}`,
        `Transition from previous Set: ${set.transition}`,
        `Sketch: sketches/${set.id}.png`,
        `Set references: ${set.referenceIds.join(", ") || "none"}`,
        `Composition: ${set.compositionNote}`,
        `Camera/framing: ${set.cameraNote || "unspecified; staging does not imply camera movement"}`,
        `Previous Set: ${scene.sets[scene.sets.indexOf(set) - 1]?.id ?? "none"}; following Set: ${scene.sets[scene.sets.indexOf(set) + 1]?.id ?? "none"}`,
      );
      if (set.tracing)
        lines.push(
          `Tracing aid: ${set.tracing.referenceId}, editor opacity ${set.tracing.opacity}. This opacity is NOT an animation direction.`,
        );
      for (const action of doc.actionPlans.filter((action) => action.sceneId === scene.id && action.fromSetId === set.id))
        lines.push(
          `Motion library set ${action.libraryActionName} (${action.type}; ${action.libraryActionId}) attached as plan ${action.id} for ${scene.objects.find((object) => object.id === action.objectId)?.name ?? action.objectId}: ${action.fromSetId} -> ${action.toSetId ?? "continues after final Set"}; starts around ${action.start ?? set.start ?? "unknown"}s; duration ${action.duration ?? "unspecified"}s; loop ${action.loop ? "yes" : "no"}; direction ${action.direction || "unspecified"}; view ${action.view || "unspecified"}; pose guidance ${action.poseGuidance || "AI may suggest poses"}; status ${action.status}. ${action.note}\n${action.poses.map((pose, index) => `  ${index + 1}. ${pose.name} [${pose.status}]${pose.referenceId ? ` · reference ${pose.referenceId}` : ""}: ${pose.note}`).join("\n")}`,
        );
      for (const r of set.representations)
        lines.push(
          `- Representation ${r.id}: ${scene.objects.find((o) => o.id === r.objectId)?.name ?? "Unassigned sketch"} (${r.objectId ?? "no identity"}); ${r.visible ? "visible" : "hidden"}; zOrder ${r.zOrder}; top-left x=${r.x}%, y=${r.y}%, width=${r.width}%, height=${r.height}%; rotation ${r.rotation} degrees around bounds center; coordinateSpace ${r.coordinateSpace}. ${r.spatialNote} Text: ${r.text}; reference ${r.referenceId ?? "none"}.`,
          `Pose: ${r.pose}\nInstructions: ${r.instructions}\nMotion: ${r.motion}`,
        );
      lines.push(
        "Audio/subtitle anchors (source time is separate from intended action time):",
      );
      for (const a of set.anchors)
        lines.push(
          `- ${a.text}: ${a.start ?? "unknown"}–${a.end ?? "unknown"}s (${a.status}); cue ${a.cueId}; words ${a.wordIds.join(", ") || "cue-level only"}; source revision ${a.sourceRevision}; intended action ${a.actionTime ?? "unspecified"}s. ${a.instruction}`,
        );
    }
    lines.push("## The timing — uncertainty", ...timingWarnings(scene));
    for (const b of doc.briefs.filter((b) => b.sceneId === scene.id))
      lines.push(
        `## Imported Director suggestion ${b.id} (${b.approved ? "approved" : "unapproved"}; ${b.sourceFingerprint === sceneFingerprint(doc, scene) ? "current" : "STALE — source changed"})`,
        b.text,
      );
  }
  lines.push("## The source references");
  doc.references.forEach((r) =>
    lines.push(
      `- ${r.name} (${r.id}), ${r.category}: ${r.description}. Origin ${r.origin ?? "user"}; project file ${r.file ?? "not saved yet"}; source media ID ${r.assetId}; request ${r.requestId ?? "none"}.`,
    ),
  );
  if (doc.aiRequests.length) {
    lines.push("## AI image requests");
    doc.aiRequests.forEach((request) => {
      const targetScene = doc.scenes.find((candidate) => candidate.id === request.sceneId);
      const targetObject = targetScene?.objects.find((candidate) => candidate.id === request.objectId);
      lines.push(
        `- ${request.kind} ${request.id} [${request.status}] for ${targetObject?.name ?? request.objectId} (${request.objectId}), Scene ${request.sceneId}, Set ${request.setId}, representation ${request.representationId}; source reference ${request.sourceReferenceId ?? "none"}; output reference ${request.outputReferenceId} at ${request.outputFile}. ${request.instruction}`,
      );
    });
  }
  return lines.join("\n\n");
}
