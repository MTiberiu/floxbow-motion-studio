import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  changeClipRange,
  type ComponentInfo,
  type EditTimeline,
  type TimelineClip,
} from "@motion/sdk/timeline";

type Drag = {
  clip: TimelineClip;
  mode: "move" | "left" | "right";
  x: number;
  timeline: EditTimeline;
  pixels: number;
  scrollLeft: number;
  gestureId: string;
};

export type TimelineViewProps = {
  manifest: Pick<ProjectManifest, "id" | "fps" | "durationInFrames"> & {
    editTimeline?: string;
  };
  document?: EditTimeline;
  components: readonly ComponentInfo[];
  selectedClipId: string;
  frame: number;
  playing?: boolean;
  onEdit: (
    next: EditTimeline | ((current: EditTimeline) => EditTimeline),
    checkpoint?: boolean,
  ) => void;
  onSelectClip: (clipId: string) => void;
  onSeek: (frame: number) => void;
  onPause: () => void;
  onPlay?: () => void;
  onBeginClipGesture: (gestureId: string, clipId: string) => void;
  onUpdateClipGesture: (
    gestureId: string,
    clipId: string,
    from: number,
    durationInFrames: number,
    trim: boolean,
  ) => void;
  onEndClipGesture: (gestureId: string) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: () => void;
  onAddSubtitle: () => void;
  onImportFile: (file: File | undefined) => void;
  onExportTiming: (format: "json" | "srt" | "lrc") => void;
  onExportDocument: () => void;
};

export function TimelineView({
  manifest,
  document,
  components,
  selectedClipId,
  frame,
  playing = false,
  onEdit,
  onSelectClip,
  onSeek,
  onPause,
  onPlay,
  onBeginClipGesture,
  onUpdateClipGesture,
  onEndClipGesture,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onAddSubtitle,
  onImportFile,
  onExportTiming,
  onExportDocument,
}: TimelineViewProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  function begin(event: PointerEvent, clip: TimelineClip, mode: Drag["mode"]) {
    if (!document || !ruler.current) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectClip(clip.id);
    onPause();
    const gestureId = crypto.randomUUID();
    onBeginClipGesture(gestureId, clip.id);
    drag.current = {
      clip: structuredClone(clip),
      mode,
      x: event.clientX,
      timeline: structuredClone(document),
      pixels: ruler.current.getBoundingClientRect().width,
      scrollLeft: scroll.current?.scrollLeft ?? 0,
      gestureId,
    };
  }

  function move(event: PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const scrollDelta =
      (scroll.current?.scrollLeft ?? current.scrollLeft) - current.scrollLeft;
    const delta = Math.round(
      ((event.clientX - current.x + scrollDelta) / current.pixels) *
        manifest.durationInFrames,
    );
    let start = current.clip.from;
    let end = start + current.clip.durationInFrames;
    if (current.mode === "move") {
      start = Math.max(
        0,
        Math.min(
          manifest.durationInFrames - current.clip.durationInFrames,
          start + delta,
        ),
      );
      end = start + current.clip.durationInFrames;
    } else if (current.mode === "left") {
      start = Math.max(0, Math.min(end - 1, start + delta));
    } else {
      end = Math.max(
        start + 1,
        Math.min(manifest.durationInFrames, end + delta),
      );
    }
    onUpdateClipGesture(
      current.gestureId,
      current.clip.id,
      start,
      end - start,
      current.mode !== "move",
    );
  }

  function finish() {
    if (drag.current) onEndClipGesture(drag.current.gestureId);
    drag.current = undefined;
  }

  function scrub(event: PointerEvent<HTMLDivElement>) {
    if (!ruler.current) return;
    const rect = ruler.current.getBoundingClientRect();
    onSeek(
      ((event.clientX - rect.left) / rect.width) * manifest.durationInFrames,
    );
  }

  return document ? (
    <div className="timeline-dock" data-editor-view="timeline">
      <button
        className="timeline-resize"
        aria-label="Resize timeline height"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
      <div className="timeline-actions">
        <h3>
          Timeline{" "}
          <small>
            {document.fps} FPS · {document.tracks.length} tracks
          </small>
        </h3>
        <button
          disabled={
            !components.some((component) => component.id === "subtitles")
          }
          onClick={onAddSubtitle}
        >
          Add subtitle
        </button>
        <button
          type="button"
          aria-label={
            playing ? "Pause Timeline playback" : "Play Timeline playback"
          }
          onClick={playing ? onPause : onPlay}
          disabled={!onPlay && !playing}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() =>
            onEdit((current) => ({
              ...current,
              tracks: [
                ...current.tracks,
                {
                  id: `track-${crypto.randomUUID()}`,
                  name: `Track ${current.tracks.length + 1}`,
                },
              ],
            }))
          }
        >
          Add track
        </button>
        <label>
          Zoom{" "}
          <select
            aria-label="Timeline zoom"
            value={zoom}
            onChange={(event) => setZoom(+event.target.value)}
          >
            <option value={1}>Fit</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <label>
          View{" "}
          <input
            aria-label="Timeline playhead frame"
            type="number"
            min={0}
            max={manifest.durationInFrames - 1}
            value={frame}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="timeline-scroll" ref={scroll}>
        <div
          className="timeline-canvas"
          style={{
            minWidth:
              zoom === 1
                ? "100%"
                : `${Math.max(760, viewportWidth - 120) * zoom + 120}px`,
          }}
        >
          <div className="ruler-row">
            <div className="track-label">TRACKS</div>
            <div
              className="time-ruler"
              ref={ruler}
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={0}
              aria-valuemax={manifest.durationInFrames - 1}
              aria-valuenow={frame}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  onSeek(frame - 1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  onSeek(frame + 1);
                }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                scrub(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) scrub(event);
              }}
            >
              {Array.from({ length: 11 }, (_, index) => (
                <span key={index} style={{ left: `${index * 10}%` }}>
                  {(
                    ((document.durationInFrames / document.fps) * index) /
                    10
                  ).toFixed(1)}
                  s
                </span>
              ))}
              <div
                className="playhead-line"
                style={{
                  left: `${(frame / document.durationInFrames) * 100}%`,
                }}
              />
              <div
                className="playhead-cap"
                style={{
                  left: `${(frame / document.durationInFrames) * 100}%`,
                }}
              />
            </div>
          </div>
          {document.tracks.map((track) => (
            <div className="track-row" key={track.id}>
              <div className="track-label">{track.name}</div>
              <div
                className="track-lane"
                data-track={track.id}
                onPointerDown={() => onSelectClip("")}
              >
                {document.clips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => (
                    <div
                      key={clip.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Clip ${clip.id}`}
                      aria-pressed={selectedClipId === clip.id}
                      data-clip-id={clip.id}
                      className={`timeline-clip ${clip.componentId === "subtitles" ? "subtitle-clip" : ""} ${clip.componentId === "soundtrack" ? "audio-clip" : ""} ${selectedClipId === clip.id ? "is-selected" : ""}`}
                      style={{
                        left: `${(clip.from / document.durationInFrames) * 100}%`,
                        width: `${(clip.durationInFrames / document.durationInFrames) * 100}%`,
                      }}
                      onPointerDown={(event) => begin(event, clip, "move")}
                      onPointerMove={move}
                      onPointerUp={finish}
                      onPointerCancel={finish}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectClip(clip.id);
                        }
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          onEdit((current) => {
                            const latest = current.clips.find(
                              (candidate) => candidate.id === clip.id,
                            );
                            if (!latest) return current;
                            const start = Math.max(
                              0,
                              Math.min(
                                current.durationInFrames -
                                  latest.durationInFrames,
                                latest.from +
                                  (event.key === "ArrowRight" ? 1 : -1),
                              ),
                            );
                            return changeClipRange(
                              current,
                              latest.id,
                              start,
                              start + latest.durationInFrames,
                            );
                          });
                        }
                      }}
                    >
                      <button
                        className="resize-handle left"
                        aria-label={`Resize start ${clip.id}`}
                        onPointerDown={(event) => begin(event, clip, "left")}
                      />
                      <span className="clip-title">
                        {String(clip.content.text ?? clip.label)}
                      </span>
                      <small>
                        {clip.from}–{clip.from + clip.durationInFrames}
                      </small>
                      <button
                        className="resize-handle right"
                        aria-label={`Resize end ${clip.id}`}
                        onPointerDown={(event) => begin(event, clip, "right")}
                      />
                    </div>
                  ))}
                <div
                  className="playhead-line"
                  style={{
                    left: `${(frame / document.durationInFrames) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="timeline-footer">
        <label className="button">
          Import subtitles / timeline
          <input
            aria-label="Import subtitles"
            type="file"
            accept=".json,.srt,.lrc"
            onChange={(event) => {
              onImportFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button onClick={() => onExportTiming("json")}>
          Export timing JSON
        </button>
        <button onClick={() => onExportTiming("srt")}>Export SRT</button>
        <button onClick={() => onExportTiming("lrc")}>Export LRC</button>
        <button onClick={onExportDocument}>Export editable timeline</button>
      </div>
    </div>
  ) : (
    <p className="muted timeline-loading" data-editor-view="timeline">
      {manifest.editTimeline
        ? "Loading editable timeline…"
        : "This code-only project has no declared timeline. Playback remains available."}
    </p>
  );
}
