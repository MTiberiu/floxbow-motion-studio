import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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

const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8] as const;
type ZoomAnchor = { fraction: number; width: number; scrollLeft: number };

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
  const zoomRef = useRef(1);
  const zoomAnchor = useRef<ZoomAnchor | undefined>(undefined);
  const wheelDelta = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);
  const zoomBaseWidth = Math.max(
    viewportWidth,
    scroll.current?.clientWidth ?? 0,
  );
  const hasDocument = Boolean(document);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [hasDocument]);

  function changeZoom(nextZoom: number, clientX?: number) {
    const currentZoom = zoomRef.current;
    const nextIndex = ZOOM_STEPS.indexOf(
      nextZoom as (typeof ZOOM_STEPS)[number],
    );
    if (nextIndex < 0 || nextZoom === currentZoom) return;
    const rulerElement = ruler.current;
    const scrollElement = scroll.current;
    if (rulerElement && scrollElement) {
      const rect = rulerElement.getBoundingClientRect();
      const viewport = scrollElement.getBoundingClientRect();
      const requestedX = clientX ?? viewport.left + viewport.width / 2;
      const anchorX = Math.max(
        Math.max(rect.left, viewport.left),
        Math.min(Math.min(rect.right, viewport.right), requestedX),
      );
      zoomAnchor.current = {
        fraction: rect.width ? (anchorX - rect.left) / rect.width : 0,
        width: rect.width,
        scrollLeft: scrollElement.scrollLeft,
      };
    }
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const scrollElement = scroll.current;
    const rulerElement = ruler.current;
    if (!anchor || !scrollElement || !rulerElement) return;
    const width = rulerElement.getBoundingClientRect().width;
    scrollElement.scrollLeft =
      anchor.scrollLeft + anchor.fraction * (width - anchor.width);
    zoomAnchor.current = undefined;
  }, [zoom, viewportWidth]);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      wheelDelta.current += event.deltaY;
      if (Math.abs(wheelDelta.current) < 60) return;
      const direction = wheelDelta.current < 0 ? 1 : -1;
      wheelDelta.current = 0;
      const index = ZOOM_STEPS.indexOf(
        zoomRef.current as (typeof ZOOM_STEPS)[number],
      );
      const nextIndex = Math.max(
        0,
        Math.min(ZOOM_STEPS.length - 1, index + direction),
      );
      changeZoom(ZOOM_STEPS[nextIndex], event.clientX);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [hasDocument]);

  function begin(event: PointerEvent, clip: TimelineClip, mode: Drag["mode"]) {
    if (!document || !ruler.current) return;
    event.stopPropagation();
    onSelectClip(clip.id);
    if (clip.componentId === "soundtrack") return;
    event.currentTarget.setPointerCapture(event.pointerId);
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
        <div className="timeline-zoom-controls">
          <span>Zoom</span>
          <button
            type="button"
            aria-label="Zoom Timeline out"
            disabled={zoom === ZOOM_STEPS[0]}
            onClick={() =>
              changeZoom(
                ZOOM_STEPS[
                  Math.max(
                    0,
                    ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) - 1,
                  )
                ],
              )
            }
          >
            −
          </button>
          <select
            aria-label="Timeline zoom"
            value={zoom}
            onChange={(event) => changeZoom(+event.target.value)}
          >
            {ZOOM_STEPS.map((step) => (
              <option key={step} value={step}>
                {step === 1 ? "Fit" : `${step}×`}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Zoom Timeline in"
            disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() =>
              changeZoom(
                ZOOM_STEPS[
                  Math.min(
                    ZOOM_STEPS.length - 1,
                    ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) + 1,
                  )
                ],
              )
            }
          >
            +
          </button>
        </div>
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
            minWidth: zoom === 1 ? "100%" : `${zoomBaseWidth * zoom}px`,
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
                  .map((clip) => {
                    const fixedSoundtrack = clip.componentId === "soundtrack";
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          fixedSoundtrack
                            ? `Audio clip ${clip.id}; timing fixed`
                            : `Clip ${clip.id}`
                        }
                        aria-pressed={selectedClipId === clip.id}
                        data-clip-id={clip.id}
                        data-range-locked={fixedSoundtrack ? "true" : undefined}
                        title={
                          fixedSoundtrack
                            ? "Soundtrack timing is fixed to the selected audio duration."
                            : undefined
                        }
                        className={`timeline-clip ${clip.componentId === "subtitles" ? "subtitle-clip" : ""} ${fixedSoundtrack ? "audio-clip range-locked" : ""} ${selectedClipId === clip.id ? "is-selected" : ""}`}
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
                            if (fixedSoundtrack) return;
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
                        {!fixedSoundtrack && (
                          <button
                            className="resize-handle left"
                            aria-label={`Resize start ${clip.id}`}
                            onPointerDown={(event) =>
                              begin(event, clip, "left")
                            }
                          />
                        )}
                        <span className="clip-title">
                          {String(clip.content.text ?? clip.label)}
                        </span>
                        <small>
                          {clip.from}–{clip.from + clip.durationInFrames}
                        </small>
                        {!fixedSoundtrack && (
                          <button
                            className="resize-handle right"
                            aria-label={`Resize end ${clip.id}`}
                            onPointerDown={(event) =>
                              begin(event, clip, "right")
                            }
                          />
                        )}
                      </div>
                    );
                  })}
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
