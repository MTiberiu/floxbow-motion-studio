import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { TimelineClip } from "@motion/sdk/timeline";

type Position = { x: number; y: number };

export function ClipContextPopup({
  clip,
  position: initialPosition,
  onChangeText,
  onChangeColor,
  onToggleImageFlip,
  timelineView,
  onClose,
}: {
  clip: TimelineClip;
  position: Position;
  onChangeText: (clipId: string, text: string) => void;
  onChangeColor: (clipId: string, color: string) => void;
  onToggleImageFlip: (clipId: string) => void;
  timelineView: ReactNode;
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
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", dismissEscape);
    return () => {
      window.removeEventListener("keydown", dismissEscape);
    };
  }, [onClose]);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button"))
      return;
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
      {clip.componentId === "text" || clip.componentId === "subtitles" ? (
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
      {clip.componentId === "image" && (
        <div className="clip-context-image-actions">
          <button
            type="button"
            className="icon-tool-button"
            aria-label="Flip horizontally"
            title="Flip horizontally"
            aria-pressed={clip.props.flipHorizontal === true}
            onClick={() => onToggleImageFlip(clip.id)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2v16M8 5 3 10l5 5M12 5l5 5-5 5" />
            </svg>
          </button>
        </div>
      )}
      {timelineView}
    </div>,
    document.body,
  );
}

function clampPosition(position: Position): Position {
  const width = 360;
  const height = 520;
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
  };
}
