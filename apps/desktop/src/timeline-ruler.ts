export type TimelineRulerMark = {
  frame: number;
  position: number;
  major: boolean;
  label?: string;
};

const MAJOR_TIME_STEPS_SECONDS = [
  10, 15, 20, 30, 60, 120, 300, 600, 1200, 3600,
];

function formatRulerTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/** Generate readable 10-second ruler marks, widening the interval at Fit zoom. */
export function createTimelineRulerMarks(
  durationInFrames: number,
  fps: number,
  width: number,
  minimumMajorSpacing = 64,
): TimelineRulerMark[] {
  if (
    !Number.isFinite(durationInFrames) ||
    durationInFrames <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    !Number.isFinite(width) ||
    width <= 0
  )
    return [];
  const durationSeconds = durationInFrames / fps;
  const pixelsPerSecond = width / durationSeconds;
  const majorStep =
    MAJOR_TIME_STEPS_SECONDS.find(
      (step) => step * pixelsPerSecond >= minimumMajorSpacing,
    ) ?? MAJOR_TIME_STEPS_SECONDS.at(-1)!;
  const minorStep = majorStep / 2;
  const markCount = Math.floor(durationSeconds / minorStep);
  const marks: TimelineRulerMark[] = [];
  for (let index = 0; index <= markCount; index += 1) {
    const seconds = index * minorStep;
    const frame = Math.round(seconds * fps);
    const major = index % 2 === 0;
    marks.push({
      frame,
      position: (frame / durationInFrames) * 100,
      major,
      label: major ? formatRulerTime(seconds) : undefined,
    });
  }
  return marks;
}
