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
  const characterScene =
    clip?.sceneId && document?.scenes
      ? document.scenes.find((scene) => scene.id === clip.sceneId)
      : undefined;
  const characterSceneStart =
    clip && characterScene ? clip.from - characterScene.from : 0;
  const characterMaxFrame = characterScene
    ? characterScene.durationInFrames
    : (clip?.durationInFrames ?? 0);
  const characterGroup =
    clip?.componentId === "character"
      ? document?.assetGroups?.find(
          (group) => group.id === clip.content.groupId,
        )
      : undefined;
  const characterPoseEvents =
    clip?.componentId === "character" && Array.isArray(clip.content.poseEvents)
      ? (clip.content.poseEvents as Array<{
          id: string;
          atFrame: number;
          memberId: string;
        }>)
      : [];
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
            {clip.componentId === "character" && document && (
              <section
                className="character-inspector"
                aria-label="Character poses"
              >
                <label>
                  Character group
                  <select
                    aria-label="Character group"
                    disabled={!canEditProperties}
                    value={String(clip.content.groupId ?? "")}
                    onChange={(event) => {
                      const group = document.assetGroups?.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      const firstPose = group?.members.find(
                        (member) => member.role === "pose",
                      );
                      if (!group || !firstPose) return;
                      onEdit((current) => ({
                        ...current,
                        clips: current.clips.map((candidate) =>
                          candidate.id === clip.id
                            ? {
                                ...candidate,
                                content: {
                                  ...candidate.content,
                                  groupId: group.id,
                                  poseEvents: [
                                    {
                                      id: `pose-${crypto.randomUUID()}`,
                                      atFrame: characterSceneStart,
                                      memberId: firstPose.id,
                                    },
                                  ],
                                },
                              }
                            : candidate,
                        ),
                      }));
                    }}
                  >
                    {(document.assetGroups ?? [])
                      .filter(
                        (group) =>
                          group.category === "characters" &&
                          group.members.some(
                            (member) => member.role === "pose",
                          ),
                      )
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </select>
                </label>
                {characterGroup && (
                  <div className="character-pose-events">
                    <strong>Pose changes</strong>
                    {characterPoseEvents.map((poseEvent) => (
                      <div className="character-pose-event" key={poseEvent.id}>
                        <label>
                          Scene time (seconds)
                          <input
                            aria-label={`Pose time ${poseEvent.id} (seconds)`}
                            type="number"
                            min={characterSceneStart / manifest.fps}
                            max={(characterMaxFrame - 1) / manifest.fps}
                            step={1 / manifest.fps}
                            disabled={!canEditProperties}
                            value={(poseEvent.atFrame / manifest.fps).toFixed(
                              3,
                            )}
                            onChange={(event) => {
                              const atFrame = Math.max(
                                characterSceneStart,
                                Math.min(
                                  characterMaxFrame - 1,
                                  secondsToFrame(
                                    Number(event.target.value),
                                    manifest.fps,
                                  ),
                                ),
                              );
                              onEdit((current) => ({
                                ...current,
                                clips: current.clips.map((candidate) => {
                                  if (candidate.id !== clip.id)
                                    return candidate;
                                  const events = (
                                    Array.isArray(candidate.content.poseEvents)
                                      ? candidate.content.poseEvents
                                      : []
                                  ) as typeof characterPoseEvents;
                                  return {
                                    ...candidate,
                                    content: {
                                      ...candidate.content,
                                      poseEvents: events
                                        .map((item) =>
                                          item.id === poseEvent.id
                                            ? { ...item, atFrame }
                                            : item,
                                        )
                                        .sort(
                                          (left, right) =>
                                            left.atFrame - right.atFrame,
                                        ),
                                    },
                                  };
                                }),
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Pose image
                          <select
                            aria-label={`Pose image ${poseEvent.id}`}
                            disabled={!canEditProperties}
                            value={poseEvent.memberId}
                            onChange={(event) =>
                              onEdit((current) => ({
                                ...current,
                                clips: current.clips.map((candidate) => {
                                  if (candidate.id !== clip.id)
                                    return candidate;
                                  const events = (
                                    Array.isArray(candidate.content.poseEvents)
                                      ? candidate.content.poseEvents
                                      : []
                                  ) as typeof characterPoseEvents;
                                  return {
                                    ...candidate,
                                    content: {
                                      ...candidate.content,
                                      poseEvents: events.map((item) =>
                                        item.id === poseEvent.id
                                          ? {
                                              ...item,
                                              memberId: event.target.value,
                                            }
                                          : item,
                                      ),
                                    },
                                  };
                                }),
                              }))
                            }
                          >
                            {characterGroup.members
                              .filter((member) => member.role === "pose")
                              .map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          aria-label={`Remove pose change ${poseEvent.id}`}
                          disabled={
                            !canEditProperties ||
                            characterPoseEvents.length <= 1
                          }
                          onClick={() =>
                            onEdit((current) => ({
                              ...current,
                              clips: current.clips.map((candidate) =>
                                candidate.id === clip.id
                                  ? {
                                      ...candidate,
                                      content: {
                                        ...candidate.content,
                                        poseEvents: characterPoseEvents.filter(
                                          (item) => item.id !== poseEvent.id,
                                        ),
                                      },
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={
                        !canEditProperties ||
                        characterPoseEvents.at(-1)?.atFrame ===
                          characterMaxFrame - 1
                      }
                      onClick={() => {
                        const nextFrame = Math.max(
                          characterSceneStart,
                          (characterPoseEvents.at(-1)?.atFrame ??
                            characterSceneStart - 1) + 1,
                        );
                        const poseMember = characterGroup.members.find(
                          (member) => member.role === "pose",
                        );
                        if (!poseMember || nextFrame >= characterMaxFrame)
                          return;
                        onEdit((current) => ({
                          ...current,
                          clips: current.clips.map((candidate) =>
                            candidate.id === clip.id
                              ? {
                                  ...candidate,
                                  content: {
                                    ...candidate.content,
                                    poseEvents: [
                                      ...(Array.isArray(
                                        candidate.content.poseEvents,
                                      )
                                        ? candidate.content.poseEvents
                                        : []),
                                      {
                                        id: `pose-${crypto.randomUUID()}`,
                                        atFrame: nextFrame,
                                        memberId: poseMember.id,
                                      },
                                    ],
                                  },
                                }
                              : candidate,
                          ),
                        }));
                      }}
                    >
                      Add pose change
                    </button>
                  </div>
                )}
              </section>
            )}
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
