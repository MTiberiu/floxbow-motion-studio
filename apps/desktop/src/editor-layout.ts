export const MIN_TIMELINE_DOCK_HEIGHT = 170;
export const TIMELINE_HEADER_HEIGHT = 34;
export const MIN_TIMELINE_HEIGHT =
  MIN_TIMELINE_DOCK_HEIGHT + TIMELINE_HEADER_HEIGHT;
export const DEFAULT_TIMELINE_HEIGHT = 280;
const MAX_TIMELINE_HEIGHT_RATIO = 0.55;

/** Keep persisted and responsive Timeline sizing from consuming the Canvas. */
export function clampTimelineHeight(value: number, viewportHeight: number) {
  const maximum = Math.max(
    MIN_TIMELINE_HEIGHT,
    Math.round(viewportHeight * MAX_TIMELINE_HEIGHT_RATIO),
  );
  const candidate = Number.isFinite(value) ? value : DEFAULT_TIMELINE_HEIGHT;
  return Math.round(Math.max(MIN_TIMELINE_HEIGHT, Math.min(maximum, candidate)));
}
