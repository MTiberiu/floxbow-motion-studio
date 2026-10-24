import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RefObject } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { ComponentInfo, EditTimeline } from "@motion/sdk/timeline";
import {
  formatFrameTime,
  frameToSeconds,
  secondsToFrame,
} from "@motion/sdk/timeline";
import { CanvasInteractionLayer } from "./CanvasInteractionLayer";
import type { CanvasTransform, CanvasVisualElement } from "@motion/sdk/canvas";
import type { MediaAssetDragData } from "./media-drag";

export type CanvasViewProps = {
  manifest: ProjectManifest;
  previewOrigin: string;
  built: boolean;
  reload: number;
  previewGeneration: number;
  frame: number;
  playing: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  onPreviewLoad: () => void;
  onSeek: (frame: number) => void;
  onPlay: () => void;
  onPause: () => void;
  masterVolume: number;
  onMasterVolumeChange: (volume: number) => void;
  timeline?: EditTimeline;
  components: readonly ComponentInfo[];
  selectedClipIds: readonly string[];
  onSelectClips: (ids: readonly string[]) => void;
  onCanvasGestureStart: () => void;
  onCanvasTransform: (changes: ReadonlyMap<string, CanvasTransform>) => void;
  onCanvasDuplicate: (
    clipIds: readonly string[],
  ) => ReadonlyMap<string, CanvasVisualElement>;
  onCanvasGestureEnd: () => void;
  onCanvasGestureCancel: () => void;
  onDropMedia?: (
    data: MediaAssetDragData,
    position: { x: number; y: number },
  ) => void;
};

export function CanvasView({
  manifest,
  previewOrigin,
  built,
  reload,
  previewGeneration,
  frame,
  playing,
  iframeRef,
  surfaceRef,
  onPreviewLoad,
  onSeek,
  onPlay,
  onPause,
  masterVolume,
  onMasterVolumeChange,
  timeline,
  components,
  selectedClipIds,
  onSelectClips,
  onCanvasGestureStart,
  onCanvasTransform,
  onCanvasDuplicate,
  onCanvasGestureEnd,
  onCanvasGestureCancel,
  onDropMedia,
}: CanvasViewProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const panDrag = useRef<
    { x: number; y: number; panX: number; panY: number } | undefined
  >(undefined);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen) setFullscreen(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [fullscreen]);

  const fitScale = Math.min(
    (viewportSize.width - 32) / manifest.width,
    (viewportSize.height - 32) / manifest.height,
  );
  const currentScale = scale ?? Math.max(0.05, fitScale || 0.1);

  function setZoom(mode: "fit" | "actual" | "in" | "out") {
    if (mode === "fit") {
      setScale(null);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (mode === "actual") {
      setScale(1);
      return;
    }
    setScale(
      Math.max(
        0.1,
        Math.min(4, currentScale * (mode === "in" ? 1.2 : 1 / 1.2)),
      ),
    );
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey || !viewport.current) return;
    event.preventDefault();
    const rect = viewport.current.getBoundingClientRect();
    const next = Math.max(
      0.1,
      Math.min(4, currentScale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
    );
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);
    setPan((current) => ({
      x:
        offsetX * (1 - next / currentScale) + (current.x * next) / currentScale,
      y:
        offsetY * (1 - next / currentScale) + (current.y * next) / currentScale,
    }));
    setScale(next);
  }

  function onPanStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panDrag.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }

  function onPanMove(event: PointerEvent<HTMLDivElement>) {
    const drag = panDrag.current;
    if (drag)
      setPan({
        x: drag.panX + event.clientX - drag.x,
        y: drag.panY + event.clientY - drag.y,
      });
  }

  function onPanEnd() {
    panDrag.current = undefined;
  }

  return (
    <div className="preview-pane" data-editor-view="canvas">
      <div className="canvas-toolbar" aria-label="Canvas navigation">
        <button onClick={() => setZoom("fit")}>Fit</button>
        <button aria-label="Zoom out" onClick={() => setZoom("out")}>
          −
        </button>
        <button aria-label="Zoom in" onClick={() => setZoom("in")}>
          +
        </button>
        <button onClick={() => setZoom("actual")}>100%</button>
        <button
          aria-label="Reset canvas view"
          onClick={() => {
            setZoom("fit");
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
        <span>{Math.round(currentScale * 100)}%</span>
        <label className="preview-volume-control">
          Preview volume
          <input
            aria-label="Application preview volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(event) =>
              onMasterVolumeChange(Number(event.target.value))
            }
          />
          <output>{Math.round(masterVolume * 100)}%</output>
        </label>
        <button
          onClick={() => setFullscreen(true)}
          title="Fullscreen video preview"
        >
          Fullscreen
        </button>
      </div>
      <div
        className={`preview-stage ${fullscreen ? "preview-fullscreen" : ""}`}
        ref={viewport}
        onWheel={onWheel}
      >
        {fullscreen && (
          <button
            className="canvas-fullscreen-exit"
            onClick={() => setFullscreen(false)}
          >
            Exit fullscreen · Esc
          </button>
        )}
        <div
          className="canvas-surface"
          ref={surfaceRef}
          style={
            {
              width: manifest.width,
              height: manifest.height,
              translate: `${pan.x}px ${pan.y}px`,
              transform: `translate(-50%,-50%) scale(${currentScale})`,
              "--canvas-inverse-scale": 1 / currentScale,
            } as React.CSSProperties
          }
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
        >
          <iframe
            ref={iframeRef}
            key={`${reload}:${previewGeneration}`}
            data-preview-generation={`${reload}:${previewGeneration}`}
            title="Composition preview"
            sandbox="allow-scripts allow-same-origin"
            allow="autoplay"
            onLoad={onPreviewLoad}
            src={
              built
                ? `${previewOrigin}/${manifest.id}/index.html`
                : `${previewOrigin}/preview.html?project=${encodeURIComponent(manifest.id)}&hostOrigin=${encodeURIComponent(window.location.origin)}`
            }
          />
          <CanvasInteractionLayer
            projectId={manifest.id}
            timeline={timeline}
            components={components}
            frame={frame}
            selectedIds={selectedClipIds}
            onSelect={onSelectClips}
            onGestureStart={onCanvasGestureStart}
            onTransform={onCanvasTransform}
            onDuplicate={onCanvasDuplicate}
            onGestureEnd={onCanvasGestureEnd}
            onGestureCancel={onCanvasGestureCancel}
            onDropMedia={onDropMedia}
          />
        </div>
        <div
          className="canvas-pan-surface"
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
        />
      </div>
      <div className="transport">
        <button onClick={() => onSeek(frame - 1)} aria-label="Previous frame">
          −1 frame
        </button>
        <button onClick={playing ? onPause : onPlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => onSeek(frame + 1)} aria-label="Next frame">
          +1 frame
        </button>
        <label>
          Time (seconds){" "}
          <input
            aria-label="Playhead time (seconds)"
            data-fps={manifest.fps}
            type="number"
            min={0}
            max={frameToSeconds(manifest.durationInFrames - 1, manifest.fps)}
            step={0.001}
            value={frameToSeconds(frame, manifest.fps).toFixed(3)}
            onChange={(event) =>
              onSeek(secondsToFrame(Number(event.target.value), manifest.fps))
            }
          />
        </label>
        <output data-testid="frame-readout">
          {frame} / {manifest.durationInFrames - 1} ·{" "}
          {formatFrameTime(frame, manifest.fps)}
        </output>
      </div>
    </div>
  );
}
