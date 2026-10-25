import { useMemo, useState } from "react";
import type { TimelineClip } from "@motion/sdk/timeline";
import { formatFrameTime } from "@motion/sdk/timeline";

const ZOOM_LEVELS = [4, 6, 8, 12, 18, 24, 36, 48] as const;

export function clipsForTrack(
  clips: readonly TimelineClip[],
  trackId: string,
): TimelineClip[] {
  return clips.filter((clip) => clip.trackId === trackId);
}

export function FocusedTrackTimeline({
  clips,
  selectedClipId,
  trackName,
  frame,
  fps,
  durationInFrames,
  playing,
  onSelectClip,
  onSeek,
  onTogglePlayback,
}: {
  clips: readonly TimelineClip[];
  selectedClipId: string;
  trackName: string;
  frame: number;
  fps: number;
  durationInFrames: number;
  playing: boolean;
  onSelectClip: (clipId: string) => void;
  onSeek: (frame: number) => void;
  onTogglePlayback: () => void;
}) {
  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.from - b.from),
    [clips],
  );
  const [zoomIndex, setZoomIndex] = useState(3);
  if (!sortedClips.length) return null;
  const selectedIndex = Math.max(
    0,
    sortedClips.findIndex((clip) => clip.id === selectedClipId),
  );
  const selected = sortedClips[selectedIndex];
  const visibleFrames = Math.min(
    durationInFrames,
    Math.max(1, Math.round(ZOOM_LEVELS[zoomIndex] * fps)),
  );
  const rangeStart = Math.max(
    0,
    Math.min(
      Math.round(
        selected.from + selected.durationInFrames / 2 - visibleFrames / 2,
      ),
      Math.max(0, durationInFrames - visibleFrames),
    ),
  );
  const rangeEnd = Math.min(durationInFrames - 1, rangeStart + visibleFrames);
  const rangeLength = Math.max(1, rangeEnd - rangeStart);
  const playheadPercent = Math.max(
    0,
    Math.min(100, ((frame - rangeStart) / rangeLength) * 100),
  );
  const previous = sortedClips[selectedIndex - 1];
  const next = sortedClips[selectedIndex + 1];

  if (!selected) return null;

  return (
    <section
      className="focused-text-timeline"
      aria-label="Focused track timeline"
    >
      <div className="focused-text-timeline-heading">
        <span className="focused-text-track-name" title={trackName}>
          {trackName}
        </span>
        <span className="focused-text-timeline-actions">
          <button
            type="button"
            aria-label="Previous clip in this track"
            title="Previous clip"
            disabled={!previous}
            onClick={() => previous && onSelectClip(previous.id)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={playing ? "Pause playback" : "Play playback"}
            title={playing ? "Pause" : "Play"}
            onClick={onTogglePlayback}
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <button
            type="button"
            aria-label="Next clip in this track"
            title="Next clip"
            disabled={!next}
            onClick={() => next && onSelectClip(next.id)}
          >
            ›
          </button>
          <span className="focused-text-timeline-divider" />
          <button
            type="button"
            aria-label="Zoom in focused timeline"
            title="Zoom in"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out focused timeline"
            title="Zoom out"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() =>
              setZoomIndex((value) =>
                Math.min(ZOOM_LEVELS.length - 1, value + 1),
              )
            }
          >
            −
          </button>
        </span>
      </div>
      <div className="focused-text-time-labels" aria-hidden="true">
        <span>{formatFrameTime(rangeStart, fps)}</span>
        <span>{formatFrameTime(rangeEnd, fps)}</span>
      </div>
      <div className="focused-text-lane" aria-label={`${trackName} clips`}>
        <span
          className="focused-text-playhead"
          style={{ left: `${playheadPercent}%` }}
          aria-hidden="true"
        />
        {sortedClips.map((clip) => {
          const clipEnd = clip.from + clip.durationInFrames;
          if (clipEnd < rangeStart || clip.from > rangeEnd) return null;
          const left = Math.max(
            0,
            ((clip.from - rangeStart) / rangeLength) * 100,
          );
          const right = Math.min(
            100,
            ((clipEnd - rangeStart) / rangeLength) * 100,
          );
          return (
            <button
              key={clip.id}
              type="button"
              className={`focused-text-clip${clip.id === selectedClipId ? " is-current" : ""}`}
              style={{
                left: `${left}%`,
                width: `${Math.max(1.5, right - left)}%`,
              }}
              title={`${clip.label} · ${formatFrameTime(clip.from, fps)}`}
              aria-label={`Select ${clip.label} at ${formatFrameTime(clip.from, fps)}`}
              aria-current={clip.id === selectedClipId ? "true" : undefined}
              onClick={() => onSelectClip(clip.id)}
            >
              <span>{clip.label || "Text"}</span>
            </button>
          );
        })}
      </div>
      <input
        className="focused-text-scrubber"
        aria-label="Seek focused timeline"
        type="range"
        min={rangeStart}
        max={rangeEnd}
        step={1}
        value={Math.max(rangeStart, Math.min(rangeEnd, frame))}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
      <div className="focused-text-time-current" aria-live="off">
        {formatFrameTime(frame, fps)}
        <span>· {ZOOM_LEVELS[zoomIndex]} sec view</span>
      </div>
    </section>
  );
}
