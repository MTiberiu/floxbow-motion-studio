import { useRef, useState, type PointerEvent } from "react";
import {
  canvasVisualBounds,
  getCanvasVisualElements,
  type CanvasTransform,
  type CanvasVisualElement,
} from "@motion/sdk/canvas";
import type { ComponentInfo, EditTimeline } from "@motion/sdk/timeline";

type Point = { x: number; y: number };
type Gesture = {
  pointerId: number;
  mode: "move" | "resize" | "rotate" | "marquee";
  start: Point;
  initial: CanvasVisualElement[];
  handle?: { x: number; y: number };
  active: boolean;
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
  spaceHeld?: boolean;
};

const anchorTranslations: Record<string, string> = {
  "top-left": "0 0",
  "top-center": "-50% 0",
  "top-right": "-100% 0",
  "middle-left": "0 -50%",
  center: "-50% -50%",
  "middle-right": "-100% -50%",
  "bottom-left": "0 -100%",
  "bottom-center": "-50% -100%",
  "bottom-right": "-100% -100%",
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
const anchorFactors: Record<string, Point> = {
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

function centerOf(element: CanvasVisualElement): Point {
  const anchor = anchorFactors[element.transform.anchor];
  return {
    x: element.transform.x + (0.5 - anchor.x) * element.transform.width,
    y: element.transform.y + (0.5 - anchor.y) * element.transform.height,
  };
}

function anchorAt(center: Point, transform: CanvasTransform): Point {
  const anchor = anchorFactors[transform.anchor];
  const radians = (transform.rotation * Math.PI) / 180;
  const x = (anchor.x - 0.5) * transform.width;
  const y = (anchor.y - 0.5) * transform.height;
  return {
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function boundsFor(elements: readonly CanvasVisualElement[]) {
  const bounds = elements.map(canvasVisualBounds);
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
  const selectionBounds = selected.length ? boundsFor(selected) : undefined;

  function point<T extends HTMLElement>(event: PointerEvent<T>): Point {
    const rect = root.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
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
      handle,
      active: false,
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
    if (!current.active && Math.hypot(dx, dy) < 0.35) return;
    if (!current.active && current.mode !== "marquee") {
      current.active = true;
      onGestureStart();
    }
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
          x: item.transform.x + dx,
          y: item.transform.y + dy,
        });
      }
    } else if (current.mode === "rotate") {
      const selection = boundsFor(current.initial);
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
        const centerOfItem = centerOf(item);
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
          ...anchorAt(nextCenter, { ...item.transform, rotation }),
        });
      }
    } else if (current.mode === "resize" && current.handle) {
      const originalBounds = boundsFor(current.initial);
      const fixed = {
        x: current.handle.x < 0 ? originalBounds.right : originalBounds.left,
        y: current.handle.y < 0 ? originalBounds.bottom : originalBounds.top,
      };
      const moving = {
        x: current.start.x + dx,
        y: current.start.y + dy,
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
      for (const item of current.initial) {
        if (item.locked || !item.operations.resize || !item.operations.move)
          continue;
        const center = centerOf(item);
        const updatedCenter = {
          x: nextCenter.x + (center.x - oldCenter.x) * scaleX,
          y: nextCenter.y + (center.y - oldCenter.y) * scaleY,
        };
        const transform = {
          ...item.transform,
          width: Math.max(1, item.transform.width * scaleX),
          height: Math.max(1, item.transform.height * scaleY),
        };
        changes.set(item.id, {
          ...transform,
          ...anchorAt(updatedCenter, transform),
        });
      }
    }
    if (changes.size) onTransform(changes);
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.mode === "marquee") {
      const here = point(event);
      const finalRect = {
        left: Math.min(current.start.x, here.x),
        top: Math.min(current.start.y, here.y),
        right: Math.max(current.start.x, here.x),
        bottom: Math.max(current.start.y, here.y),
      };
      const hits = elements
        .filter((item) => intersects(canvasVisualBounds(item), finalRect))
        .map((item) => item.id);
      onSelect(
        current.additive ? [...new Set([...selectedIds, ...hits])] : hits,
      );
    } else if (current.active) onGestureEnd();
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

  return (
    <div
      ref={root}
      className="canvas-interaction-layer"
      data-testid="canvas-interaction-layer"
      onPointerDown={(event) => start(event, "marquee")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
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
            left: `${selectionBounds.left}%`,
            top: `${selectionBounds.top}%`,
            width: `${selectionBounds.right - selectionBounds.left}%`,
            height: `${selectionBounds.bottom - selectionBounds.top}%`,
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
              onPointerDown={(event) => start(event, "rotate", selected[0])}
            />
          )}
        </div>
      )}
      {marquee && (
        <div
          className="canvas-marquee"
          style={{
            left: `${marquee.left}%`,
            top: `${marquee.top}%`,
            width: `${marquee.right - marquee.left}%`,
            height: `${marquee.bottom - marquee.top}%`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
