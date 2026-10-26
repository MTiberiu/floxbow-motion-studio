import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  canvasVisualBounds,
  canvasVisualBoundsInViewport,
  canvasVisualCenterInViewport,
  canvasAnchorPositionForCenter,
  getCanvasVisualElements,
  type CanvasTransform,
  type CanvasVisualElement,
  type CanvasViewportSize,
} from "@motion/sdk/canvas";
import type { ComponentInfo, EditTimeline } from "@motion/sdk/timeline";
import { MEDIA_ASSET_DRAG_TYPE, parseMediaAssetDragData } from "./media-drag";
import { snapCanvasMove, type CanvasSnapGuides } from "./canvas-snap";

type Point = { x: number; y: number };
type Gesture = {
  pointerId: number;
  mode: "move" | "resize" | "rotate" | "marquee";
  start: Point;
  initial: CanvasVisualElement[];
  viewport: CanvasViewportSize;
  handle?: { x: number; y: number };
  active: boolean;
  checkpointed: boolean;
  additive: boolean;
  duplicate?: boolean;
  duplicateAttempted?: boolean;
  deselectOnClick?: string;
  axisLock?: "x" | "y";
};

export type CanvasInteractionLayerProps = {
  projectId: string;
  timeline?: EditTimeline;
  components: readonly ComponentInfo[];
  frame: number;
  selectedIds: readonly string[];
  onSelect: (ids: readonly string[]) => void;
  onGestureStart: () => void;
  onTransform: (changes: ReadonlyMap<string, CanvasTransform>) => void;
  onDuplicate: (
    clipIds: readonly string[],
  ) => ReadonlyMap<string, CanvasVisualElement>;
  onGestureEnd: () => void;
  onGestureCancel: () => void;
  onDropMedia?: (
    data: NonNullable<ReturnType<typeof parseMediaAssetDragData>>,
    position: { x: number; y: number },
  ) => void;
  onClipContextMenu?: (
    clipId: string,
    position: { x: number; y: number },
  ) => void;
};

const anchorTranslations: Record<string, string> = {
  "top-left": "0, 0",
  "top-center": "-50%, 0",
  "top-right": "-100%, 0",
  "middle-left": "0, -50%",
  center: "-50%, -50%",
  "middle-right": "-100%, -50%",
  "bottom-left": "0, -100%",
  "bottom-center": "-50%, -100%",
  "bottom-right": "-100%, -100%",
};
const anchorOrigins: Record<string, string> = {
  "top-left": "top left",
  "top-center": "top center",
  "top-right": "top right",
  "middle-left": "center left",
  center: "center",
  "middle-right": "center right",
  "bottom-left": "bottom left",
  "bottom-center": "bottom center",
  "bottom-right": "bottom right",
};
function boundsFor(
  elements: readonly CanvasVisualElement[],
  viewport: CanvasViewportSize,
) {
  const bounds = elements.map((element) =>
    canvasVisualBoundsInViewport(element, viewport),
  );
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

function intersects(
  a: ReturnType<typeof canvasVisualBounds>,
  b: ReturnType<typeof canvasVisualBounds>,
) {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}

export function CanvasInteractionLayer({
  projectId,
  timeline,
  components,
  frame,
  selectedIds,
  onSelect,
  onGestureStart,
  onTransform,
  onDuplicate,
  onGestureEnd,
  onGestureCancel,
  onDropMedia,
  onClipContextMenu,
}: CanvasInteractionLayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const pendingTransform = useRef<
    ReadonlyMap<string, CanvasTransform> | undefined
  >(undefined);
  const transformFrame = useRef<number | undefined>(undefined);
  const [mediaAspectRatios, setMediaAspectRatios] = useState<
    Record<string, number>
  >({});
  const [marquee, setMarquee] =
    useState<ReturnType<typeof canvasVisualBounds>>();
  const elements = timeline
    ? getCanvasVisualElements(timeline, components, frame)
    : [];
  const imageAssetIds = [
    ...new Set(
      elements
        .filter(
          (item) =>
            item.componentId === "image" || item.componentId === "video",
        )
        .map((item) => item.clip.content.assetId)
        .filter((assetId): assetId is string => typeof assetId === "string"),
    ),
  ];
  const mediaAssetSignature = imageAssetIds.join("|");
  useEffect(() => {
    let current = true;
    for (const assetId of imageAssetIds) {
      const key = `${projectId}:${assetId}`;
      if (mediaAspectRatios[key]) continue;
      const media = elements.find(
        (item) => item.clip.content.assetId === assetId,
      );
      if (media?.componentId === "video") {
        void fetch(
          `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/video`,
        )
          .then((response) => (response.ok ? response.json() : undefined))
          .then((metadata: { width?: number; height?: number } | undefined) => {
            if (
              !current ||
              !Number.isFinite(metadata?.width) ||
              !Number.isFinite(metadata?.height) ||
              !metadata?.width ||
              !metadata.height
            )
              return;
            setMediaAspectRatios((ratios) =>
              ratios[key]
                ? ratios
                : { ...ratios, [key]: metadata.width! / metadata.height! },
            );
          })
          .catch(() => undefined);
      } else {
        const image = new Image();
        image.onload = () => {
          if (!current || !image.naturalWidth || !image.naturalHeight) return;
          setMediaAspectRatios((ratios) =>
            ratios[key]
              ? ratios
              : {
                  ...ratios,
                  [key]: image.naturalWidth / image.naturalHeight,
                },
          );
        };
        image.src = `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/thumbnail`;
      }
    }
    return () => {
      current = false;
    };
  }, [projectId, mediaAssetSignature, mediaAspectRatios]);
  const selected = elements.filter((item) => selectedIds.includes(item.id));
  const measuredSize = root.current?.getBoundingClientRect();
  const renderViewport = {
    width: Math.max(1, measuredSize?.width ?? 100),
    height: Math.max(1, measuredSize?.height ?? 100),
  };
  const selectionBounds =
    selected.length > 0 ? boundsFor(selected, renderViewport) : undefined;
  const [snapGuides, setSnapGuides] = useState<CanvasSnapGuides>({});

  function scheduleTransform(changes: ReadonlyMap<string, CanvasTransform>) {
    pendingTransform.current = changes;
    if (transformFrame.current !== undefined) return;
    transformFrame.current = requestAnimationFrame(() => {
      transformFrame.current = undefined;
      const latest = pendingTransform.current;
      pendingTransform.current = undefined;
      if (latest) onTransform(latest);
    });
  }

  function flushTransform(canceled: boolean) {
    if (transformFrame.current !== undefined) {
      cancelAnimationFrame(transformFrame.current);
      transformFrame.current = undefined;
    }
    const latest = pendingTransform.current;
    pendingTransform.current = undefined;
    if (!canceled && latest) onTransform(latest);
  }

  useEffect(
    () => () => {
      if (transformFrame.current !== undefined)
        cancelAnimationFrame(transformFrame.current);
    },
    [],
  );

  function viewportSize(): CanvasViewportSize {
    const rect = root.current?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ?? 100),
      height: Math.max(1, rect?.height ?? 100),
    };
  }

  function point<T extends HTMLElement>(event: PointerEvent<T>): Point {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return { x: event.clientX, y: event.clientY };
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function start<T extends HTMLElement>(
    event: PointerEvent<T>,
    mode: Gesture["mode"],
    target?: CanvasVisualElement,
    handle?: Gesture["handle"],
  ) {
    if (event.button === 1) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportSize();
    const duplicate =
      mode === "move" &&
      target &&
      (event.ctrlKey || event.metaKey || event.altKey);
    if (duplicate && target) {
      const initial = selectedIds.includes(target.id) ? selected : [target];
      if (initial.some((item) => item.locked || !item.operations.move)) return;
      onGestureStart();
      gesture.current = {
        pointerId: event.pointerId,
        mode,
        start: point(event),
        initial,
        viewport,
        active: false,
        checkpointed: false,
        additive: false,
        duplicate: true,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setMarquee(undefined);
      return;
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let deselectOnClick: string | undefined;
    let initial = selected;
    if (target) {
      if (event.shiftKey && selectedIds.includes(target.id)) {
        deselectOnClick = target.id;
      } else if (additive && selectedIds.includes(target.id)) {
        onSelect(selectedIds.filter((id) => id !== target.id));
        return;
      }
      if (
        !additive &&
        selectedIds.length > 1 &&
        selectedIds.includes(target.id)
      ) {
        onSelect([target.id]);
        initial = [target];
      }
      if (!selectedIds.includes(target.id)) {
        const next = additive ? [...selectedIds, target.id] : [target.id];
        onSelect(next);
        initial = additive ? [...selected, target] : [target];
      }
      if (
        target.locked ||
        (mode === "move" && !target.operations.move) ||
        (mode === "resize" && !target.operations.resize) ||
        (mode === "rotate" && !target.operations.rotate)
      )
        return;
    }
    if (mode === "marquee") initial = [];
    gesture.current = {
      pointerId: event.pointerId,
      mode,
      start: point(event),
      initial,
      viewport,
      handle,
      active: false,
      checkpointed: false,
      additive,
      deselectOnClick,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee(undefined);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const here = point(event);
    let dx = here.x - current.start.x;
    let dy = here.y - current.start.y;
    if (!current.active && Math.hypot(dx, dy) < 3) return;
    if (!current.active && current.mode !== "marquee") current.active = true;
    if (current.mode === "marquee") {
      setMarquee({
        left: Math.min(current.start.x, here.x),
        top: Math.min(current.start.y, here.y),
        right: Math.max(current.start.x, here.x),
        bottom: Math.max(current.start.y, here.y),
      });
      return;
    }
    if (!current.active) return;
    if (current.mode === "move" && event.shiftKey) {
      current.axisLock ??= Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (current.axisLock === "x") dy = 0;
      else dx = 0;
      current.deselectOnClick = undefined;
    } else if (current.mode === "move") {
      current.axisLock = undefined;
    }
    if (current.duplicate && !current.duplicateAttempted) {
      current.duplicateAttempted = true;
      const duplicates = onDuplicate(current.initial.map((item) => item.id));
      const copied = current.initial
        .map((item) => duplicates.get(item.id))
        .filter((item): item is CanvasVisualElement => Boolean(item));
      if (!copied.length) {
        current.active = false;
        return;
      }
      current.checkpointed = true;
      current.initial = copied;
      current.duplicate = false;
      current.deselectOnClick = undefined;
    }
    const changes = new Map<string, CanvasTransform>();
    if (current.mode === "move") {
      const snapped = snapCanvasMove(
        current.initial,
        current.viewport,
        dx,
        dy,
        10,
        current.axisLock,
      );
      dx = snapped.dx;
      dy = snapped.dy;
      setSnapGuides(snapped.guides);
      for (const item of current.initial) {
        if (item.locked || !item.operations.move) continue;
        changes.set(item.id, {
          ...item.transform,
          x: item.transform.x + (dx / current.viewport.width) * 100,
          y: item.transform.y + (dy / current.viewport.height) * 100,
        });
      }
    } else if (current.mode === "rotate") {
      setSnapGuides({});
      const selection = boundsFor(current.initial, current.viewport);
      const center = {
        x: (selection.left + selection.right) / 2,
        y: (selection.top + selection.bottom) / 2,
      };
      const startAngle = Math.atan2(
        current.start.y - center.y,
        current.start.x - center.x,
      );
      const nextAngle = Math.atan2(here.y - center.y, here.x - center.x);
      const degrees = ((nextAngle - startAngle) * 180) / Math.PI;
      const radians = (degrees * Math.PI) / 180;
      for (const item of current.initial) {
        if (item.locked || !item.operations.rotate || !item.operations.move)
          continue;
        const centerOfItem = canvasVisualCenterInViewport(
          item,
          current.viewport,
        );
        const relativeX = centerOfItem.x - center.x;
        const relativeY = centerOfItem.y - center.y;
        const nextCenter = {
          x:
            center.x +
            relativeX * Math.cos(radians) -
            relativeY * Math.sin(radians),
          y:
            center.y +
            relativeX * Math.sin(radians) +
            relativeY * Math.cos(radians),
        };
        const rotation = item.transform.rotation + degrees;
        changes.set(item.id, {
          ...item.transform,
          rotation,
          ...canvasAnchorPositionForCenter(
            nextCenter,
            { ...item.transform, rotation },
            current.viewport,
          ),
        });
      }
    } else if (current.mode === "resize" && current.handle) {
      setSnapGuides({});
      if (current.initial.length === 1) {
        const item = current.initial[0];
        if (!item.locked && item.operations.resize && item.operations.move) {
          const geometry = selectionElement(item);
          const center = canvasVisualCenterInViewport(item, current.viewport);
          const angle = (item.transform.rotation * Math.PI) / 180;
          const localDx = dx * Math.cos(angle) + dy * Math.sin(angle);
          const localDy = -dx * Math.sin(angle) + dy * Math.cos(angle);
          const oldWidth =
            (geometry.transform.width / 100) * current.viewport.width;
          const oldHeight =
            (geometry.transform.height / 100) * current.viewport.height;
          const minScaleX = 1 / item.transform.width;
          const minScaleY = 1 / item.transform.height;
          const activeScaleX =
            current.handle.x === 0
              ? 1
              : Math.max(
                  minScaleX,
                  (oldWidth + current.handle.x * localDx) / oldWidth,
                );
          const activeScaleY =
            current.handle.y === 0
              ? 1
              : Math.max(
                  minScaleY,
                  (oldHeight + current.handle.y * localDy) / oldHeight,
                );
          let scaleX = activeScaleX;
          let scaleY = activeScaleY;
          const constrainAspect =
            event.shiftKey ||
            (item.resizeMode === "preserve-aspect" &&
              current.handle.x !== 0 &&
              current.handle.y !== 0);
          const widthLimits = resizeScaleLimits(
            item,
            item.definition.canvas!.transform.width,
          );
          const heightLimits = resizeScaleLimits(
            item,
            item.definition.canvas!.transform.height,
          );
          if (constrainAspect) {
            let scale =
              current.handle.x === 0
                ? activeScaleY
                : current.handle.y === 0
                  ? activeScaleX
                  : Math.abs(activeScaleX - 1) >= Math.abs(activeScaleY - 1)
                    ? activeScaleX
                    : activeScaleY;
            let minScale = Math.max(widthLimits.min, heightLimits.min);
            let maxScale = Math.min(widthLimits.max, heightLimits.max);
            for (const key of item.definition.canvas!.resizeScaleFields ?? []) {
              const field = item.definition.fields.find(
                (candidate) => candidate.key === key,
              );
              const value = field
                ? item.clip[field.target][field.key]
                : undefined;
              if (field && typeof value === "number" && value > 0) {
                minScale = Math.max(minScale, (field.min ?? 1) / value);
                maxScale = Math.min(maxScale, (field.max ?? value) / value);
              }
            }
            const boundedScale = clampScale(scale, {
              min: Math.min(minScale, maxScale),
              max: maxScale,
            });
            scaleX = boundedScale;
            scaleY = boundedScale;
          } else {
            scaleX = clampScale(scaleX, widthLimits);
            scaleY = clampScale(scaleY, heightLimits);
            if (scaleX !== 1 && scaleY !== 1) {
              for (const key of item.definition.canvas!.resizeScaleFields ??
                []) {
                const field = item.definition.fields.find(
                  (candidate) => candidate.key === key,
                );
                const value = field
                  ? item.clip[field.target][field.key]
                  : undefined;
                if (field && typeof value === "number" && value > 0) {
                  const maxScale = (field.max ?? value) / value;
                  scaleX = Math.min(scaleX, maxScale);
                  scaleY = Math.min(scaleY, maxScale);
                }
              }
            }
          }
          const transform = {
            ...item.transform,
            width: Math.max(1, item.transform.width * scaleX),
            height: Math.max(1, item.transform.height * scaleY),
          };
          const localCenterShift = {
            x: (current.handle.x * (scaleX - 1) * oldWidth) / 2,
            y: (current.handle.y * (scaleY - 1) * oldHeight) / 2,
          };
          const updatedCenter = {
            x:
              center.x +
              localCenterShift.x * Math.cos(angle) -
              localCenterShift.y * Math.sin(angle),
            y:
              center.y +
              localCenterShift.x * Math.sin(angle) +
              localCenterShift.y * Math.cos(angle),
          };
          changes.set(item.id, {
            ...transform,
            ...canvasAnchorPositionForCenter(
              updatedCenter,
              transform,
              current.viewport,
            ),
          });
        }
      } else {
        const originalBounds = boundsFor(current.initial, current.viewport);
        const oldCenter = {
          x: (originalBounds.left + originalBounds.right) / 2,
          y: (originalBounds.top + originalBounds.bottom) / 2,
        };
        const fixed = {
          x:
            current.handle.x === 0
              ? oldCenter.x
              : current.handle.x < 0
                ? originalBounds.right
                : originalBounds.left,
          y:
            current.handle.y === 0
              ? oldCenter.y
              : current.handle.y < 0
                ? originalBounds.bottom
                : originalBounds.top,
        };
        const moving = {
          x:
            current.handle.x === 0
              ? oldCenter.x
              : (current.handle.x < 0
                  ? originalBounds.left
                  : originalBounds.right) + dx,
          y:
            current.handle.y === 0
              ? oldCenter.y
              : (current.handle.y < 0
                  ? originalBounds.top
                  : originalBounds.bottom) + dy,
        };
        const oldWidth = Math.max(
          1,
          originalBounds.right - originalBounds.left,
        );
        const oldHeight = Math.max(
          1,
          originalBounds.bottom - originalBounds.top,
        );
        const nextWidth =
          current.handle.x === 0
            ? oldWidth
            : Math.max(1, Math.abs(moving.x - fixed.x));
        const nextHeight =
          current.handle.y === 0
            ? oldHeight
            : Math.max(1, Math.abs(moving.y - fixed.y));
        let scaleX = nextWidth / oldWidth;
        let scaleY = nextHeight / oldHeight;
        if (event.shiftKey) {
          const scale =
            current.handle.x === 0
              ? scaleY
              : current.handle.y === 0
                ? scaleX
                : Math.abs(scaleX - 1) >= Math.abs(scaleY - 1)
                  ? scaleX
                  : scaleY;
          scaleX = scale;
          scaleY = scale;
        }
        const selectedLimits = current.initial.map((item) => ({
          width: resizeScaleLimits(
            item,
            item.definition.canvas!.transform.width,
          ),
          height: resizeScaleLimits(
            item,
            item.definition.canvas!.transform.height,
          ),
        }));
        const maxScaleX = Math.min(
          ...selectedLimits.map((item) => item.width.max),
        );
        const maxScaleY = Math.min(
          ...selectedLimits.map((item) => item.height.max),
        );
        const minScaleX = Math.max(
          ...selectedLimits.map((item) => item.width.min),
        );
        const minScaleY = Math.max(
          ...selectedLimits.map((item) => item.height.min),
        );
        if (event.shiftKey) {
          const minScale = Math.max(minScaleX, minScaleY);
          const maxScale = Math.min(maxScaleX, maxScaleY);
          const scale = clampScale(scaleX, {
            min: Math.min(minScale, maxScale),
            max: maxScale,
          });
          scaleX = scale;
          scaleY = scale;
        } else {
          scaleX = Math.max(minScaleX, Math.min(scaleX, maxScaleX));
          scaleY = Math.max(minScaleY, Math.min(scaleY, maxScaleY));
        }
        const constrainedMoving = event.shiftKey
          ? {
              x:
                current.handle.x === 0
                  ? oldCenter.x
                  : fixed.x + current.handle.x * oldWidth * scaleX,
              y:
                current.handle.y === 0
                  ? oldCenter.y
                  : fixed.y + current.handle.y * oldHeight * scaleY,
            }
          : moving;
        const nextCenter = {
          x:
            current.handle.x === 0
              ? oldCenter.x
              : (fixed.x + constrainedMoving.x) / 2,
          y:
            current.handle.y === 0
              ? oldCenter.y
              : (fixed.y + constrainedMoving.y) / 2,
        };
        const preserveAspectScale =
          Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        for (const item of current.initial) {
          if (item.locked || !item.operations.resize || !item.operations.move)
            continue;
          const center = canvasVisualCenterInViewport(item, current.viewport);
          const updatedCenter = {
            x: nextCenter.x + (center.x - oldCenter.x) * scaleX,
            y: nextCenter.y + (center.y - oldCenter.y) * scaleY,
          };
          const itemScaleX =
            item.resizeMode === "preserve-aspect"
              ? preserveAspectScale
              : scaleX;
          const itemScaleY =
            item.resizeMode === "preserve-aspect"
              ? preserveAspectScale
              : scaleY;
          const transform = {
            ...item.transform,
            width: Math.max(1, item.transform.width * itemScaleX),
            height: Math.max(1, item.transform.height * itemScaleY),
          };
          changes.set(item.id, {
            ...transform,
            ...canvasAnchorPositionForCenter(
              updatedCenter,
              transform,
              current.viewport,
            ),
          });
        }
      }
    }
    if (changes.size) {
      if (!current.checkpointed) {
        current.checkpointed = true;
        onGestureStart();
      }
      scheduleTransform(changes);
    }
  }

  function end(event: PointerEvent<HTMLDivElement>, canceled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    flushTransform(canceled);
    if (current.mode === "marquee" && !canceled) {
      const here = point(event);
      const finalRect = {
        left: Math.min(current.start.x, here.x),
        top: Math.min(current.start.y, here.y),
        right: Math.max(current.start.x, here.x),
        bottom: Math.max(current.start.y, here.y),
      };
      const hits = elements
        .filter((item) =>
          intersects(
            canvasVisualBoundsInViewport(item, current.viewport),
            finalRect,
          ),
        )
        .map((item) => item.id);
      onSelect(
        current.additive ? [...new Set([...selectedIds, ...hits])] : hits,
      );
    } else if (!current.active && current.deselectOnClick && !canceled) {
      onSelect(selectedIds.filter((id) => id !== current.deselectOnClick));
    } else if (current.checkpointed && canceled) onGestureCancel();
    else if (current.checkpointed) onGestureEnd();
    gesture.current = undefined;
    setMarquee(undefined);
    setSnapGuides({});
  }

  function elementStyle(item: CanvasVisualElement): React.CSSProperties {
    return {
      position: "absolute",
      left: `${item.transform.x}%`,
      top: `${item.transform.y}%`,
      width: `${item.transform.width}%`,
      height: `${item.transform.height}%`,
      transform: `translate(${anchorTranslations[item.transform.anchor]}) rotate(${item.transform.rotation}deg)`,
      transformOrigin: anchorOrigins[item.transform.anchor],
      pointerEvents: "auto",
    };
  }

  function isContainedImage(item: CanvasVisualElement) {
    if (item.componentId !== "image" && item.componentId !== "video")
      return false;
    const fitField = item.definition.fields.find(
      (field) => field.key === "fit",
    );
    return (item.clip.props.fit ?? fitField?.default) === "contain";
  }

  function resizeScaleLimits(item: CanvasVisualElement, key: string) {
    const field = item.definition.fields.find(
      (candidate) => candidate.key === key,
    );
    const current = item.transform[key as keyof CanvasTransform];
    if (typeof current !== "number" || current <= 0)
      return { min: 0.01, max: 100 };
    return {
      min: (field?.min ?? 1) / current,
      max: (field?.max ?? 100) / current,
    };
  }

  function clampScale(value: number, limits: { min: number; max: number }) {
    return Math.max(limits.min, Math.min(limits.max, value));
  }

  function selectionElement(item: CanvasVisualElement) {
    const assetId = item.clip.content.assetId;
    const ratio =
      (item.componentId === "image" || item.componentId === "video") &&
      typeof assetId === "string"
        ? (mediaAspectRatios[`${projectId}:${assetId}`] ??
          item.clip.content.aspectRatio)
        : undefined;
    if (
      !ratio ||
      !isContainedImage(item) ||
      !Number.isFinite(ratio) ||
      ratio <= 0
    )
      return item;
    const boxWidth = (item.transform.width / 100) * renderViewport.width;
    const boxHeight = (item.transform.height / 100) * renderViewport.height;
    const boxRatio = boxWidth / boxHeight;
    const width = boxRatio > ratio ? boxHeight * ratio : boxWidth;
    const height = boxRatio > ratio ? boxHeight : boxWidth / ratio;
    const center = canvasVisualCenterInViewport(item, renderViewport);
    return {
      ...item,
      transform: {
        ...item.transform,
        x: (center.x / renderViewport.width) * 100,
        y: (center.y / renderViewport.height) * 100,
        width: (width / renderViewport.width) * 100,
        height: (height / renderViewport.height) * 100,
        anchor: "center" as const,
      },
    };
  }

  function percent(value: number, dimension: number) {
    return `${(value / dimension) * 100}%`;
  }

  function allowMediaDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MEDIA_ASSET_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function dropMedia(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MEDIA_ASSET_DRAG_TYPE)) return;
    event.preventDefault();
    const data = parseMediaAssetDragData(
      event.dataTransfer.getData(MEDIA_ASSET_DRAG_TYPE),
    );
    const rect = root.current?.getBoundingClientRect();
    if (!data || !rect || !onDropMedia) return;
    onDropMedia(data, {
      x: Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
      ),
      y: Math.max(
        0,
        Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
      ),
    });
  }

  return (
    <div
      ref={root}
      className="canvas-interaction-layer"
      data-testid="canvas-interaction-layer"
      onPointerDown={(event) => start(event, "marquee")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(event) => end(event, true)}
      onDragOver={allowMediaDrop}
      onDrop={dropMedia}
    >
      {elements.map((item) => {
        const isSelected = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            className={`canvas-element-hitbox${isSelected ? " is-selected" : ""}${isSelected && selected.length === 1 ? " is-single-selected" : ""}${item.locked ? " is-locked" : ""}`}
            style={elementStyle(item)}
            data-canvas-element-id={item.id}
            aria-label={`Select ${item.componentId} ${item.id}`}
            aria-pressed={isSelected}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => start(event, "move", item)}
            onContextMenu={(event) => {
              if (!onClipContextMenu) return;
              event.preventDefault();
              event.stopPropagation();
              onSelect([item.id]);
              onClipContextMenu(item.id, {
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onKeyDown={(event) => {
              if (event.defaultPrevented) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              const additive = event.shiftKey || event.ctrlKey || event.metaKey;
              onSelect(
                additive
                  ? selectedIds.includes(item.id)
                    ? selectedIds.filter((id) => id !== item.id)
                    : [...selectedIds, item.id]
                  : [item.id],
              );
            }}
          />
        );
      })}
      {snapGuides.x !== undefined && (
        <div
          className="canvas-snap-guide vertical"
          style={{ left: percent(snapGuides.x, renderViewport.width) }}
          aria-hidden="true"
        />
      )}
      {snapGuides.y !== undefined && (
        <div
          className="canvas-snap-guide horizontal"
          style={{ top: percent(snapGuides.y, renderViewport.height) }}
          aria-hidden="true"
        />
      )}
      {selected.length === 1 && (
        <div
          className="canvas-single-bounds"
          style={{
            ...elementStyle(selectionElement(selected[0])),
            pointerEvents: "none",
          }}
          data-testid="canvas-selection-bounds"
        >
          {selected[0].operations.resize &&
            selected[0].operations.move &&
            !selected[0].locked &&
            ([-1, 0, 1] as const).flatMap((x) =>
              ([-1, 0, 1] as const)
                .filter((y) => x !== 0 || y !== 0)
                .map((y) => (
                  <button
                    key={`${x}:${y}`}
                    type="button"
                    aria-label={`Resize selection ${x < 0 ? "left" : x > 0 ? "right" : "center"} ${y < 0 ? "top" : y > 0 ? "bottom" : "center"}`}
                    title="Resize freely; hold Shift to keep proportions"
                    className={`canvas-transform-handle resize-handle ${x === 0 ? "resize-handle-vertical" : y === 0 ? "resize-handle-horizontal" : x === y ? "resize-handle-diagonal-forward" : "resize-handle-diagonal-backward"}`}
                    style={{
                      left: x < 0 ? 0 : x > 0 ? "100%" : "50%",
                      top: y < 0 ? 0 : y > 0 ? "100%" : "50%",
                    }}
                    onPointerDown={(event) =>
                      start(event, "resize", undefined, { x, y })
                    }
                  />
                )),
            )}
          {selected[0].operations.rotate &&
            selected[0].operations.move &&
            !selected[0].locked && (
              <button
                type="button"
                aria-label="Rotate selection"
                title="Drag to rotate"
                className="canvas-transform-handle rotate-handle"
                style={{ left: "50%" }}
                onPointerDown={(event) => start(event, "rotate")}
              />
            )}
        </div>
      )}
      {selected.length > 1 && selectionBounds && (
        <div
          className="canvas-group-bounds"
          style={{
            left: percent(selectionBounds.left, renderViewport.width),
            top: percent(selectionBounds.top, renderViewport.height),
            width: percent(
              selectionBounds.right - selectionBounds.left,
              renderViewport.width,
            ),
            height: percent(
              selectionBounds.bottom - selectionBounds.top,
              renderViewport.height,
            ),
          }}
          data-testid="canvas-selection-bounds"
        >
          {selected.every(
            (item) =>
              item.operations.resize && item.operations.move && !item.locked,
          ) &&
            ([-1, 0, 1] as const).flatMap((x) =>
              ([-1, 0, 1] as const)
                .filter((y) => x !== 0 || y !== 0)
                .map((y) => (
                  <button
                    key={`${x}:${y}`}
                    type="button"
                    aria-label={`Resize selection ${x < 0 ? "left" : x > 0 ? "right" : "center"} ${y < 0 ? "top" : y > 0 ? "bottom" : "center"}`}
                    title="Resize freely; hold Shift to keep proportions"
                    className={`canvas-transform-handle resize-handle ${x === 0 ? "resize-handle-vertical" : y === 0 ? "resize-handle-horizontal" : x === y ? "resize-handle-diagonal-forward" : "resize-handle-diagonal-backward"}`}
                    style={{
                      left: x < 0 ? 0 : x > 0 ? "100%" : "50%",
                      top: y < 0 ? 0 : y > 0 ? "100%" : "50%",
                    }}
                    onPointerDown={(event) =>
                      start(event, "resize", undefined, { x, y })
                    }
                  />
                )),
            )}
          {selected.every(
            (item) =>
              item.operations.rotate && item.operations.move && !item.locked,
          ) && (
            <button
              type="button"
              aria-label="Rotate selection"
              title="Drag to rotate the selected group"
              className="canvas-transform-handle rotate-handle group-rotate-handle"
              style={{ left: "50%" }}
              onPointerDown={(event) => start(event, "rotate")}
            />
          )}
        </div>
      )}
      {marquee && (
        <div
          className="canvas-marquee"
          style={{
            left: percent(marquee.left, renderViewport.width),
            top: percent(marquee.top, renderViewport.height),
            width: percent(marquee.right - marquee.left, renderViewport.width),
            height: percent(
              marquee.bottom - marquee.top,
              renderViewport.height,
            ),
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
