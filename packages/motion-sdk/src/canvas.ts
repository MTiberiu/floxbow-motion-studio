import {
  fieldValue,
  validateField,
  type ComponentInfo,
  type EditTimeline,
  type EditableField,
  type TimelineClip,
} from "./timeline";

export type CanvasAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type CanvasTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  anchor: CanvasAnchor;
};

export type CanvasPoint = { x: number; y: number };
export type CanvasViewportSize = { width: number; height: number };

export type CanvasVisualElement = {
  id: string;
  owner: string;
  componentId: string;
  clip: TimelineClip;
  definition: ComponentInfo;
  transform: CanvasTransform;
  operations: { move: boolean; resize: boolean; rotate: boolean };
  resizeMode: "free" | "preserve-aspect";
  locked: boolean;
};

const anchors = new Set<CanvasAnchor>([
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

const anchorFactors: Record<CanvasAnchor, CanvasPoint> = {
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  "middle-left": { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  "middle-right": { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-center": { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 },
};

function rotatedAnchorOffset(
  transform: CanvasTransform,
  viewport: CanvasViewportSize,
) {
  const anchor = anchorFactors[transform.anchor];
  const x = (0.5 - anchor.x) * (transform.width / 100) * viewport.width;
  const y = (0.5 - anchor.y) * (transform.height / 100) * viewport.height;
  const radians = (transform.rotation * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

/** Return the transformed element center in rendered Canvas pixel coordinates. */
export function canvasVisualCenterInViewport(
  element: CanvasVisualElement,
  viewport: CanvasViewportSize,
): CanvasPoint {
  const offset = rotatedAnchorOffset(element.transform, viewport);
  return {
    x: (element.transform.x / 100) * viewport.width + offset.x,
    y: (element.transform.y / 100) * viewport.height + offset.y,
  };
}

/** Return the declared anchor position, in percentages, for a rendered center. */
export function canvasAnchorPositionForCenter(
  center: CanvasPoint,
  transform: CanvasTransform,
  viewport: CanvasViewportSize,
): CanvasPoint {
  const offset = rotatedAnchorOffset(transform, viewport);
  return {
    x: ((center.x - offset.x) / viewport.width) * 100,
    y: ((center.y - offset.y) / viewport.height) * 100,
  };
}

/** Return the rotated visual bounds in actual rendered Canvas pixels. */
export function canvasVisualBoundsInViewport(
  element: CanvasVisualElement,
  viewport: CanvasViewportSize,
) {
  const center = canvasVisualCenterInViewport(element, viewport);
  const radians = (element.transform.rotation * Math.PI) / 180;
  const width = (element.transform.width / 100) * viewport.width;
  const height = (element.transform.height / 100) * viewport.height;
  const halfWidth =
    (Math.abs(Math.cos(radians)) * width +
      Math.abs(Math.sin(radians)) * height) /
    2;
  const halfHeight =
    (Math.abs(Math.sin(radians)) * width +
      Math.abs(Math.cos(radians)) * height) /
    2;
  return {
    left: center.x - halfWidth,
    top: center.y - halfHeight,
    right: center.x + halfWidth,
    bottom: center.y + halfHeight,
  };
}

function fieldFor(definition: ComponentInfo, key: string): EditableField {
  const field = definition.fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Canvas field ${key} is not declared.`);
  return field;
}

function readField(clip: TimelineClip, definition: ComponentInfo, key: string) {
  const field = fieldFor(definition, key);
  return validateField(field, fieldValue(clip, field));
}

function readNumber(
  clip: TimelineClip,
  definition: ComponentInfo,
  key: string,
) {
  const value = readField(clip, definition, key);
  if (typeof value !== "number")
    throw new Error(`Canvas field ${key} must contain a number.`);
  return value;
}

/** Resolve a clip's opted-in visual contract from its validated canonical properties. */
export function getCanvasVisualElement(
  clip: TimelineClip,
  definition: ComponentInfo | undefined,
): CanvasVisualElement | undefined {
  if (!definition?.canvas || definition.id !== clip.componentId) return;
  const contract = definition.canvas;
  const { transform: fields } = contract;
  const anchorValue = fields.anchor
    ? readField(clip, definition, fields.anchor)
    : "center";
  const anchor =
    typeof anchorValue === "string" && anchors.has(anchorValue as CanvasAnchor)
      ? (anchorValue as CanvasAnchor)
      : "center";
  const visibilityDefinition = contract.visibilityField
    ? fieldFor(definition, contract.visibilityField)
    : undefined;
  const visibilityValue = visibilityDefinition
    ? readField(clip, definition, visibilityDefinition.key)
    : true;
  const visible =
    visibilityDefinition?.type === "select"
      ? (contract.visibleValues?.includes(String(visibilityValue)) ?? true)
      : visibilityValue === true;
  if (!visible) return;

  return {
    id: clip.id,
    owner: contract.owner ?? definition.id,
    componentId: definition.id,
    clip,
    definition,
    transform: {
      x: readNumber(clip, definition, fields.x),
      y: readNumber(clip, definition, fields.y),
      width: readNumber(clip, definition, fields.width),
      height: readNumber(clip, definition, fields.height),
      rotation: fields.rotation
        ? readNumber(clip, definition, fields.rotation)
        : 0,
      anchor,
    },
    operations: {
      move: contract.operations.move,
      resize: contract.operations.resize,
      rotate: contract.operations.rotate,
    },
    resizeMode: contract.resizeMode,
    locked: contract.lockedField
      ? readField(clip, definition, contract.lockedField) === true
      : false,
  };
}

/** Return active opted-in visual clips in the same track/clip stacking order as TimelineComposition. */
export function getCanvasVisualElements(
  timeline: EditTimeline,
  components: readonly ComponentInfo[],
  frame: number,
): CanvasVisualElement[] {
  const byId = new Map(
    components.map((component) => [component.id, component]),
  );
  const result: CanvasVisualElement[] = [];
  for (const track of timeline.tracks) {
    for (const clip of timeline.clips) {
      if (
        clip.trackId !== track.id ||
        frame < clip.from ||
        frame >= clip.from + clip.durationInFrames
      )
        continue;
      const element = getCanvasVisualElement(clip, byId.get(clip.componentId));
      if (element) result.push(element);
    }
  }
  return result;
}

/** Apply one shared Canvas transform through the component's declared editable fields. */
export function applyCanvasTransform(
  clip: TimelineClip,
  definition: ComponentInfo,
  nextTransform: CanvasTransform,
): TimelineClip {
  const visual = getCanvasVisualElement(clip, definition);
  if (!visual) throw new Error("This clip has no Canvas transform contract.");
  const before = visual.transform;
  const contract = definition.canvas!;
  if (
    !contract.operations.move &&
    (nextTransform.x !== before.x || nextTransform.y !== before.y)
  )
    throw new Error("This visual element cannot be moved.");
  if (
    !contract.operations.resize &&
    (nextTransform.width !== before.width ||
      nextTransform.height !== before.height)
  )
    throw new Error("This visual element cannot be resized.");
  if (!contract.operations.rotate && nextTransform.rotation !== before.rotation)
    throw new Error("This visual element cannot be rotated.");
  if (visual.locked)
    throw new Error("This visual element is locked and cannot be transformed.");
  if (
    visual.resizeMode === "preserve-aspect" &&
    (nextTransform.width !== before.width ||
      nextTransform.height !== before.height)
  ) {
    const beforeRatio = before.width / before.height;
    const nextRatio = nextTransform.width / nextTransform.height;
    if (Math.abs(beforeRatio - nextRatio) > 1e-6)
      throw new Error("This visual element must preserve its aspect ratio.");
  }

  const next = structuredClone(clip);
  const entries: [string | undefined, number | string][] = [
    [contract.transform.x, nextTransform.x],
    [contract.transform.y, nextTransform.y],
    [contract.transform.width, nextTransform.width],
    [contract.transform.height, nextTransform.height],
    [contract.transform.rotation, nextTransform.rotation],
    [contract.transform.anchor, nextTransform.anchor],
  ];
  for (const [key, value] of entries) {
    if (!key) continue;
    const field = fieldFor(definition, key);
    const validated = validateField(field, value);
    next[field.target][field.key] = validated;
  }
  return next;
}

/** Compute rotated bounds in a square normalized coordinate space. */
export function canvasVisualBounds(element: CanvasVisualElement) {
  return canvasVisualBoundsInViewport(element, { width: 100, height: 100 });
}
