import type {
  EditableField,
  EditTimeline,
  TimelineClip,
} from "@motion/sdk/timeline";
import type { ComponentInfo } from "@motion/sdk/timeline";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  fieldValue,
  formatFrameTime,
  frameToSeconds,
  secondsToFrame,
} from "@motion/sdk/timeline";
import { subtitleWordTimingMatchesText } from "@motion/lyrics-sync/subtitles";
import type { ChangeEvent } from "react";
import { isAudioTimelineClip, isAudioTrack } from "./timeline-track-utils";

export type InspectorViewProps = {
  manifest: ProjectManifest;
  document?: EditTimeline;
  clip?: TimelineClip;
  definition?: ComponentInfo;
  onEdit: (
    next: EditTimeline | ((current: EditTimeline) => EditTimeline),
  ) => void;
  onChangeProperty: (field: EditableField, value: unknown) => void;
  onChangeRange: (start: number, end: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSeparateVideoAudio?: () => void;
  canChangeRange?: boolean;
  canChangeTrack?: boolean;
  canEditProperties?: boolean;
  canDuplicate?: boolean;
  canDelete?: boolean;
  selectedCount?: number;
};

export function InspectorView({
  manifest,
  document,
  clip,
  definition,
  onEdit,
  onChangeProperty,
  onChangeRange,
  onDuplicate,
  onDelete,
  onSeparateVideoAudio,
  canChangeRange = true,
  canChangeTrack = canChangeRange,
  canEditProperties = true,
  canDuplicate = true,
  canDelete = true,
  selectedCount = 1,
}: InspectorViewProps) {
  return (
    <section
      className="properties"
      aria-label="Clip properties"
      data-editor-view="inspector"
    >
      <span className="eyebrow">INSPECTOR</span>
      {clip && document ? (
        selectedCount > 1 ? (
          <>
            <h3>{selectedCount} elements selected</h3>
            <small>Canvas and Timeline selection are synchronized.</small>
            <p className="muted">
              Drag the selection to move the group. Use Canvas handles to resize
              or rotate it. Select one element to edit its individual
              properties.
            </p>
          </>
        ) : (
          <>
            <h3>{definition?.name ?? clip.componentId}</h3>
            <small data-testid="declared-fields">
              {definition?.fields.map((field) => field.key).join(",") ??
                "metadata pending"}
            </small>
            <small>{clip.id}</small>
            <label>
              {isAudioTimelineClip(clip) ? "Audio track" : "Track"}
              <select
                aria-label={
                  isAudioTimelineClip(clip) ? "Audio track" : "Clip track"
                }
                disabled={!canChangeTrack}
                value={clip.trackId}
                onChange={(event) =>
                  onEdit((current) => ({
                    ...current,
                    clips: current.clips.map((candidate) =>
                      candidate.id === clip.id
                        ? { ...candidate, trackId: event.target.value }
                        : candidate,
                    ),
                  }))
                }
              >
                {document.tracks
                  .filter((track) =>
                    isAudioTimelineClip(clip)
                      ? isAudioTrack(document, track)
                      : !isAudioTrack(document, track),
                  )
                  .filter((track) => !track.locked || track.id === clip.trackId)
                  .map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="range-fields">
              <label>
                Start time (seconds)
                <input
                  aria-label="Clip start time (seconds)"
                  data-fps={manifest.fps}
                  disabled={!canChangeRange}
                  type="number"
                  min={0}
                  max={frameToSeconds(
                    clip.from + clip.durationInFrames - 1,
                    manifest.fps,
                  )}
                  step={0.001}
                  value={frameToSeconds(clip.from, manifest.fps).toFixed(3)}
                  onChange={(event) =>
                    onChangeRange(
                      secondsToFrame(Number(event.target.value), manifest.fps),
                      clip.from + clip.durationInFrames,
                    )
                  }
                />
              </label>
              <label>
                End time (seconds)
                <input
                  aria-label="Clip end time (seconds)"
                  data-fps={manifest.fps}
                  disabled={!canChangeRange}
                  type="number"
                  min={frameToSeconds(clip.from + 1, manifest.fps)}
                  max={frameToSeconds(manifest.durationInFrames, manifest.fps)}
                  step={0.001}
                  value={frameToSeconds(
                    clip.from + clip.durationInFrames,
                    manifest.fps,
                  ).toFixed(3)}
                  onChange={(event) =>
                    onChangeRange(
                      clip.from,
                      secondsToFrame(Number(event.target.value), manifest.fps),
                    )
                  }
                />
              </label>
            </div>
            <small>
              {formatFrameTime(clip.from, manifest.fps)} →{" "}
              {formatFrameTime(clip.from + clip.durationInFrames, manifest.fps)}
              · frames {clip.from}–{clip.from + clip.durationInFrames} (end
              exclusive)
            </small>
            {definition?.fields.map((field) => (
              <PropertyControl
                key={field.key}
                field={field}
                value={fieldValue(clip, field)}
                onChange={(value) => onChangeProperty(field, value)}
                disabled={!canEditProperties}
              />
            ))}
            {!definition?.fields.length && (
              <p className="muted">
                This scene exposes timing only. Its animation stays in the
                project’s component.
              </p>
            )}
            {clip.componentId === "subtitles" && (
              <p className="muted">
                {Array.isArray(clip.content.words)
                  ? subtitleWordTimingMatchesText(
                      clip.content as Parameters<
                        typeof subtitleWordTimingMatchesText
                      >[0],
                    )
                    ? `${clip.content.words.length} timed words. Moving and trimming preserve their spoken positions.`
                    : "Word timing is preserved, but does not match this text; karaoke highlighting is paused."
                  : "No word timing. Text editing never invents karaoke timing."}
                <br />
                Timing: {String(clip.content.status ?? "unverified")}
                {clip.content.repeatOf && (
                  <> · repeat of {String(clip.content.repeatOf)}</>
                )}
              </p>
            )}
            {(clip.componentId === "image" || clip.componentId === "video") && (
              <div
                className="canvas-placement-tools"
                aria-label="Canvas placement"
              >
                <button
                  type="button"
                  disabled={!canEditProperties}
                  onClick={() =>
                    onEdit((current) => ({
                      ...current,
                      clips: current.clips.map((candidate) =>
                        candidate.id === clip.id
                          ? {
                              ...candidate,
                              props: {
                                ...candidate.props,
                                x: 50,
                                y: 50,
                                anchor: "center",
                              },
                            }
                          : candidate,
                      ),
                    }))
                  }
                >
                  Center on Canvas
                </button>
                <button
                  type="button"
                  disabled={!canEditProperties}
                  onClick={() =>
                    onEdit((current) => ({
                      ...current,
                      clips: current.clips.map((candidate) =>
                        candidate.id === clip.id
                          ? {
                              ...candidate,
                              props: {
                                ...candidate.props,
                                x: 50,
                                y: 50,
                                width: 100,
                                height: 100,
                                anchor: "center",
                                fit: "contain",
                              },
                            }
                          : candidate,
                      ),
                    }))
                  }
                >
                  Fit inside Canvas
                </button>
                <button
                  type="button"
                  disabled={!canEditProperties}
                  onClick={() =>
                    onEdit((current) => ({
                      ...current,
                      clips: current.clips.map((candidate) =>
                        candidate.id === clip.id
                          ? {
                              ...candidate,
                              props: {
                                ...candidate.props,
                                x: 50,
                                y: 50,
                                width: 100,
                                height: 100,
                                anchor: "center",
                                fit: "cover",
                              },
                            }
                          : candidate,
                      ),
                    }))
                  }
                >
                  Fill Canvas
                </button>
              </div>
            )}
            {clip.componentId === "video" && onSeparateVideoAudio && (
              <div className="tools">
                <button
                  type="button"
                  disabled={!canEditProperties}
                  onClick={onSeparateVideoAudio}
                >
                  Separate video audio
                </button>
              </div>
            )}
            <div className="tools">
              <button onClick={onDuplicate} disabled={!canDuplicate}>
                Duplicate clip
              </button>
              <button onClick={onDelete} disabled={!canDelete}>
                {clip.componentId === "soundtrack"
                  ? "Delete audio"
                  : "Delete clip"}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <h3>Composition</h3>
          <p className="muted">{manifest.name}</p>
          <div className="composition-facts">
            <span>Resolution</span>
            <strong>
              {manifest.width} × {manifest.height}
            </strong>
            <span>Frame rate</span>
            <strong>{manifest.fps} FPS</strong>
            <span>Duration</span>
            <strong>
              {(manifest.durationInFrames / manifest.fps).toFixed(2)} s
            </strong>
            <span>Elements</span>
            <strong>{document?.clips.length ?? 0}</strong>
          </div>
          <p className="muted">
            Select an element on the timeline to edit its timing and declared
            properties.
          </p>
        </>
      )}
    </section>
  );
}

function PropertyControl({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: EditableField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const label = field.label;
  if (field.type === "boolean")
    return (
      <label className="checkbox-property">
        <input
          aria-label={label}
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  return (
    <label>
      {label}
      {field.type === "text" ? (
        <textarea
          aria-label={label}
          disabled={disabled}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          aria-label={label}
          disabled={disabled}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          disabled={disabled}
          type={field.type === "color" ? "color" : "number"}
          value={String(value)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(
              field.type === "number"
                ? Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </label>
  );
}
