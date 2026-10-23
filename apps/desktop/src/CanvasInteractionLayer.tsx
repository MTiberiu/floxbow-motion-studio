import { useRef, useState, type PointerEvent } from "react";
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
};

export type CanvasInteractionLayerProps = {
  timeline?: EditTimeline;
  components: readonly ComponentInfo[];
  frame: number;
  selectedIds: readonly string[];
  onSelect: (ids: readonly string[]) => void;
  onGestureStart: () => void;
  onTransform: (changes: ReadonlyMap<string, CanvasTransform>) => void;
  onGestureEnd: () => void;
  onGestureCancel: () => void;
  onDropMedia?: (
    data: NonNullable<ReturnType<typeof parseMediaAssetDragData>>,
    position: { x: number; y: number },
  ) => void;
  spaceHeld?: boolean;
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
  timeline,
  components,
  frame,
  selectedIds,
  onSelect,
  onGestureStart,
  onTransform,
  onGestureEnd,
  onGestureCancel,
  onDropMedia,
  spaceHeld = false,
}: CanvasInteractionLayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const [marquee, setMarquee] =
    useState<ReturnType<typeof canvasVisualBounds>>();
  const elements = timeline
    ? getCanvasVisualElements(timeline, components, frame)
    : [];
  const selected = elements.filter((item) => selectedIds.includes(item.id));
  const measuredSize = root.current?.getBoundingClientRect();
  const renderViewport = {
    width: Math.max(1, measuredSize?.width ?? 100),
    height: Math.max(1, measuredSize?.height ?? 100),
  };
  const selectionBounds =
    selected.length > 0 ? boundsFor(selected, renderViewport) : undefined;

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
    if (spaceHeld || event.button === 1) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportSize();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let initial = selected;
    if (target) {
      if (additive && selectedIds.includes(target.id)) {
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
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee(undefined);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const here = point(event);
    const dx = here.x - current.start.x;
    const dy = here.y - current.start.y;
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
    const changes = new Map<string, CanvasTransform>();
    if (current.mode === "move") {
      for (const item of current.initial) {
        if (item.locked || !item.operations.move) continue;
        changes.set(item.id, {
          ...item.transform,
          x: item.transform.x + (dx / current.viewport.width) * 100,
          y: item.transform.y + (dy / current.viewport.height) * 100,
        });
      }
    } else if (current.mode === "rotate") {
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
      const originalBounds = boundsFor(current.initial, current.viewport);
      const fixed = {
        x: current.handle.x < 0 ? originalBounds.right : originalBounds.left,
        y: current.handle.y < 0 ? originalBounds.bottom : originalBounds.top,
      };
      const moving = {
        x:
          (current.handle.x < 0 ? originalBounds.left : originalBounds.right) +
          dx,
        y:
          (current.handle.y < 0 ? originalBounds.top : originalBounds.bottom) +
          dy,
      };
      const oldWidth = Math.max(1, originalBounds.right - originalBounds.left);
      const oldHeight = Math.max(1, originalBounds.bottom - originalBounds.top);
      const nextWidth = Math.max(1, Math.abs(moving.x - fixed.x));
      const nextHeight = Math.max(1, Math.abs(moving.y - fixed.y));
      const scaleX = nextWidth / oldWidth;
      const scaleY = nextHeight / oldHeight;
      const oldCenter = {
        x: (originalBounds.left + originalBounds.right) / 2,
        y: (originalBounds.top + originalBounds.bottom) / 2,
      };
      const nextCenter = {
        x: (fixed.x + moving.x) / 2,
        y: (fixed.y + moving.y) / 2,
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
          item.resizeMode === "preserve-aspect" ? preserveAspectScale : scaleX;
        const itemScaleY =
          item.resizeMode === "preserve-aspect" ? preserveAspectScale : scaleY;
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
    if (changes.size) {
      if (!current.checkpointed) {
        current.checkpointed = true;
        onGestureStart();
      }
      onTransform(changes);
    }
  }

  function end(event: PointerEvent<HTMLDivElement>, canceled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
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
    } else if (current.checkpointed && canceled) onGestureCancel();
    else if (current.checkpointed) onGestureEnd();
    gesture.current = undefined;
    setMarquee(undefined);
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
            className={`canvas-element-hitbox${isSelected ? " is-selected" : ""}${item.locked ? " is-locked" : ""}`}
            style={elementStyle(item)}
            data-canvas-element-id={item.id}
            aria-label={`Select ${item.componentId} ${item.id}`}
            aria-pressed={isSelected}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => start(event, "move", item)}
            onKeyDown={(event) => {
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
      {selected.length > 0 && selectionBounds && (
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
            ([-1, 1] as const).flatMap((x) =>
              ([-1, 1] as const).map((y) => (
                <button
                  key={`${x}:${y}`}
                  type="button"
                  aria-label={`Resize selection ${x < 0 ? "left" : "right"} ${y < 0 ? "top" : "bottom"}`}
                  className="canvas-transform-handle resize-handle"
                  style={{ left: x < 0 ? 0 : "100%", top: y < 0 ? 0 : "100%" }}
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
              className="canvas-transform-handle rotate-handle group-rotate-handle"
              style={{ left: "50%", top: 0 }}
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
