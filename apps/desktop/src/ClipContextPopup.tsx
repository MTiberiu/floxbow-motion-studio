import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { TimelineClip } from "@motion/sdk/timeline";
import { EditorIconButton } from "./EditorIconButton";

type Position = { x: number; y: number };

export function ClipContextPopup({
  clip,
  position: initialPosition,
  onChangeText,
  onChangeColor,
  onChangeFontSize,
  onImagePreset,
  onResetImageSize,
  onClipOperation,
  canEditClip,
  canDuplicate,
  canDelete,
  timelineView,
  frame,
  visualRequest,
  onVisualRequestChange,
  onSendVisualContext,
  visualContextBusy,
  visualContextStatus,
  canSendVisualContext,
  onClose,
}: {
  clip: TimelineClip;
  position: Position;
  onChangeText: (clipId: string, text: string) => void;
  onChangeColor: (clipId: string, color: string) => void;
  onChangeFontSize: (clipId: string, fontSize: number) => void;
  onImagePreset: (
    clipId: string,
    preset: "center" | "fit" | "fill" | "flip",
  ) => void;
  onResetImageSize: (clipId: string) => Promise<void>;
  onClipOperation: (clipId: string, operation: "duplicate" | "delete") => void;
  canEditClip: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  timelineView: ReactNode;
  frame: number;
  visualRequest: string;
  onVisualRequestChange: (value: string) => void;
  onSendVisualContext: () => void;
  visualContextBusy: boolean;
  visualContextStatus: string;
  canSendVisualContext: boolean;
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
  const [resettingImageSize, setResettingImageSize] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "ai-context">("edit");

  useEffect(() => {
    setPosition(clampPosition(initialPosition));
    setActiveTab("edit");
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
      <div className="clip-context-tabs" role="tablist" aria-label="Clip tools">
        <button
          id="clip-edit-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "edit"}
          aria-controls="clip-edit-panel"
          onClick={() => setActiveTab("edit")}
        >
          Edit
        </button>
        <button
          id="clip-ai-context-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "ai-context"}
          aria-controls="clip-ai-context-panel"
          onClick={() => setActiveTab("ai-context")}
        >
          AI Visual Context
        </button>
      </div>
      {activeTab === "edit" ? (
        <section
          id="clip-edit-panel"
          className="clip-context-tab-panel"
          role="tabpanel"
          aria-labelledby="clip-edit-tab"
        >
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
              <label className="text-context-font-size-control">
                Font size
                <input
                  aria-label="Font size"
                  type="number"
                  min={clip.componentId === "subtitles" ? 12 : 8}
                  max={clip.componentId === "subtitles" ? 220 : 500}
                  step={1}
                  value={Number(
                    clip.props.fontSize ??
                      (clip.componentId === "subtitles" ? 68 : 72),
                  )}
                  disabled={!canEditClip}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (Number.isFinite(value)) onChangeFontSize(clip.id, value);
                  }}
                />
              </label>
            </>
          ) : (
            <div className="clip-context-summary">
              <span>{clip.componentId}</span>
              <strong>
                {clip.label || String(clip.content.text ?? clip.id)}
              </strong>
            </div>
          )}
          {clip.componentId === "image" && (
            <div
              className="clip-context-image-actions editor-icon-actions"
              aria-label="Image actions"
            >
              <EditorIconButton
                icon="center"
                label="Center on Canvas"
                disabled={!canEditClip}
                onClick={() => onImagePreset(clip.id, "center")}
              />
              <EditorIconButton
                icon="fit"
                label="Fit inside Canvas"
                disabled={!canEditClip}
                onClick={() => onImagePreset(clip.id, "fit")}
              />
              <EditorIconButton
                icon="fill"
                label="Fill Canvas"
                disabled={!canEditClip}
                onClick={() => onImagePreset(clip.id, "fill")}
              />
              <EditorIconButton
                icon="flip"
                label="Flip horizontally"
                aria-pressed={clip.props.flipHorizontal === true}
                disabled={!canEditClip}
                onClick={() => onImagePreset(clip.id, "flip")}
              />
              <EditorIconButton
                icon="reset"
                label={
                  resettingImageSize
                    ? "Reading original image size"
                    : "Reset size to original image dimensions"
                }
                disabled={!canEditClip || resettingImageSize}
                onClick={() => {
                  setResettingImageSize(true);
                  void onResetImageSize(clip.id).finally(() =>
                    setResettingImageSize(false),
                  );
                }}
              />
              <EditorIconButton
                icon="duplicate"
                label="Duplicate clip"
                disabled={!canDuplicate}
                onClick={() => onClipOperation(clip.id, "duplicate")}
              />
              <EditorIconButton
                icon="delete"
                label="Delete clip"
                disabled={!canDelete}
                onClick={() => onClipOperation(clip.id, "delete")}
              />
            </div>
          )}
          {timelineView}
        </section>
      ) : (
        <section
          id="clip-ai-context-panel"
          className="clip-context-tab-panel clip-context-ai-panel"
          role="tabpanel"
          aria-labelledby="clip-ai-context-tab"
        >
          <div className="clip-context-ai-heading">
            <strong>AI Visual Context</strong>
            <span>
              Frame {frame} · {clip.label || clip.componentId}
            </span>
          </div>
          <label htmlFor="clip-ai-context-request">
            What should the AI know about this element?
          </label>
          <textarea
            id="clip-ai-context-request"
            aria-label="AI visual context details"
            value={visualRequest}
            maxLength={4000}
            rows={4}
            placeholder="Describe the visual change or details you want the AI to use…"
            onChange={(event) =>
              onVisualRequestChange(event.currentTarget.value)
            }
          />
          <button
            className="clip-context-send"
            type="button"
            onClick={onSendVisualContext}
            disabled={
              !canSendVisualContext || visualContextBusy || !visualRequest.trim()
            }
          >
            {visualContextBusy ? "Preparing…" : "Send"}
          </button>
          <p className="clip-context-ai-note">
            Captures this Canvas frame and prepares your note for an AI request.
            Direct AI sending is not connected yet.
          </p>
          <span className="clip-context-ai-status" role="status">
            {visualContextStatus}
          </span>
        </section>
      )}
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
