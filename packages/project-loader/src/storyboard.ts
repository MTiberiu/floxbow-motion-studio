import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const timelineIdentity = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);
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
    imageFit: z.enum(["contain", "cover", "stretch"]).optional(),
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
export type ImageFitMode = "contain" | "cover" | "stretch";
export function imageBoundsInComposition(
  target: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  compositionWidth: number,
  compositionHeight: number,
  fitMode: ImageFitMode = "contain",
) {
  const boxWidth = target.width * compositionWidth / 100;
  const boxHeight = target.height * compositionHeight / 100;
  if (![imageWidth, imageHeight, boxWidth, boxHeight, compositionWidth, compositionHeight]
    .every(value => Number.isFinite(value) && value > 0)) {
    return { x: target.x, y: target.y, width: target.width, height: target.height };
  }
  if (fitMode === "stretch") return { x: target.x, y: target.y, width: target.width, height: target.height };
  const scale = fitMode === "cover"
    ? Math.max(boxWidth / imageWidth, boxHeight / imageHeight)
    : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (target.x * compositionWidth / 100 + (boxWidth - width) / 2) / compositionWidth * 100,
    y: (target.y * compositionHeight / 100 + (boxHeight - height) / 2) / compositionHeight * 100,
    width: width / compositionWidth * 100,
    height: height / compositionHeight * 100,
  };
}
/** Maps a point stored as source-image percentages into composition percentages. */
export function imagePointToComposition(
  target: { x: number; y: number; width: number; height: number },
  point: readonly [number, number],
  imageWidth: number,
  imageHeight: number,
  compositionWidth: number,
  compositionHeight: number,
  fitMode: ImageFitMode = "contain",
) {
  const bounds = imageBoundsInComposition(target, imageWidth, imageHeight, compositionWidth, compositionHeight, fitMode);
  return [bounds.x + point[0] * bounds.width / 100, bounds.y + point[1] * bounds.height / 100] as const;
}
/** Maps a composition point back to the source image, undoing the target's rotation. */
export function compositionPointToImage(
  target: { x: number; y: number; width: number; height: number; rotation: number },
  point: readonly [number, number],
  imageWidth: number,
  imageHeight: number,
  compositionWidth: number,
  compositionHeight: number,
  fitMode: ImageFitMode = "contain",
) {
  const bounds = imageBoundsInComposition(target, imageWidth, imageHeight, compositionWidth, compositionHeight, fitMode);
  const centerX = target.x + target.width / 2, centerY = target.y + target.height / 2;
  const radians = -target.rotation * Math.PI / 180;
  const dx = point[0] - centerX, dy = point[1] - centerY;
  const localX = centerX + dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = centerY + dx * Math.sin(radians) + dy * Math.cos(radians);
  if (localX < target.x || localY < target.y || localX > target.x + target.width || localY > target.y + target.height) return null;
  if (localX < bounds.x || localY < bounds.y || localX > bounds.x + bounds.width || localY > bounds.y + bounds.height) return null;
  return [(localX - bounds.x) / bounds.width * 100, (localY - bounds.y) / bounds.height * 100] as const;
}
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
    // The approved key image for this shot is distinct from editable visual layers.
    // Optional for backwards compatibility with existing storyboard.json files.
    referenceImageId: id.nullable().optional(),
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
const annotationSchema = z
  .object({
    id,
    sceneId: id,
    setId: id,
    objectId: id.nullable(),
    targetReferenceId: id,
    targetRepresentationId: id,
    coordinateSpace: z.literal("image-percent"),
    kind: z.enum(["point", "line", "polyline", "polygon", "rectangle"]),
    points: z.array(z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)])).max(500),
    label: note,
    instruction: note,
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    strokeWidth: z.number().min(1).max(16).optional(),
  })
  .strict()
  .superRefine((annotation, ctx) => {
    const minimumPoints =
      annotation.kind === "point" ? 1 :
      annotation.kind === "line" || annotation.kind === "polyline" || annotation.kind === "rectangle" ? 2 : 3;
    if (annotation.points.length < minimumPoints)
      ctx.addIssue({ code: "custom", message: `${annotation.kind} annotation needs at least ${minimumPoints} points` });
  });
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
export const storyboardImplementationOutputSchema = z.object({
  id,
  kind: z.enum(["image", "effect", "motion", "text", "transition"]),
  name: z.string().min(1).max(200),
  description: note,
  // A code-created image is registered as a project reference so Storyboard
  // can preview it. Effects can target either a Director layer or another
  // declared output (for example, a shadow image with a drift effect).
  assetReferenceId: id.nullable(),
  targetElementId: id.nullable(),
  startFrame: z.number().int().min(0).nullable(),
  durationInFrames: z.number().int().positive().nullable(),
}).strict().superRefine((output, ctx) => {
  if (output.kind === "image" && !output.assetReferenceId)
    ctx.addIssue({ code: "custom", message: "Animator image output needs a registered Storyboard image reference" });
  if (output.kind === "effect" && !output.targetElementId)
    ctx.addIssue({ code: "custom", message: "Animator effect output needs a target element ID" });
  if ((output.startFrame === null) !== (output.durationInFrames === null))
    ctx.addIssue({ code: "custom", message: "Animator output timing needs both a start frame and duration, or neither" });
});

export const storyboardCollaborationMessageSchema = z
  .object({
    id,
    sceneId: id,
    setId: id.nullable(),
    targetKind: z.enum(["scene", "shot", "element", "annotation", "action"]),
    targetId: id,
    field: z.string().min(1).max(80),
    author: z.enum(["director", "animator", "reviewer"]),
    kind: z.enum([
      "interpretation",
      "question",
      "proposal",
      "decision",
      "implementation",
      "self-review",
      "review-feedback",
    ]),
    outcome: z.enum([
      "accepted",
      "needs-clarification",
      "alternative-proposed",
      "blocked",
      "implemented",
      "self-checked",
      "needs-revision",
      "approved",
    ]).optional(),
    replyToId: id.nullable(),
    message: note,
    timelineClipIds: z.array(timelineIdentity).max(200),
    componentIds: z.array(timelineIdentity).max(200),
    sourceFiles: z.array(z.string().min(1).max(500)).max(200),
    // Optional for compatibility with existing collaboration entries. New
    // Animator implementation submissions should always declare their outputs.
    outputs: z.array(storyboardImplementationOutputSchema).max(500).optional(),
    createdAt: z.string().datetime(),
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
            sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            visualAssetId: id.optional(),
            version: z.number().int().min(1).max(10000).optional(),
            role: z.enum(["reference", "shot-image", "clean-background", "character", "prop", "element", "mask", "style-frame", "other"]).optional(),
            width: z.number().int().min(1).max(32768).optional(),
            height: z.number().int().min(1).max(32768).optional(),
            hasAlpha: z.boolean().optional(),
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
    annotations: z.array(annotationSchema).max(10000).default([]),
    aiRequests: z.array(aiImageRequestSchema).max(1000).default([]),
    actionPlans: z.array(actionPlanSchema).max(1000).default([]),
    collaboration: z.array(storyboardCollaborationMessageSchema).max(20000).default([]),
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
    review: z
      .object({
        scenes: z
          .array(
            z
              .object({
                sceneId: id,
                fingerprint: z.string().min(1).max(100),
                approvedAt: z.string().datetime(),
              })
              .strict(),
          )
          .max(200),
        film: z
          .object({
            fingerprint: z.string().min(1).max(100),
            approvedAt: z.string().datetime(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .default({ scenes: [], film: null }),
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
    const visualVersions = new Set<string>();
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
      const visualAssetId = reference.visualAssetId ?? reference.id;
      const version = reference.version ?? 1;
      const versionKey = `${visualAssetId}:${version}`;
      if (visualVersions.has(versionKey))
        ctx.addIssue({ code: "custom", message: `Duplicate visual asset version: ${versionKey}` });
      visualVersions.add(versionKey);
      reference.basedOnReferenceIds?.forEach((parentId) => {
        const parent = doc.references.find((candidate) => candidate.id === parentId);
        if (parent && reference.visualAssetId && parent.visualAssetId && reference.visualAssetId !== parent.visualAssetId)
          ctx.addIssue({ code: "custom", message: "Visual asset revision changed its stable identity" });
      });
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
        if (set.referenceImageId) link([set.referenceImageId]);
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
    doc.annotations.forEach((annotation) => {
      check(annotation.id);
      const scene = doc.scenes.find((candidate) => candidate.id === annotation.sceneId);
      const set = scene?.sets.find((candidate) => candidate.id === annotation.setId);
      if (!set)
        ctx.addIssue({ code: "custom", message: "Annotation target Set is missing" });
      if (!refs.has(annotation.targetReferenceId))
        ctx.addIssue({ code: "custom", message: "Annotation target image is missing" });
      const target = set?.representations.find((representation) => representation.id === annotation.targetRepresentationId);
      if (!target || target.referenceId !== annotation.targetReferenceId)
        ctx.addIssue({ code: "custom", message: "Annotation target representation does not use the referenced image" });
      if (annotation.objectId && !scene?.objects.some((object) => object.id === annotation.objectId))
        ctx.addIssue({ code: "custom", message: "Annotation story object is missing" });
      // targetRepresentationId identifies the image coordinate surface;
      // objectId identifies the semantic element the annotation is about.
      // They may differ when an element is marked on a combined reference.
    });
    const reviewedScenes = new Set<string>();
    doc.review.scenes.forEach((approval) => {
      if (reviewedScenes.has(approval.sceneId))
        ctx.addIssue({ code: "custom", message: "Scene approval is duplicated" });
      reviewedScenes.add(approval.sceneId);
      if (!doc.scenes.some((scene) => scene.id === approval.sceneId))
        ctx.addIssue({ code: "custom", message: "Approved scene is missing" });
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
    });
    const messages = new Map(doc.collaboration.map((message) => [message.id, message]));
    doc.collaboration.forEach((message) => {
      check(message.id);
      const scene = doc.scenes.find((candidate) => candidate.id === message.sceneId);
      const set = scene?.sets.find((candidate) => candidate.id === message.setId);
      const targetExists = message.targetKind === "scene"
        ? scene?.id === message.targetId
        : message.targetKind === "shot"
          ? set?.id === message.targetId
          : message.targetKind === "element"
            ? !!set?.representations.some((item) => item.id === message.targetId)
            : message.targetKind === "annotation"
              ? doc.annotations.some((item) => item.id === message.targetId && item.sceneId === scene?.id && item.setId === set?.id)
              : doc.actionPlans.some((item) => item.id === message.targetId && item.sceneId === scene?.id);
      if (!scene || (message.setId && !set) || !targetExists)
        ctx.addIssue({ code: "custom", path: ["collaboration"], message: `Collaboration target is missing: ${message.targetId}` });
      if ((message.targetKind === "scene") !== (message.setId === null))
        ctx.addIssue({ code: "custom", path: ["collaboration"], message: "Scene collaboration targets must not name a shot; shot-level targets must name one" });
      if (message.replyToId) {
        const parent = messages.get(message.replyToId);
        if (!parent || doc.collaboration.indexOf(parent) >= doc.collaboration.indexOf(message) || parent.sceneId !== message.sceneId || parent.setId !== message.setId || parent.targetKind !== message.targetKind || parent.targetId !== message.targetId || parent.field !== message.field)
          ctx.addIssue({ code: "custom", path: ["collaboration"], message: `Collaboration reply target is missing or mismatched: ${message.replyToId}` });
      }
      if (message.sourceFiles.some((file) => file.startsWith("/") || /^[a-zA-Z]:\//.test(file) || file.includes("\\") || file.split("/").includes("..")))
        ctx.addIssue({ code: "custom", path: ["collaboration"], message: "Collaboration source files must be project-relative paths" });
      if (message.kind === "implementation" && message.outputs?.length) {
        if (!message.sourceFiles.length)
          ctx.addIssue({ code: "custom", path: ["collaboration"], message: "Animator outputs must link to at least one project source file" });
        for (const output of message.outputs) {
          check(output.id);
          if (output.assetReferenceId) link([output.assetReferenceId]);
          if (output.targetElementId) {
            const declared = doc.collaboration.some((candidate) =>
              candidate.outputs?.some((item) => item.id === output.targetElementId),
            );
            const representation = doc.scenes.some((candidate) =>
              candidate.sets.some((shot) => shot.id === output.targetElementId || shot.representations.some((layer) => layer.id === output.targetElementId)),
            );
            if (!declared && !representation)
              ctx.addIssue({ code: "custom", path: ["collaboration"], message: `Animator output target is missing: ${output.targetElementId}` });
          }
        }
      }
    });
  });
export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryScene = Storyboard["scenes"][number];
export type StorySet = StoryScene["sets"][number];
export type Representation = z.infer<typeof representationSchema>;
export type DrawingElement = z.infer<typeof drawingElementSchema>;
export type StoryboardCollaborationMessage = z.infer<typeof storyboardCollaborationMessageSchema>;
export type StoryboardImplementationOutput = z.infer<typeof storyboardImplementationOutputSchema>;
/** Stable output IDs are derived from authored identity, never generated per render. */
export function animatorOutputId(sceneId: string, shotId: string, stableKey: string) {
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "item";
  const source = `${sceneId}/${shotId}/${stableKey}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `anim-${slug(sceneId)}-${slug(shotId)}-${slug(stableKey)}-${(hash >>> 0).toString(36)}`;
}
export const emptyStoryboard = (
  projectId: string,
  composition = { width: 1920, height: 1080, fps: 30 },
): Storyboard => ({
  version: 1,
  projectId,
  composition,
  scenes: [],
  references: [],
  annotations: [],
  aiRequests: [],
  actionPlans: [],
  collaboration: [],
  briefs: [],
  review: { scenes: [], film: null },
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
  referenceImageId: null,
  referenceIds: [],
  tracing: null,
  representations: [],
  anchors: [],
});
/** Attach the approved key image and use it as the initial shot layer only when
 * the Director has not supplied decomposed visual elements yet. */
export function attachShotReferenceImage(set: StorySet, referenceId: string, representationId: string) {
  set.referenceImageId = referenceId;
  if (!set.referenceIds.includes(referenceId)) set.referenceIds.push(referenceId);
  const autoLayer = set.representations.length === 1
    && set.representations[0].layerName === "Shot reference · video image";
  if (autoLayer) {
    // Replacing the approved image also replaces its paired video layer while
    // preserving the user's placement and the representation's stable ID.
    set.representations[0].referenceId = referenceId;
  } else if (set.representations.length === 0) {
    set.representations.push({
      id: representationId,
      layerName: "Shot reference · video image",
      objectId: null,
      setId: set.id,
      coordinateSpace: "composition-percent",
      anchor: "top-left",
      rotation: 0,
      zOrder: 0,
      spatialNote: "Approved shot reference used as the initial video image.",
      referenceId,
      kind: "reference",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: [],
      color: "#24334b",
      thickness: 4,
      text: "",
      visible: true,
      opacity: 1,
      locked: false,
      pose: "",
      instructions: "",
      motion: "",
      imageFit: "contain",
    });
  }
}
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
  const linkedReferences = sceneReferenceIds(
    scene,
    doc.actionPlans.filter((action) => action.sceneId === scene.id),
    doc.annotations.filter((annotation) => annotation.sceneId === scene.id),
  );
  doc.actionPlans
    .filter((action) => action.sceneId === scene.id)
    .flatMap((action) => action.poses)
    .forEach((pose) => {
      if (pose.referenceId) linkedReferences.add(pose.referenceId);
    });
  const text = stableStringify({
    scene,
    actionPlans: doc.actionPlans.filter((action) => action.sceneId === scene.id),
    aiRequests: doc.aiRequests.filter((request) => request.sceneId === scene.id),
    annotations: doc.annotations.filter((annotation) => annotation.sceneId === scene.id),
    references: doc.references
      .filter((reference) => linkedReferences.has(reference.id))
      .map(referenceFingerprint),
    composition: doc.composition,
  });
  return contentFingerprint(text);
}

/** A stable content fingerprint for the full approved Director plan, excluding review metadata. */
export function directorPlanFingerprint(doc: Storyboard) {
  return contentFingerprint(
    stableStringify({
      projectId: doc.projectId,
      composition: doc.composition,
      scenes: doc.scenes,
      references: doc.references.map(referenceFingerprint),
      actionPlans: doc.actionPlans,
      aiRequests: doc.aiRequests,
      annotations: doc.annotations,
      briefs: doc.briefs,
    }),
  );
}

function contentFingerprint(text: string) {
  let a = 2166136261,
    b = 5381;
  for (const char of text) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ char.charCodeAt(0);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function referenceFingerprint(reference: Storyboard["references"][number]) {
  // The host assigns this deterministic path during save; it is storage metadata.
  const { file: _file, ...content } = reference;
  return content;
}

export function sceneApprovalStatus(
  doc: Storyboard,
  scene: StoryScene,
  changedAssetReferenceIds: string[] = [],
) {
  const approval = doc.review.scenes.find((item) => item.sceneId === scene.id);
  if (!approval) return "not-approved" as const;
  if (
    changedAssetReferenceIds.some((id) =>
      sceneReferenceIds(
        scene,
        doc.actionPlans.filter((action) => action.sceneId === scene.id),
        doc.annotations.filter((annotation) => annotation.sceneId === scene.id),
      ).has(id),
    )
  )
    return "needs-review" as const;
  return approval.fingerprint === sceneFingerprint(doc, scene)
    ? ("approved" as const)
    : ("needs-review" as const);
}

export function filmApprovalStatus(
  doc: Storyboard,
  changedAssetReferenceIds: string[] = [],
) {
  if (!doc.review.film) return "not-approved" as const;
  if (changedAssetReferenceIds.length) return "needs-review" as const;
  return doc.review.film.fingerprint === directorPlanFingerprint(doc)
    ? ("approved" as const)
    : ("needs-review" as const);
}

function sceneReferenceIds(
  scene: StoryScene,
  actionPlans: Storyboard["actionPlans"] = [],
  annotations: Storyboard["annotations"] = [],
) {
  const linkedReferences = new Set<string>();
  scene.objects.forEach((object) => object.referenceIds.forEach((id) => linkedReferences.add(id)));
  scene.sets.forEach((set) => {
    set.referenceIds.forEach((id) => linkedReferences.add(id));
    if (set.referenceImageId) linkedReferences.add(set.referenceImageId);
    if (set.tracing) linkedReferences.add(set.tracing.referenceId);
    set.representations.forEach((representation) => {
      if (representation.referenceId) linkedReferences.add(representation.referenceId);
    });
  });
  actionPlans
    .flatMap((action) => action.poses)
    .forEach((pose) => {
      if (pose.referenceId) linkedReferences.add(pose.referenceId);
    });
  annotations.forEach((annotation) => linkedReferences.add(annotation.targetReferenceId));
  return linkedReferences;
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
export function directorBrief(
  doc: Storyboard,
  format: StoryFormat,
  changedAssetReferenceIds: string[] = [],
) {
  const lines = [
    `# ${format.name} — Director brief`,
    "",
    "## The build",
    `${format.width} × ${format.height}; ${format.fps} FPS. Project: ${doc.projectId}.`,
    "Timing is approximate unless linked to source audio. Sketches describe intent, not final artwork.",
    `Aspect ratio: ${format.width}:${format.height} (${format.width / format.height}). Total scene estimates: ${doc.scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0)} seconds${doc.scenes.some((s) => s.duration === null) ? "; incomplete — some estimates unspecified" : ""}. All sketch/reference opacity is authoring presentation, not a final animation instruction.`,
    `Whole-film approval: ${filmApprovalStatus(doc, changedAssetReferenceIds)}. An approved storyboard revision does not regenerate or overwrite Animator code.`,
    "",
    "## Instructions for the AI Director",
    "Data model: each Scene is one scene in the film. Its ordered `sets` array is the sequence of Shots shown in the Storyboard UI; each Set record is one Shot, and its `id` is the stable shot ID (`setId` in related records). A Shot's `representations` are its visual layers, while `referenceImageId` is its approved key/reference image. Do not treat a Set as a location/set design or as a whole Scene. Preserve original instructions and stable identities. Propose timing, camera and motion separately. Identify uncertainty; do not invent word timing. Return Scene, Shot/Set, object, representation, reference and request IDs with suggestions. Reference files use project-relative paths in storyboard.json.",
  ];
  for (const scene of doc.scenes) {
    lines.push(
      "",
      `# Scene: ${scene.name} (${scene.id})`,
      `Scene approval: ${sceneApprovalStatus(doc, scene, changedAssetReferenceIds)}.`,
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
        `### Shot: ${set.name} (${set.id}; legacy data field: scene.sets, setId)`,
        set.description,
        `Approximate start ${set.start ?? "unknown"}s; duration ${set.duration ?? "unknown"}s; end ${set.start !== null && set.duration !== null ? set.start + set.duration : "unknown"}s.`,
        `Timing constraints: ${set.timing}`,
        `Transition from previous shot: ${set.transition}`,
        `Sketch: sketches/${set.id}.png`,
        `Shot references: ${set.referenceIds.join(", ") || "none"}`,
        `Approved shot reference image: ${set.referenceImageId ?? "not selected"}. This is the Director's key visual for the shot; use it as the shot's visual asset when no decomposed layers are needed.`,
        `Composition: ${set.compositionNote}`,
        `Camera/framing: ${set.cameraNote || "unspecified; staging does not imply camera movement"}`,
        `Previous shot: ${scene.sets[scene.sets.indexOf(set) - 1]?.id ?? "none"}; following shot: ${scene.sets[scene.sets.indexOf(set) + 1]?.id ?? "none"}`,
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
          `- Representation ${r.id}: ${scene.objects.find((o) => o.id === r.objectId)?.name ?? "Unassigned sketch"} (${r.objectId ?? "no identity"}); ${r.visible ? "visible" : "hidden"}; zOrder ${r.zOrder}; top-left x=${r.x}%, y=${r.y}%, width=${r.width}%, height=${r.height}%; rotation ${r.rotation} degrees around bounds center; coordinateSpace ${r.coordinateSpace}; image fit ${r.kind === "reference" ? r.imageFit ?? "contain" : "not applicable"}. ${r.spatialNote} Text: ${r.text}; reference ${r.referenceId ?? "none"}.`,
          `Pose: ${r.pose}\nInstructions: ${r.instructions}\nMotion: ${r.motion}`,
        );
      for (const annotation of doc.annotations.filter((item) => item.sceneId === scene.id && item.setId === set.id))
        lines.push(
          `Visual annotation ${annotation.id} on reference ${annotation.targetReferenceId}, representation ${annotation.targetRepresentationId}${annotation.objectId ? ` for object ${annotation.objectId}` : ""}: ${annotation.kind} in image-percent coordinates ${JSON.stringify(annotation.points)}; border ${annotation.color}, width ${annotation.strokeWidth ?? 4}px; ${annotation.label}. ${annotation.instruction}`,
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
      `- ${r.name} (${r.id}), ${r.category}: ${r.description}. Origin ${r.origin ?? "user"}; project file ${r.file ?? "not saved yet"}; SHA-256 ${r.sha256 ?? "not saved yet"}; source media ID ${r.assetId}; request ${r.requestId ?? "none"}.`,
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
