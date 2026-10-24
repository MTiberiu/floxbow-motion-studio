import {
  canvasVisualBoundsInViewport,
  type CanvasVisualElement,
  type CanvasViewportSize,
} from "@motion/sdk/canvas";

export type CanvasSnapGuides = { x?: number; y?: number };
export type CanvasMoveSnap = {
  dx: number;
  dy: number;
  guides: CanvasSnapGuides;
};

function nearestAlignment(
  bounds: { start: number; end: number },
  delta: number,
  dimension: number,
  threshold: number,
) {
  const center = (bounds.start + bounds.end) / 2 + delta;
  const candidates = [
    { correction: -(bounds.start + delta), guide: 0 },
    { correction: dimension / 2 - center, guide: dimension / 2 },
    { correction: dimension - (bounds.end + delta), guide: dimension },
  ];
  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate.correction) < Math.abs(best.correction)
      ? candidate
      : best,
  );
  return Math.abs(nearest.correction) <= threshold ? nearest : undefined;
}

/** Snap a moved element/group to Canvas edges and center without changing its geometry. */
export function snapCanvasMove(
  elements: readonly CanvasVisualElement[],
  viewport: CanvasViewportSize,
  dx: number,
  dy: number,
  threshold = 10,
  lockedAxis?: "x" | "y",
): CanvasMoveSnap {
  if (!elements.length) return { dx, dy, guides: {} };
  const bounds = elements.map((element) =>
    canvasVisualBoundsInViewport(element, viewport),
  );
  const group = {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
  const x =
    lockedAxis === "y"
      ? undefined
      : nearestAlignment(
          { start: group.left, end: group.right },
          dx,
          viewport.width,
          threshold,
        );
  const y =
    lockedAxis === "x"
      ? undefined
      : nearestAlignment(
          { start: group.top, end: group.bottom },
          dy,
          viewport.height,
          threshold,
        );
  return {
    dx: dx + (x?.correction ?? 0),
    dy: dy + (y?.correction ?? 0),
    guides: {
      ...(x ? { x: x.guide } : {}),
      ...(y ? { y: y.guide } : {}),
    },
  };
}
