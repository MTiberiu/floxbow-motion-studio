import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { TimelineClip } from "@motion/sdk/timeline";
import { FocusedTrackTimeline } from "./FocusedTrackTimeline";

type Position = { x: number; y: number };

export function ClipContextPopup({
  clip,
  position: initialPosition,
  onChangeText,
  onChangeColor,
  timeline,
  onClose,
}: {
  clip: TimelineClip;
  position: Position;
  onChangeText: (clipId: string, text: string) => void;
  onChangeColor: (clipId: string, color: string) => void;
  timeline: {
    clips: readonly TimelineClip[];
    trackName: string;
    frame: number;
    fps: number;
    durationInFrames: number;
    playing: boolean;
    onSelectClip: (clipId: string) => void;
    onSeek: (frame: number) => void;
    onTogglePlayback: () => void;
  };
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { pointerId: number; x: number; y: number; left: number; top: number }
    | undefined
  >(undefined);
  const [position, setPosition] = useState(() =>
    clampPosition(initialPosition),
  );

  useEffect(() => {
    setPosition(clampPosition(initialPosition));
  }, [clip.id, initialPosition.x, initialPosition.y]);

  useEffect(() => {
    const dismissOutside = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target)
      )
        onClose();
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("keydown", dismissEscape);
    };
  }, [onClose]);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: position.x,
      top: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPosition(
      clampPosition({
        x: current.left + event.clientX - current.x,
        y: current.top + event.clientY - current.y,
      }),
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
  }

  const text = String(clip.content.text ?? "");
  const color =
    typeof clip.props.color === "string" ? clip.props.color : "#ffffff";

  return createPortal(
    <div
      ref={panel}
      className="text-context-popup"
      role="dialog"
      aria-label={`Edit ${clip.componentId} clip`}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="text-context-popup-header"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span>
          {clip.componentId === "text"
            ? "Text"
            : clip.label || clip.componentId}
        </span>
        <span className="text-context-popup-hint">Drag to move</span>
        <button type="button" aria-label="Close clip editor" onClick={onClose}>
          ×
        </button>
      </div>
      {clip.componentId === "text" ? (
        <>
          <label>
            Text content
            <textarea
              aria-label="Text content"
              value={text}
              maxLength={20_000}
              rows={3}
              onChange={(event) =>
                onChangeText(clip.id, event.currentTarget.value)
              }
            />
          </label>
          <label className="text-context-color-control">
            Text color
            <span>
              <input
                aria-label="Text color"
                type="color"
                value={color}
                onChange={(event) =>
                  onChangeColor(clip.id, event.currentTarget.value)
                }
              />
              <output>{color.toUpperCase()}</output>
            </span>
          </label>
        </>
      ) : (
        <div className="clip-context-summary">
          <span>{clip.componentId}</span>
          <strong>{clip.label || String(clip.content.text ?? clip.id)}</strong>
        </div>
      )}
      <FocusedTrackTimeline
        clips={timeline.clips}
        selectedClipId={clip.id}
        trackName={timeline.trackName}
        frame={timeline.frame}
        fps={timeline.fps}
        durationInFrames={timeline.durationInFrames}
        playing={timeline.playing}
        onSelectClip={timeline.onSelectClip}
        onSeek={timeline.onSeek}
        onTogglePlayback={timeline.onTogglePlayback}
      />
    </div>,
    document.body,
  );
}

function clampPosition(position: Position): Position {
  const width = 360;
  const height = 370;
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
  };
}
