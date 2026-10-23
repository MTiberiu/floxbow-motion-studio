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
  const visible = contract.visibilityField
    ? readField(clip, definition, contract.visibilityField) === true
    : true;
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

/** Compute the axis-aligned composition-space bounds for overlays and marquee hit tests. */
export function canvasVisualBounds(element: CanvasVisualElement) {
  const radians = (element.transform.rotation * Math.PI) / 180;
  const width = element.transform.width;
  const height = element.transform.height;
  const anchorOffsets: Record<CanvasAnchor, [number, number]> = {
    "top-left": [0, 0],
    "top-center": [0.5, 0],
    "top-right": [1, 0],
    "middle-left": [0, 0.5],
    center: [0.5, 0.5],
    "middle-right": [1, 0.5],
    "bottom-left": [0, 1],
    "bottom-center": [0.5, 1],
    "bottom-right": [1, 1],
  };
  const [anchorX, anchorY] = anchorOffsets[element.transform.anchor];
  const centerX = element.transform.x + (0.5 - anchorX) * width;
  const centerY = element.transform.y + (0.5 - anchorY) * height;
  const halfWidth =
    (Math.abs(Math.cos(radians)) * width +
      Math.abs(Math.sin(radians)) * height) /
    2;
  const halfHeight =
    (Math.abs(Math.sin(radians)) * width +
      Math.abs(Math.cos(radians)) * height) /
    2;
  return {
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
  };
}
