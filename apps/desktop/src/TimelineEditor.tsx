import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import {
  timelineGapWarnings,
  timelinePlaybackEnd,
} from "@motion/sdk/timeline-analysis";
import {
  parseEditTimeline,
  changeClipRange,
  fieldValue,
  validateField,
  type EditTimeline,
  type EditableField,
} from "@motion/sdk/timeline";
import { useEditorSession } from "./EditorSession";
import { resolveTimelineBehavior } from "./timeline-behaviors";
import {
  addTimelineClipCopy,
  canPerformTimelineOperation,
  removeTimelineClip,
  type TimelineOperation,
} from "./timeline-operations";
import { CanvasView } from "./CanvasView";
import { TimelineView } from "./TimelineView";
import { applyCanvasTransform } from "@motion/sdk/canvas";
import { InspectorView } from "./InspectorView";
import {
  changeClipRangeWithDurationExtension,
  MAX_TIMELINE_DURATION_FRAMES,
  soundtrackTimingUnchanged,
  subtitleTrackId,
} from "./timeline-track-utils";
import { useWorkspaceManager } from "./WorkspaceManager";
import type {
  TimelineCommandEnvelope,
  TimelineCommandResult,
  TimelineSnapshot,
} from "../electron/window-contract.cjs";
import {
  exportSubtitles,
  createSubtitleClip,
  importSubtitles,
  subtitleClips,
  subtitleTimingSchema,
  subtitlesToSRT,
  subtitlesToLRC,
} from "@motion/lyrics-sync/subtitles";
import "./timeline.css";
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TimelineEditor({
  manifest,
  previewOrigin,
  built,
  active,
  reload,
  requestPreviewReload,
}: {
  manifest: ProjectManifest;
  previewOrigin: string;
  built: boolean;
  active: boolean;
  reload: number;
  requestPreviewReload: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      iframe.current?.contentWindow?.postMessage(
        {
          channel: "motion-editor-v1",
          projectId: manifest.id,
          type,
          ...payload,
        },
        previewOrigin,
      );
    },
    [manifest.id, previewOrigin],
  );
  const session = useEditorSession({
    manifest,
    previewOrigin,
    active,
    requestPreviewReload,
    sendPreview: send,
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sourceCommandId = useRef<string | null>(null);
  const clipGesture = useRef<
    | {
        gestureId: string;
        clipId: string;
        baseline: EditTimeline;
        expectedVersion: number;
      }
    | undefined
  >(undefined);
  const canvasGesture = useRef<
    | {
        startVersion: number;
        latestVersion: number;
        checkpointed: boolean;
        canceled: boolean;
      }
    | undefined
  >(undefined);
  const clipboard = useRef<
    import("@motion/sdk/timeline").TimelineClip | undefined
  >(undefined);
  useEffect(() => {
    clipboard.current = undefined;
  }, [manifest.id]);
  const workspace = useWorkspaceManager();
  const detachedTimeline = workspace.detachedTimeline;
  const [timelineTransportError, setTimelineTransportError] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [playToProjectEnd, setPlayToProjectEnd] = useState(
    () => localStorage.getItem("motion-preview-playback-end") === "project",
  );
  const { snapshot, commands } = session;
  const {
    document: doc,
    dirty,
    components,
    selectedClipId: selected,
    selectedClipIds: selectedIds,
    frame,
    playing,
    previewGeneration,
    error,
    notice,
    conflict,
    saving,
    undoCount,
    redoCount,
  } = snapshot;
  const {
    edit: sessionEdit,
    selectClip: sessionSelectClip,
    selectClips: sessionSelectClips,
    seek: sessionSeek,
    save,
    reloadFromDisk: reloadDisk,
    play,
    pause: sessionPause,
    undo,
    redo,
    checkpoint: sessionCheckpoint,
    receivePreviewMessage,
    setError,
    setNotice,
  } = commands;
  const editorManifest = doc
    ? { ...manifest, durationInFrames: doc.durationInFrames }
    : manifest;
  const playbackEndFrame = doc
    ? timelinePlaybackEnd(doc, playToProjectEnd)
    : manifest.durationInFrames;
  const timelineWarnings = doc ? timelineGapWarnings(doc) : [];
  const edit = (next: EditTimeline, createCheckpoint = true) => {
    const current = commands.getCurrentDocument();
    if (current && !soundtrackTimingUnchanged(current, next)) {
      setError(
        "Soundtrack timing is fixed at frame 0 for the selected audio's full duration. Reselect audio to change it.",
      );
      return;
    }
    sourceCommandId.current = null;
    sessionEdit(next, createCheckpoint);
  };
  const setSelected = (clipId: string, additive = false) => {
    sourceCommandId.current = null;
    if (!additive) {
      sessionSelectClip(clipId);
      return;
    }
    const current = commands.getSelectedClipIds();
    const next = current.includes(clipId)
      ? current.filter((candidate) => candidate !== clipId)
      : [...current, clipId];
    sessionSelectClips(next);
  };
  const seek = (nextFrame: number) => {
    sourceCommandId.current = null;
    sessionSeek(nextFrame);
  };
  const pause = () => {
    sourceCommandId.current = null;
    sessionPause();
  };
  useEffect(() => {
    if (!active) return;
    const togglePlayback = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest(
          "input, textarea, select, button, a, [role='button'], [contenteditable='true'], [role='textbox']",
        ) ||
        !target.closest(".timeline-editor") ||
        target.closest(".timeline-dock")
      )
        return;
      event.preventDefault();
      if (playing) pause();
      else play();
    };
    window.addEventListener("keydown", togglePlayback);
    return () => window.removeEventListener("keydown", togglePlayback);
  }, [active, playing, pause, play]);
  const checkpoint = () => {
    sourceCommandId.current = null;
    sessionCheckpoint();
  };
  const beginCanvasGesture = () => {
    const version = commands.getStateVersion();
    canvasGesture.current = {
      startVersion: version,
      latestVersion: version,
      checkpointed: false,
      canceled: false,
    };
  };
  const endCanvasGesture = () => {
    canvasGesture.current = undefined;
  };
  const cancelCanvasGesture = () => {
    const gesture = canvasGesture.current;
    canvasGesture.current = undefined;
    if (!gesture?.checkpointed || gesture.canceled) return;
    if (commands.getStateVersion() === gesture.latestVersion) {
      undo();
    } else {
      setNotice(
        "Canvas gesture was interrupted by another edit. Its changes remain available to Undo.",
      );
    }
  };
  useEffect(() => {
    send("playback-boundary", { endFrame: playbackEndFrame });
  }, [send, playbackEndFrame, previewGeneration]);
  const [inspectorWidth, setInspectorWidth] = useState(
    () => Number(localStorage.getItem("motion-inspector-width")) || 270,
  );
  const [timelineHeight, setTimelineHeight] = useState(
    () => Number(localStorage.getItem("motion-timeline-height")) || 280,
  );
  const panelResize = useRef<
    { kind: "inspector" | "timeline"; start: number; size: number } | undefined
  >(undefined);
  useEffect(() => {
    const receive = (event: MessageEvent) =>
      receivePreviewMessage(event, iframe.current?.contentWindow ?? null);
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [receivePreviewMessage]);

  const timelineSnapshot = (
    identity: NonNullable<typeof detachedTimeline>,
  ): TimelineSnapshot => ({
    panelId: "timeline",
    projectId: snapshot.projectId,
    sessionId: snapshot.sessionId,
    instanceId: identity.instanceId,
    stateVersion: snapshot.stateVersion,
    sourceCommandId: sourceCommandId.current,
    fps: manifest.fps,
    durationInFrames:
      snapshot.document?.durationInFrames ?? manifest.durationInFrames,
    hasEditableTimeline: Boolean(manifest.editTimeline),
    document: snapshot.document ?? null,
    components,
    selectedClipId: selected,
    selectedClipIds: selectedIds,
    frame,
    playing,
    dirty,
    conflict,
    undoCount: snapshot.undoCount,
    redoCount: snapshot.redoCount,
  });

  async function publishTimelineSnapshot(
    identity: NonNullable<typeof detachedTimeline>,
  ) {
    const bridge = window.floxBowWindows;
    if (!bridge) throw new Error("Native Timeline transport is unavailable.");
    const result = await bridge.publishTimelineSnapshot(
      timelineSnapshot(identity),
    );
    if (result.status !== "sent")
      throw new Error("Timeline window is unavailable. Attach it and retry.");
  }

  useEffect(() => {
    if (!detachedTimeline) return;
    if (
      detachedTimeline.projectId !== snapshot.projectId ||
      detachedTimeline.sessionId !== snapshot.sessionId
    ) {
      void window.floxBowWindows
        ?.closePanel({
          panelId: "timeline",
          instanceId: detachedTimeline.instanceId,
        })
        .catch(() =>
          workspace.clearDetachedTimeline(detachedTimeline.instanceId),
        );
      return;
    }
    let mounted = true;
    void publishTimelineSnapshot(detachedTimeline)
      .then(() => mounted && setTimelineTransportError(""))
      .catch((error: unknown) => {
        if (mounted) setTimelineTransportError(String(error));
      });
    return () => {
      mounted = false;
    };
  }, [
    detachedTimeline?.instanceId,
    detachedTimeline?.projectId,
    detachedTimeline?.sessionId,
    snapshot.stateVersion,
    snapshot.document,
    snapshot.components,
    snapshot.selectedClipId,
    snapshot.dirty,
    snapshot.conflict,
  ]);

  useEffect(() => {
    const selectSoundtrack = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: unknown;
          assetId?: unknown;
          durationInSeconds?: unknown;
          displayName?: unknown;
        }>
      ).detail;
      if (detail?.projectId !== manifest.id) return;
      if (
        typeof detail.assetId !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.assetId)
      ) {
        setError("The selected audio reference is invalid.");
        return;
      }
      if (
        typeof detail.durationInSeconds !== "number" ||
        !Number.isFinite(detail.durationInSeconds) ||
        detail.durationInSeconds <= 0
      ) {
        setError(
          "The selected audio has no usable duration or could not be decoded.",
        );
        return;
      }
      const current = commands.getCurrentDocument();
      if (!current) {
        setError("This project has no editable Timeline.");
        return;
      }
      const audioFrames = Math.max(
        1,
        Math.ceil(detail.durationInSeconds * current.fps),
      );
      const durationInFrames = Math.max(current.durationInFrames, audioFrames);
      const tracks = [...current.tracks];
      let track = tracks.find((item) => item.id === "audio");
      if (!track) {
        if (tracks.length >= 32) {
          setError(
            "The Timeline has reached its track limit; remove a track before adding audio.",
          );
          return;
        }
        track = { id: "audio", name: "Audio" };
        tracks.push(track);
      }
      const soundtrack = {
        id: `soundtrack-${crypto.randomUUID()}`,
        trackId: track.id,
        componentId: "soundtrack",
        label: `Soundtrack · ${typeof detail.displayName === "string" ? detail.displayName.slice(0, 160) : "Audio"}`,
        from: 0,
        durationInFrames: audioFrames,
        content: { assetId: detail.assetId },
        props: {},
      };
      const next = parseEditTimeline({
        ...current,
        durationInFrames,
        tracks,
        clips: [
          ...current.clips.filter((clip) => clip.componentId !== "soundtrack"),
          soundtrack,
        ],
      });
      // Selecting a soundtrack is the only operation that may replace its fixed clip.
      sourceCommandId.current = null;
      sessionEdit(next);
      setSelected(soundtrack.id);
      setNotice(
        `Soundtrack added to the Audio track for ${(audioFrames / current.fps).toFixed(2)} seconds. Save the project to keep it.`,
      );
    };
    window.addEventListener("motion-use-soundtrack", selectSoundtrack);
    return () =>
      window.removeEventListener("motion-use-soundtrack", selectSoundtrack);
  }, [manifest.id, commands, edit]);

  useEffect(() => {
    const addImage = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: unknown;
          assetId?: unknown;
          displayName?: unknown;
        }>
      ).detail;
      if (
        detail?.projectId !== manifest.id ||
        typeof detail.assetId !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.assetId)
      )
        return;
      const live = sessionRef.current;
      const current = live.commands.getCurrentDocument();
      if (live.snapshot.projectId !== manifest.id || !current) return;
      const from = Math.min(live.snapshot.frame, current.durationInFrames - 1);
      const image = {
        id: `image-${crypto.randomUUID()}`,
        trackId:
          current.tracks.find((track) => track.id === "visuals")?.id ??
          current.tracks[0].id,
        componentId: "image",
        label:
          typeof detail.displayName === "string"
            ? detail.displayName.slice(0, 200)
            : "Image",
        from,
        durationInFrames: Math.min(
          current.fps * 5,
          current.durationInFrames - from,
        ),
        content: { assetId: detail.assetId },
        props: {
          x: 50,
          y: 50,
          width: 80,
          height: 80,
          rotation: 0,
          anchor: "center",
          opacity: 1,
          fit: "contain",
        },
      };
      live.commands.edit(
        parseEditTimeline({ ...current, clips: [...current.clips, image] }),
      );
      live.commands.selectClip(image.id);
      setNotice(
        `${image.label} added as an editable Image clip. Save the project to keep it.`,
      );
      workspace.activatePanel("editor");
    };
    window.addEventListener("motion-add-image", addImage);
    return () => window.removeEventListener("motion-add-image", addImage);
  }, [manifest.id, workspace]);

  useEffect(() => {
    if (!detachedTimeline || !window.floxBowWindows) return;
    void window.floxBowWindows
      .publishTimelineFrame({
        panelId: "timeline",
        projectId: snapshot.projectId,
        sessionId: snapshot.sessionId,
        instanceId: detachedTimeline.instanceId,
        stateVersion: snapshot.stateVersion,
        frame,
        playing,
      })
      .catch((error: unknown) => setTimelineTransportError(String(error)));
  }, [
    detachedTimeline?.instanceId,
    snapshot.projectId,
    snapshot.sessionId,
    snapshot.stateVersion,
    frame,
    playing,
  ]);

  useEffect(() => {
    const bridge = window.floxBowWindows;
    if (!bridge) return;
    return bridge.onTimelineSnapshotRequest((request) => {
      if (
        detachedTimeline?.instanceId !== request.instanceId ||
        snapshot.projectId !== request.projectId ||
        snapshot.sessionId !== request.sessionId
      )
        return;
      void publishTimelineSnapshot(detachedTimeline).catch((error: unknown) =>
        setTimelineTransportError(String(error)),
      );
    });
  }, [detachedTimeline?.instanceId, snapshot.projectId, snapshot.sessionId]);

  useEffect(() => {
    const bridge = window.floxBowWindows;
    if (!bridge || !detachedTimeline) return;
    return bridge.onTimelineCommand((envelope: TimelineCommandEnvelope) => {
      void (async () => {
        let resultStatus: TimelineCommandResult["status"] = "rejected";
        let resultVersion = commands.getStateVersion();
        let resultMessage = "Timeline command was rejected.";
        try {
          if (
            envelope.projectId !== snapshot.projectId ||
            envelope.sessionId !== snapshot.sessionId ||
            envelope.instanceId !== detachedTimeline.instanceId
          )
            throw new Error(
              "This Timeline command belongs to an old project session.",
            );
          if (envelope.stateVersion !== commands.getStateVersion())
            throw new Error(
              "Timeline changed elsewhere. The view was refreshed.",
            );
          const current = commands.getCurrentDocument();
          const command = envelope.command;
          if (
            clipGesture.current &&
            !["updateClipGesture", "endClipGesture"].includes(command.type)
          )
            throw new Error(
              "Finish the active clip drag before sending another edit.",
            );
          if (command.type === "selectClip") {
            if (
              command.clipId &&
              !current?.clips.some((clip) => clip.id === command.clipId)
            )
              throw new Error("The selected clip no longer exists.");
            sourceCommandId.current = envelope.commandId;
            sessionSelectClip(command.clipId);
          } else if (command.type === "selectClips") {
            if (
              command.clipIds.some(
                (clipId) => !current?.clips.some((clip) => clip.id === clipId),
              )
            )
              throw new Error(
                "The selection includes a missing Timeline clip.",
              );
            sourceCommandId.current = envelope.commandId;
            sessionSelectClips(command.clipIds);
          } else if (command.type === "seek") {
            if (!current || command.frame >= current.durationInFrames)
              throw new Error(
                "The requested playhead frame is outside this project.",
              );
            sourceCommandId.current = envelope.commandId;
            sessionSeek(command.frame);
          } else if (command.type === "pause") {
            sourceCommandId.current = envelope.commandId;
            sessionPause();
          } else if (command.type === "play") {
            sourceCommandId.current = envelope.commandId;
            play();
          } else if (command.type === "editTimeline") {
            if (clipGesture.current)
              throw new Error("A clip drag is still active.");
            const validated = parseEditTimeline(command.document);
            if (current && !soundtrackTimingUnchanged(current, validated))
              throw new Error(
                "Soundtrack timing is fixed at frame 0 for the selected audio's full duration. Reselect audio to change it.",
              );
            if (
              validated.fps !== manifest.fps ||
              validated.durationInFrames < manifest.durationInFrames
            )
              throw new Error(
                "Timeline duration cannot be shorter than the saved project duration.",
              );
            sourceCommandId.current = envelope.commandId;
            sessionEdit(validated, command.checkpoint);
          } else if (command.type === "beginClipGesture") {
            if (!current)
              throw new Error("This project has no editable Timeline.");
            const clip = current.clips.find(
              (item) => item.id === command.clipId,
            );
            if (!clip)
              throw new Error("The clip being dragged no longer exists.");
            if (clip.componentId === "soundtrack")
              throw new Error(
                "Soundtrack clips cannot be moved or trimmed. Reselect audio to change the soundtrack.",
              );
            let gestureBaseline = current;
            let gestureClipId = command.clipId;
            if (command.duplicateId) {
              const duplicate = addTimelineClipCopy(
                current,
                clip,
                command.duplicateId,
                clip.from,
                components,
              );
              sessionCheckpoint();
              sessionEdit(duplicate, false);
              gestureBaseline = duplicate;
              gestureClipId = command.duplicateId;
              sessionSelectClip(gestureClipId);
            } else sessionCheckpoint();
            sourceCommandId.current = envelope.commandId;
            clipGesture.current = {
              gestureId: command.gestureId,
              clipId: gestureClipId,
              baseline: structuredClone(gestureBaseline),
              expectedVersion: commands.getStateVersion(),
            };
          } else if (command.type === "updateClipGesture") {
            const gesture = clipGesture.current;
            if (
              !gesture ||
              gesture.gestureId !== command.gestureId ||
              gesture.clipId !== command.clipId
            )
              throw new Error(
                "The clip drag is no longer active. The Timeline was refreshed.",
              );
            if (gesture.expectedVersion !== commands.getStateVersion()) {
              clipGesture.current = undefined;
              throw new Error(
                "The clip changed during the drag. The drag was canceled safely.",
              );
            }
            const clip = gesture.baseline.clips.find(
              (item) => item.id === command.clipId,
            );
            if (!clip)
              throw new Error("The clip being dragged no longer exists.");
            if (
              clip.componentId === "soundtrack" &&
              (command.from !== clip.from ||
                command.trim ||
                command.durationInFrames !== clip.durationInFrames)
            )
              throw new Error(
                "Soundtrack clips cannot be moved or trimmed. Reselect audio to change the soundtrack.",
              );
            if (
              command.from < 0 ||
              command.from + command.durationInFrames >
                MAX_TIMELINE_DURATION_FRAMES
            )
              throw new Error(
                "The clip range exceeds the maximum project duration.",
              );
            const next = changeClipRangeWithDurationExtension(
              gesture.baseline,
              command.clipId,
              command.from,
              command.from + command.durationInFrames,
              command.trim,
              resolveTimelineBehavior(clip.componentId, components),
            );
            sourceCommandId.current = envelope.commandId;
            sessionEdit(next, false);
            gesture.expectedVersion = commands.getStateVersion();
          } else if (command.type === "endClipGesture") {
            if (clipGesture.current?.gestureId !== command.gestureId)
              throw new Error("The clip drag is no longer active.");
            clipGesture.current = undefined;
            sourceCommandId.current = envelope.commandId;
          } else if (command.type === "undo") {
            if (!snapshot.undoCount)
              throw new Error("There is no edit to undo.");
            sourceCommandId.current = envelope.commandId;
            undo();
          } else if (
            ["copy", "cut", "paste", "duplicate", "delete"].includes(
              command.type,
            )
          ) {
            sourceCommandId.current = envelope.commandId;
            const operationError = performTimelineOperation(
              command.type as TimelineOperation,
            );
            if (operationError) throw new Error(operationError);
          } else if (command.type === "redo") {
            if (!snapshot.redoCount)
              throw new Error("There is no edit to redo.");
            sourceCommandId.current = envelope.commandId;
            redo();
          }
          resultStatus = "accepted";
          resultMessage = "";
          resultVersion = commands.getStateVersion();
        } catch (error) {
          resultMessage = String(error).slice(0, 300);
          if (
            resultMessage.includes("refreshed") ||
            resultMessage.includes("changed")
          )
            sourceCommandId.current = null;
        }
        const result: TimelineCommandResult = {
          panelId: "timeline",
          projectId: envelope.projectId,
          sessionId: envelope.sessionId,
          instanceId: envelope.instanceId,
          commandId: envelope.commandId,
          status: resultStatus,
          stateVersion: resultVersion,
          message: resultMessage,
        };
        try {
          await bridge.sendTimelineCommandResult(result);
          if (resultStatus === "rejected")
            await publishTimelineSnapshot(detachedTimeline);
        } catch (error) {
          setTimelineTransportError(
            `Timeline command response failed: ${String(error)}`,
          );
        }
      })();
    });
  }, [
    detachedTimeline?.instanceId,
    snapshot.projectId,
    snapshot.sessionId,
    snapshot.undoCount,
    snapshot.redoCount,
    manifest,
    components,
  ]);
  function property(field: EditableField, value: unknown) {
    // Inspector events can arrive before React commits a prior property or
    // selection update. Read both the document and selection from the live
    // EditorSession so an event cannot target a stale clip from this render.
    const liveSession = sessionRef.current;
    const current = liveSession.commands.getCurrentDocument();
    const selectedClipId = liveSession.commands.getSelectedClipId();
    if (!current) return;
    try {
      const next = structuredClone(current);
      const c = next.clips.find((c) => c.id === selectedClipId);
      if (!c) return;
      const validated = validateField(field, value);
      const behavior = resolveTimelineBehavior(
        c.componentId,
        liveSession.snapshot.components,
      );
      const behaviorEdit =
        field.target === "content"
          ? behavior.editContent?.(c.content, field.key, validated)
          : undefined;
      if (behaviorEdit) {
        c.content = behaviorEdit.content;
        if (behaviorEdit.notice) setNotice(behaviorEdit.notice);
      } else c[field.target][field.key] = validated;
      edit(next);
    } catch (e) {
      setError(String(e));
    }
  }
  function resizePanel(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = panelResize.current;
    if (!d) return;
    if (d.kind === "inspector") {
      const width = Math.max(220, Math.min(420, d.size + d.start - e.clientX));
      setInspectorWidth(width);
      localStorage.setItem("motion-inspector-width", String(width));
    } else {
      const height = Math.max(
        170,
        Math.min(
          Math.round(window.innerHeight * 0.55),
          d.size + d.start - e.clientY,
        ),
      );
      setTimelineHeight(height);
      localStorage.setItem("motion-timeline-height", String(height));
    }
  }
  function endPanelResize() {
    panelResize.current = undefined;
  }
  async function importFile(file: File | undefined) {
    if (!file || !doc) return;
    try {
      const text = await file.text();
      if (file.name.endsWith(".timeline.json")) {
        const next = parseEditTimeline(JSON.parse(text));
        if (
          next.fps !== manifest.fps ||
          next.durationInFrames < manifest.durationInFrames
        )
          throw new Error(
            "Imported timeline FPS or duration does not match this project.",
          );
        edit(next);
        setNotice(
          "Imported editable timeline. Save to apply it to the project.",
        );
        return;
      }
      const format = file.name.toLowerCase().endsWith(".srt")
        ? "srt"
        : file.name.toLowerCase().endsWith(".lrc")
          ? "lrc"
          : "json";
      const data = importSubtitles(
        text,
        format,
        doc.durationInFrames / doc.fps,
      );
      const existing = doc.clips.find((c) => c.componentId === "subtitles");
      const trackId = subtitleTrackId(doc, existing?.trackId);
      const imported = subtitleClips(data, doc, trackId, existing?.props ?? {});
      if (!components.some((c) => c.id === "subtitles"))
        throw new Error(
          "The project must register subtitleModule before importing subtitles.",
        );
      const next = {
        ...doc,
        clips: [
          ...doc.clips.filter(
            (c) =>
              c.componentId !== "subtitles" && c.componentId !== "soundtrack",
          ),
          ...imported,
          ...doc.clips.filter((c) => c.componentId === "soundtrack"),
        ],
      };
      edit(parseEditTimeline(next));
      setSelected(imported[0]?.id ?? "");
      setNotice(
        format === "lrc"
          ? "Imported LRC. Ends come from the next line (last ends at project duration); review them."
          : "Imported timing; existing visual defaults preserved.",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function generateSubtitles() {
    const initial = sessionRef.current.snapshot;
    const current = sessionRef.current.commands.getCurrentDocument();
    const soundtrack = current?.clips.find(
      (item) => item.componentId === "soundtrack",
    );
    const assetId = soundtrack?.content.assetId;
    if (!current || typeof assetId !== "string") {
      setError(
        "Select an MP3/WAV and choose Use as soundtrack before generating subtitles.",
      );
      return;
    }
    if (!initial.components.some((component) => component.id === "subtitles")) {
      setError(
        "This project does not register the editable Subtitles component.",
      );
      return;
    }

    setTranscribing(true);
    setError("");
    setNotice("Running the local Whisper model on the selected soundtrack…");
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(initial.projectId)}/assets/${encodeURIComponent(assetId)}/transcription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fps: current.fps,
            durationInFrames: current.durationInFrames,
          }),
        },
      );
      const result = await response.json().catch(() => undefined);
      if (!response.ok)
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "Local Whisper transcription failed.",
        );
      const validatedTiming = subtitleTimingSchema.parse(result?.timing);
      const counts = [
        result?.skippedSegments,
        result?.outOfRangeSegments,
        result?.unusableWordTimings,
      ];
      if (counts.some((value) => !Number.isInteger(value) || value < 0))
        throw new Error("The transcription response did not pass validation.");

      const live = sessionRef.current;
      const liveSnapshot = live.snapshot;
      const liveDocument = live.commands.getCurrentDocument();
      if (
        liveSnapshot.projectId !== initial.projectId ||
        liveSnapshot.sessionId !== initial.sessionId ||
        !liveDocument
      )
        throw new Error(
          "The project changed while Whisper was working. Run transcription again.",
        );
      const liveSoundtrack = liveDocument.clips.find(
        (item) => item.componentId === "soundtrack",
      );
      if (liveSoundtrack?.content.assetId !== assetId)
        throw new Error(
          "The selected soundtrack changed while Whisper was working. Run transcription again.",
        );
      if (
        !liveSnapshot.components.some(
          (component) => component.id === "subtitles",
        )
      )
        throw new Error(
          "This project does not register the editable Subtitles component.",
        );

      const existing = liveDocument.clips.filter(
        (item) => item.componentId === "subtitles",
      );
      const template =
        existing.find((item) => item.id === liveSnapshot.selectedClipId) ??
        existing[0];
      const trackId = subtitleTrackId(liveDocument, template?.trackId);
      const timing = importSubtitles(
        JSON.stringify(validatedTiming),
        "json",
        liveDocument.durationInFrames / liveDocument.fps,
      );
      const imported = [];
      let frameSkipped = 0;
      for (const segment of timing.segments) {
        try {
          const converted = subtitleClips(
            { version: 1, units: "seconds", segments: [segment] },
            liveDocument,
            trackId,
            template?.props ?? {},
          );
          imported.push(
            ...converted.map((clip) => ({
              ...clip,
              id: `subtitle-whisper-${crypto.randomUUID()}`,
            })),
          );
        } catch {
          frameSkipped++;
        }
      }
      if (imported.length === 0) {
        const invalidTimingSkipped =
          result.skippedSegments - result.outOfRangeSegments + frameSkipped;
        live.commands.setError(
          `Whisper produced no usable subtitle clips. ${invalidTimingSkipped} segment${invalidTimingSkipped === 1 ? " was" : "s were"} skipped for missing or invalid timing; ${result.outOfRangeSegments} extended beyond the project duration and were not truncated.`,
        );
        live.commands.setNotice("");
        return;
      }
      if (
        existing.length > 0 &&
        !window.confirm(
          `Replace ${existing.length} existing subtitle clip${existing.length === 1 ? "" : "s"} with the unverified Whisper draft? You can undo this as one edit.`,
        )
      ) {
        live.commands.setNotice(
          "Subtitle generation was canceled; existing clips were kept.",
        );
        return;
      }
      const next = parseEditTimeline({
        ...liveDocument,
        clips: [
          ...liveDocument.clips.filter(
            (item) =>
              item.componentId !== "subtitles" &&
              item.componentId !== "soundtrack",
          ),
          ...imported,
          ...liveDocument.clips.filter(
            (item) => item.componentId === "soundtrack",
          ),
        ],
      });
      if (!soundtrackTimingUnchanged(liveDocument, next))
        throw new Error(
          "The soundtrack changed during subtitle generation. Run it again.",
        );
      sourceCommandId.current = null;
      live.commands.edit(next);
      live.commands.selectClip(imported[0].id);
      live.commands.setError("");
      const invalidTimingSkipped =
        result.skippedSegments - result.outOfRangeSegments + frameSkipped;
      const notes = [
        `${imported.length} unverified subtitle${imported.length === 1 ? "" : "s"} added to the Timeline.`,
        invalidTimingSkipped > 0
          ? `${invalidTimingSkipped} segment${invalidTimingSkipped === 1 ? " was" : "s were"} skipped because timing was invalid, missing, or shorter than one frame.`
          : "",
        result.outOfRangeSegments > 0
          ? `${result.outOfRangeSegments} segment${result.outOfRangeSegments === 1 ? " extends" : "s extend"} beyond the project duration and ${result.outOfRangeSegments === 1 ? "was" : "were"} not truncated.`
          : "",
        result.unusableWordTimings > 0
          ? `Word timing was unusable in ${result.unusableWordTimings} segment${result.unusableWordTimings === 1 ? "" : "s"}; those captions were kept without karaoke timing.`
          : "",
        "Review Whisper's recognition before treating the text as correct.",
      ].filter(Boolean);
      live.commands.setNotice(notes.join(" "));
    } catch (error) {
      const live = sessionRef.current;
      live.commands.setNotice("");
      live.commands.setError(
        error instanceof Error
          ? error.message
          : "Local Whisper transcription failed.",
      );
    } finally {
      setTranscribing(false);
    }
  }
  const clip = doc?.clips.find((c) => c.id === selected);
  const definition = components.find((c) => c.id === clip?.componentId);
  function changeRange(start: number, end: number) {
    if (!doc || !clip) return;
    edit(
      changeClipRange(
        doc,
        clip.id,
        start,
        end,
        true,
        resolveTimelineBehavior(clip.componentId, components),
      ),
    );
  }
  function deleteClip() {
    if (!doc || !clip) return;
    performTimelineOperation("delete");
  }
  function addSubtitle() {
    if (!doc) return;
    const trackId = subtitleTrackId(doc, clip?.trackId);
    const c = createSubtitleClip({
      id: `subtitle-${crypto.randomUUID()}`,
      trackId,
      from: frame,
      durationInFrames: Math.min(doc.fps * 2, doc.durationInFrames - frame),
      content: { text: "New subtitle", status: "unverified" },
    });
    edit({
      ...doc,
      clips: [
        ...doc.clips.filter((item) => item.componentId !== "soundtrack"),
        c,
        ...doc.clips.filter((item) => item.componentId === "soundtrack"),
      ],
    });
    setSelected(c.id);
  }
  function addText() {
    if (!doc) return;
    const from = Math.min(frame, doc.durationInFrames - 1);
    const clip = {
      id: `text-${crypto.randomUUID()}`,
      trackId:
        doc.tracks.find((track) => track.id === "visuals")?.id ??
        doc.tracks[0].id,
      componentId: "text",
      label: "Text",
      from,
      durationInFrames: Math.min(doc.fps * 3, doc.durationInFrames - from),
      content: { text: "New text" },
      props: {
        x: 50,
        y: 50,
        width: 80,
        height: 20,
        rotation: 0,
        anchor: "center",
        fontSize: 72,
        fontFamily: "Arial",
        fontWeight: "400",
        italic: false,
        color: "#ffffff",
        alignment: "center",
        opacity: 1,
        lineSpacing: 1.15,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        slideInFrames: 0,
        slideOutFrames: 0,
        scaleInFrames: 0,
        scaleOutFrames: 0,
        slideDirection: "up",
      },
    };
    edit({
      ...doc,
      clips: [
        ...doc.clips.filter((item) => item.componentId !== "soundtrack"),
        clip,
        ...doc.clips.filter((item) => item.componentId === "soundtrack"),
      ],
    });
    setSelected(clip.id);
  }
  function duplicate() {
    performTimelineOperation("duplicate");
  }
  function performTimelineOperation(
    operation: TimelineOperation | "undo" | "redo" | "playPause",
  ): string | undefined {
    const liveSnapshot = sessionRef.current.snapshot;
    const liveCommands = sessionRef.current.commands;
    const liveComponents = liveSnapshot.components;
    const current = commands.getCurrentDocument();
    const selectedClip = current?.clips.find(
      (item) => item.id === liveSnapshot.selectedClipId,
    );
    if (operation === "playPause") {
      if (liveSnapshot.playing) liveCommands.pause();
      else liveCommands.play();
      return;
    }
    if (operation === "undo") {
      if (!liveSnapshot.undoCount) return "There is no edit to undo.";
      liveCommands.undo();
      return;
    }
    if (operation === "redo") {
      if (!liveSnapshot.redoCount) return "There is no edit to redo.";
      liveCommands.redo();
      return;
    }
    if (["copy", "cut", "delete", "duplicate"].includes(operation)) {
      if (!current || !selectedClip) return "Select a Timeline clip first.";
      if (
        !canPerformTimelineOperation(selectedClip, operation, liveComponents)
      ) {
        setNotice(
          "Soundtrack clips are protected from copy, cut, duplicate and delete operations.",
        );
        return "Soundtrack clips are protected from copy, cut, duplicate and delete operations.";
      }
      if (operation === "copy") {
        clipboard.current = structuredClone(selectedClip);
        setNotice("Clip copied. Paste places it at the current playhead.");
        return;
      }
      if (operation === "cut")
        clipboard.current = structuredClone(selectedClip);
      if (operation === "delete" || operation === "cut") {
        edit(removeTimelineClip(current, selectedClip, liveComponents));
        setSelected("");
        return;
      }
      const id = `clip-${crypto.randomUUID()}`;
      try {
        const next = addTimelineClipCopy(
          current,
          selectedClip,
          id,
          selectedClip.from + selectedClip.durationInFrames,
          liveComponents,
        );
        edit(next);
        setSelected(id);
        return;
      } catch (operationError) {
        setError(String(operationError));
        return String(operationError);
      }
    }
    if (operation === "paste") {
      if (!current || !clipboard.current) {
        setNotice("Copy a Timeline clip before pasting.");
        return "Copy a Timeline clip before pasting.";
      }
      const id = `clip-${crypto.randomUUID()}`;
      try {
        const next = addTimelineClipCopy(
          current,
          clipboard.current,
          id,
          liveSnapshot.frame,
          liveComponents,
          "paste",
        );
        edit(next);
        setSelected(id);
        return;
      } catch (operationError) {
        setError(String(operationError));
        return String(operationError);
      }
    }
    return;
  }
  function exportTiming(format: "json" | "srt" | "lrc") {
    if (!doc) return;
    try {
      const data = exportSubtitles(doc);
      download(
        `${manifest.id}.subtitles.${format}`,
        format === "json"
          ? JSON.stringify(data, null, 2)
          : format === "srt"
            ? subtitlesToSRT(data)
            : subtitlesToLRC(data),
      );
      setNotice(
        format === "json"
          ? "Exported timing and text without appearance."
          : "Subtitle text export: use JSON to retain word timing and repeat metadata.",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function beginClipGesture(
    gestureId: string,
    clipId: string,
    duplicateId?: string,
  ) {
    const baseline = commands.getCurrentDocument();
    if (!baseline) return;
    const clip = baseline.clips.find((item) => item.id === clipId);
    if (!clip) return;
    let gestureBaseline = baseline;
    let gestureClipId = clipId;
    if (duplicateId) {
      let next: EditTimeline;
      try {
        next = addTimelineClipCopy(
          baseline,
          clip,
          duplicateId,
          clip.from,
          components,
        );
      } catch (operationError) {
        setError(String(operationError));
        return;
      }
      checkpoint();
      sessionEdit(next, false);
      gestureBaseline = next;
      gestureClipId = duplicateId;
      setSelected(duplicateId);
    } else checkpoint();
    clipGesture.current = {
      gestureId,
      clipId: gestureClipId,
      baseline: structuredClone(gestureBaseline),
      expectedVersion: commands.getStateVersion(),
    };
  }
  function updateClipGesture(
    gestureId: string,
    clipId: string,
    start: number,
    duration: number,
    trim: boolean,
  ) {
    const gesture = clipGesture.current;
    if (
      !gesture ||
      gesture.gestureId !== gestureId ||
      gesture.clipId !== clipId
    )
      return;
    if (gesture.expectedVersion !== commands.getStateVersion()) {
      clipGesture.current = undefined;
      setNotice(
        "The clip changed during the drag. The drag was canceled safely.",
      );
      return;
    }
    const clipToChange = gesture.baseline.clips.find(
      (item) => item.id === clipId,
    );
    if (!clipToChange) return;
    if (
      clipToChange.componentId === "soundtrack" &&
      (start !== clipToChange.from ||
        trim ||
        duration !== clipToChange.durationInFrames)
    ) {
      clipGesture.current = undefined;
      setError(
        "Soundtrack clips cannot be moved or trimmed. Reselect audio to change the soundtrack.",
      );
      return;
    }
    try {
      edit(
        changeClipRangeWithDurationExtension(
          gesture.baseline,
          clipId,
          start,
          start + duration,
          trim,
          resolveTimelineBehavior(clipToChange.componentId, components),
        ),
        false,
      );
      gesture.expectedVersion = commands.getStateVersion();
    } catch (error) {
      clipGesture.current = undefined;
      setError(String(error));
    }
  }
  function endClipGesture(gestureId: string) {
    if (clipGesture.current?.gestureId === gestureId)
      clipGesture.current = undefined;
  }
  async function detachTimeline() {
    const bridge = window.floxBowWindows;
    if (!bridge) {
      setTimelineTransportError(
        "Timeline detachment is available in the Electron app.",
      );
      return;
    }
    try {
      const opened = await bridge.openPanel({
        panelId: "timeline",
        projectId: snapshot.projectId,
        sessionId: snapshot.sessionId,
      });
      const identity = {
        projectId: snapshot.projectId,
        sessionId: snapshot.sessionId,
        instanceId: opened.instanceId,
      };
      workspace.setDetachedTimeline(identity);
      setTimelineTransportError("");
      await publishTimelineSnapshot(identity);
    } catch (error) {
      setTimelineTransportError(`Could not detach Timeline: ${String(error)}`);
    }
  }
  async function attachTimeline() {
    if (!detachedTimeline) return;
    try {
      await window.floxBowWindows?.closePanel({
        panelId: "timeline",
        instanceId: detachedTimeline.instanceId,
      });
    } catch (error) {
      setTimelineTransportError(`Could not attach Timeline: ${String(error)}`);
    }
  }
  return (
    <section
      className={`timeline-editor${detachedTimeline ? " timeline-detached" : ""}`}
      data-editor-session-id={snapshot.sessionId}
      style={
        { "--timeline-height": `${timelineHeight}px` } as React.CSSProperties
      }
    >
      <div className="editor-toolbar">
        <button disabled={!dirty || saving || conflict} onClick={save}>
          Save project
        </button>
        <button type="button" disabled={!doc} onClick={addText}>
          Add Text
        </button>
        <button
          type="button"
          onClick={() => void generateSubtitles()}
          disabled={!doc || transcribing || built}
          title={
            built
              ? "Local Whisper transcription is available in the live development workspace."
              : undefined
          }
        >
          {transcribing ? "Generating subtitles…" : "Generate Subtitles"}
        </button>
        <button onClick={reloadDisk} disabled={!doc}>
          Reload from disk
        </button>
        <span className="save-status">
          {dirty ? "Unsaved changes" : "Saved"}
          {built ? " · Built components" : ""}
        </span>
        <button disabled={!undoCount} onClick={undo}>
          Undo
        </button>
        <button disabled={!redoCount} onClick={redo}>
          Redo
        </button>
        <label className="playback-end-control">
          Playback ends
          <select
            aria-label="Playback ends"
            value={playToProjectEnd ? "project" : "content"}
            onChange={(event) => {
              const useProjectEnd = event.currentTarget.value === "project";
              localStorage.setItem(
                "motion-preview-playback-end",
                useProjectEnd ? "project" : "content",
              );
              setPlayToProjectEnd(useProjectEnd);
            }}
          >
            <option value="content">At last clip</option>
            <option value="project">At project end</option>
          </select>
        </label>
      </div>
      <details className="timeline-review" open={timelineWarnings.length > 0}>
        <summary>
          Timeline review:{" "}
          {timelineWarnings.length
            ? `${timelineWarnings.length} long gap${timelineWarnings.length === 1 ? "" : "s"}`
            : "no long gaps"}
        </summary>
        {timelineWarnings.length ? (
          <ul>
            {timelineWarnings.map((warning) => {
              const seconds = (warning.end - warning.from) / manifest.fps;
              const label =
                warning.kind === "late"
                  ? `Late isolated clip on ${warning.trackName}: starts at ${(warning.end / manifest.fps).toFixed(1)}s after ${seconds.toFixed(1)}s empty.`
                  : warning.kind === "between"
                    ? `Long gap on ${warning.trackName}: ${seconds.toFixed(1)}s from ${(warning.from / manifest.fps).toFixed(1)}s to ${(warning.end / manifest.fps).toFixed(1)}s.`
                    : `Empty tail on ${warning.trackName}: ${seconds.toFixed(1)}s after the last clip.`;
              const targetIds = [
                warning.previousClipId,
                warning.nextClipId,
              ].filter((id): id is string => Boolean(id));
              return (
                <li key={`${warning.trackId}:${warning.from}:${warning.end}`}>
                  <span>{label}</span>
                  {targetIds.map((id) => {
                    const target = doc?.clips.find((item) => item.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSelected(id);
                          seek(target?.from ?? warning.from);
                        }}
                      >
                        Locate {target?.label ?? id}
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No long empty intervals were found on visual tracks.</p>
        )}
      </details>
      {conflict && (
        <p className="error" role="alert">
          The project changed on disk while you were editing. Export your draft
          or reload from disk; saving is blocked to protect the agent’s changes.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="editor-notice" role="status">
          {notice}
        </p>
      )}
      <div
        className="editor-columns"
        style={
          { "--inspector-width": `${inspectorWidth}px` } as React.CSSProperties
        }
      >
        <CanvasView
          manifest={editorManifest}
          previewOrigin={previewOrigin}
          built={built}
          reload={reload}
          previewGeneration={previewGeneration}
          frame={frame}
          playing={playing}
          iframeRef={iframe}
          onPreviewLoad={() => {
            send("hello");
            send("playback-boundary", { endFrame: playbackEndFrame });
          }}
          onSeek={seek}
          onPlay={play}
          onPause={pause}
          timeline={doc}
          components={components}
          selectedClipIds={selectedIds}
          onSelectClips={(clipIds) => {
            sourceCommandId.current = null;
            sessionSelectClips(clipIds);
          }}
          onCanvasGestureStart={beginCanvasGesture}
          onCanvasTransform={(changes) => {
            const gesture = canvasGesture.current;
            if (gesture?.canceled) return;
            const current = commands.getCurrentDocument();
            if (!current) return;
            if (
              gesture &&
              commands.getStateVersion() !== gesture.latestVersion
            ) {
              gesture.canceled = true;
              setNotice(
                "Canvas gesture stopped because another edit changed this element.",
              );
              return;
            }
            try {
              const definitions = new Map(
                components.map((item) => [item.id, item]),
              );
              const next = parseEditTimeline({
                ...current,
                clips: current.clips.map((clip) => {
                  const transform = changes.get(clip.id);
                  const definition = definitions.get(clip.componentId);
                  return transform && definition
                    ? applyCanvasTransform(clip, definition, transform)
                    : clip;
                }),
              });
              if (gesture && !gesture.checkpointed) {
                if (commands.getStateVersion() !== gesture.startVersion) {
                  gesture.canceled = true;
                  setNotice(
                    "Canvas gesture stopped because another edit changed this element.",
                  );
                  return;
                }
                checkpoint();
                gesture.checkpointed = true;
              }
              edit(next, false);
              if (gesture) gesture.latestVersion = commands.getStateVersion();
            } catch (canvasError) {
              setError(String(canvasError));
              if (gesture) gesture.canceled = true;
            }
          }}
          onCanvasGestureEnd={endCanvasGesture}
          onCanvasGestureCancel={cancelCanvasGesture}
        />
        <button
          className="panel-splitter inspector-splitter"
          aria-label="Resize inspector"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            panelResize.current = {
              kind: "inspector",
              start: event.clientX,
              size: inspectorWidth,
            };
          }}
          onPointerMove={resizePanel}
          onPointerUp={endPanelResize}
        />
        <InspectorView
          manifest={editorManifest}
          document={doc}
          clip={clip}
          selectedCount={selectedIds.length}
          definition={definition}
          onEdit={edit}
          onChangeProperty={property}
          onChangeRange={changeRange}
          onDuplicate={duplicate}
          onDelete={deleteClip}
          canChangeRange={
            clip ? canPerformTimelineOperation(clip, "move", components) : false
          }
          canDuplicate={
            clip
              ? canPerformTimelineOperation(clip, "duplicate", components)
              : false
          }
          canDelete={
            clip
              ? canPerformTimelineOperation(clip, "delete", components)
              : false
          }
        />
      </div>
      <div
        className="timeline-location"
        data-timeline-detached={Boolean(detachedTimeline)}
      >
        {detachedTimeline ? (
          <div className="timeline-detached-placeholder" role="status">
            <strong>Timeline is open in its own window.</strong>
            <span>
              Canvas and Inspector remain connected to the same editing session.
            </span>
            {timelineTransportError && (
              <span className="error" role="alert">
                {timelineTransportError}
              </span>
            )}
            <div>
              <button type="button" onClick={attachTimeline}>
                Attach Timeline
              </button>
              <button
                type="button"
                onClick={() =>
                  void publishTimelineSnapshot(detachedTimeline)
                    .then(() => setTimelineTransportError(""))
                    .catch((error: unknown) =>
                      setTimelineTransportError(String(error)),
                    )
                }
              >
                Retry sync
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="timeline-window-actions">
              <button type="button" onClick={() => void detachTimeline()}>
                Detach Timeline
              </button>
              {timelineTransportError && (
                <span className="error" role="alert">
                  {timelineTransportError}
                </span>
              )}
            </div>
            <TimelineView
              manifest={editorManifest}
              document={doc}
              components={components}
              selectedClipIds={selectedIds}
              frame={frame}
              playing={playing}
              onEdit={(next, createCheckpoint = true) => {
                const current = commands.getCurrentDocument();
                if (!current) return;
                edit(
                  typeof next === "function" ? next(current) : next,
                  createCheckpoint,
                );
              }}
              onSelectClip={setSelected}
              onSelectClips={(ids) => {
                sourceCommandId.current = null;
                sessionSelectClips(ids);
              }}
              onSeek={seek}
              onPause={pause}
              onPlay={play}
              onBeginClipGesture={beginClipGesture}
              onTimelineOperation={(operation) => {
                const operationError = performTimelineOperation(operation);
                if (operationError) setError(operationError);
              }}
              keyboardShortcutsEnabled={active}
              onUpdateClipGesture={updateClipGesture}
              onEndClipGesture={endClipGesture}
              onResizeStart={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                panelResize.current = {
                  kind: "timeline",
                  start: event.clientY,
                  size: timelineHeight,
                };
              }}
              onResizeMove={resizePanel}
              onResizeEnd={endPanelResize}
              onAddSubtitle={addSubtitle}
              onImportFile={importFile}
              onExportTiming={exportTiming}
              onExportDocument={() =>
                doc &&
                download(
                  `${manifest.id}.timeline.json`,
                  JSON.stringify(doc, null, 2),
                )
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
