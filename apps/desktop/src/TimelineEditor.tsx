import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
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
import { changeTimelineClipRangeWithRipple } from "./timeline-ripple";
import { TimelineView } from "./TimelineView";
import {
  applyCanvasTransform,
  getCanvasVisualElement,
} from "@motion/sdk/canvas";
import { InspectorView } from "./InspectorView";
import { ClipContextPopup } from "./ClipContextPopup";
import { readImageSize } from "./image-size";
import { clipsForTrack } from "./timeline-focus";
import { AssetOrganizerDialog } from "./AssetOrganizerDialog";
import {
  changeClipRangeWithDurationExtension,
  createAudioTimelineTrack,
  isAudioTrack,
  lockedTrackEditError,
  MAX_TIMELINE_DURATION_FRAMES,
  soundtrackTimingUnchanged,
  subtitleTrackId,
} from "./timeline-track-utils";
import { useWorkspaceManager } from "./WorkspaceManager";
import { clampTimelineHeight, DEFAULT_TIMELINE_HEIGHT } from "./editor-layout";
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

const CANVAS_FORMATS = [
  { id: "16:9", label: "16:9 · Landscape", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16 · Portrait", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 · Square", width: 1080, height: 1080 },
  { id: "21:9", label: "21:9 · Ultra-wide", width: 2560, height: 1080 },
] as const;
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
  const canvasSurface = useRef<HTMLDivElement>(null);
  const [visualRequest, setVisualRequest] = useState("");
  const [rightPanelTab, setRightPanelTab] = useState<
    "inspector" | "visual-context"
  >("inspector");
  const [visualContextBusy, setVisualContextBusy] = useState(false);
  const [visualContextStatus, setVisualContextStatus] = useState("");
  const [visualContextPaths, setVisualContextPaths] = useState<{
    screenshot: string;
    inspection: string;
  }>();
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
  const playPreviewRef = useRef<() => void>(() => {});
  const sourceCommandId = useRef<string | null>(null);
  const clipGesture = useRef<
    | {
        gestureId: string;
        clipId: string;
        clipIds: readonly string[];
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
  const [assetOrganizerOpen, setAssetOrganizerOpen] = useState(false);
  const [textContextPopup, setTextContextPopup] = useState<
    { clipId: string; position: { x: number; y: number } } | undefined
  >(undefined);
  useEffect(() => {
    if (!active) setTextContextPopup(undefined);
  }, [active]);
  useEffect(() => setTextContextPopup(undefined), [manifest.id]);
  const [dismissedTimelineWarnings, setDismissedTimelineWarnings] = useState<
    string[]
  >([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionSourceId, setTranscriptionSourceId] =
    useState("soundtrack");
  const [canvasSettings, setCanvasSettings] = useState({
    width: manifest.width,
    height: manifest.height,
    revision: "",
  });
  const [savingCanvasSettings, setSavingCanvasSettings] = useState(false);
  const [playToProjectEnd, setPlayToProjectEnd] = useState(
    () => localStorage.getItem("motion-preview-playback-end") === "project",
  );
  const [rippleMode, setRippleMode] = useState(
    () => localStorage.getItem("motion-timeline-ripple") === "true",
  );
  useEffect(() => {
    localStorage.setItem("motion-timeline-ripple", String(rippleMode));
  }, [rippleMode]);
  const [masterVolume, setMasterVolume] = useState(() => {
    const storedValue = localStorage.getItem("motion-preview-master-volume");
    if (storedValue === null) return 1;
    const stored = Number(storedValue);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 1;
  });
  useEffect(() => {
    const openOrganizer = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === manifest.id) setAssetOrganizerOpen(true);
    };
    window.addEventListener("motion-open-asset-organizer", openOrganizer);
    return () =>
      window.removeEventListener("motion-open-asset-organizer", openOrganizer);
  }, [manifest.id]);
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
    pause: sessionPause,
    undo,
    redo,
    checkpoint: sessionCheckpoint,
    receivePreviewMessage,
    setError,
    setNotice,
  } = commands;
  const editorManifest = {
    ...manifest,
    width: canvasSettings.width,
    height: canvasSettings.height,
    ...(doc ? { durationInFrames: doc.durationInFrames } : {}),
  };
  const playbackEndFrame = doc
    ? timelinePlaybackEnd(doc, playToProjectEnd)
    : manifest.durationInFrames;
  playPreviewRef.current = () => sessionRef.current.commands.play();
  async function prepareVisualContext() {
    if (!doc || !visualRequest.trim() || !window.floxBowWindows) return;
    const surface = canvasSurface.current;
    const stage = surface?.closest<HTMLElement>(".preview-stage");
    if (!surface || !stage) {
      setVisualContextStatus("Canvas surface is not available.");
      return;
    }
    setVisualContextBusy(true);
    setVisualContextStatus("Inspecting the current frame…");
    try {
      pause();
      seek(frame);
      const requestId = crypto.randomUUID();
      const inspection = await new Promise<{
        frame: number;
        width: number;
        height: number;
        fps: number;
        durationInFrames: number;
        nodes: unknown[];
      }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", receive);
          reject(new Error("Preview did not return frame inspection data."));
        }, 5000);
        const receive = (event: MessageEvent) => {
          const data = event.data;
          if (
            event.source !== iframe.current?.contentWindow ||
            event.origin !== previewOrigin ||
            data?.channel !== "motion-editor-v1" ||
            data?.projectId !== manifest.id ||
            data?.type !== "inspect-frame-result" ||
            data?.requestId !== requestId
          )
            return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", receive);
          if (typeof data.error === "string") reject(new Error(data.error));
          else resolve(data);
        };
        window.addEventListener("message", receive);
        send("inspect-frame", { requestId });
      });
      const surfaceRect = surface.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const left = Math.max(0, stageRect.left, surfaceRect.left);
      const top = Math.max(0, stageRect.top, surfaceRect.top);
      const right = Math.min(
        window.innerWidth,
        stageRect.right,
        surfaceRect.right,
      );
      const bottom = Math.min(
        window.innerHeight,
        stageRect.bottom,
        surfaceRect.bottom,
      );
      if (right <= left || bottom <= top)
        throw new Error(
          "Canvas is outside the visible preview area. Choose Fit and retry.",
        );
      const capture = await window.floxBowWindows.captureCanvas({
        x: Math.floor(left),
        y: Math.floor(top),
        width: Math.ceil(right) - Math.floor(left),
        height: Math.ceil(bottom) - Math.floor(top),
      });
      const selectedClip = doc.clips.find((item) => item.id === selected);
      const trackNames = new Map(
        doc.tracks.map((track) => [track.id, track.name]),
      );
      const componentById = new Map(
        components.map((component) => [component.id, component]),
      );
      const timelineElements = doc.tracks.flatMap((track) =>
        doc.clips
          .filter(
            (item) =>
              item.trackId === track.id &&
              inspection.frame >= item.from &&
              inspection.frame < item.from + item.durationInFrames,
          )
          .map((item) => {
            const component = componentById.get(item.componentId);
            const editableFields = (component?.fields ?? []).map((field) => ({
              key: field.key,
              target: field.target,
              label: field.label,
              type: field.type,
              value: fieldValue(item, field),
            }));
            return {
              clipId: item.id,
              label: item.label,
              trackId: item.trackId,
              trackName: trackNames.get(item.trackId) ?? item.trackId,
              componentId: item.componentId,
              componentName: component?.name ?? item.componentId,
              fromFrame: item.from,
              durationInFrames: item.durationInFrames,
              endFrame: item.from + item.durationInFrames,
              localFrame: inspection.frame - item.from,
              fromSeconds: Number((item.from / inspection.fps).toFixed(3)),
              durationSeconds: Number(
                (item.durationInFrames / inspection.fps).toFixed(3),
              ),
              content: item.content,
              props: item.props,
              editability: editableFields.length
                ? "declared-fields"
                : "timeline-data-only",
              sourceRef: `timeline:${manifest.id}/${item.id} · component:${item.componentId}`,
              editableFields,
            };
          }),
      );
      const response = await fetch(`/api/visual-inspection/${manifest.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: visualRequest.trim(),
          frame: inspection.frame,
          fps: inspection.fps,
          durationInFrames: inspection.durationInFrames,
          width: inspection.width,
          height: inspection.height,
          revision: snapshot.revision,
          stateVersion: snapshot.stateVersion,
          selectedClipId: selected,
          selectedClipLabel: selectedClip?.label ?? "",
          dirty: snapshot.dirty,
          nodes: inspection.nodes,
          timelineElements,
          imageDataUrl: capture.dataUrl,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved = (await response.json()) as {
        screenshot: string;
        inspection: string;
        copiedText: string;
      };
      await window.floxBowWindows.copyVisualContext(saved.copiedText);
      setVisualContextPaths({
        screenshot: saved.screenshot,
        inspection: saved.inspection,
      });
      setVisualContextStatus(
        `Context saved and copied for frame ${inspection.frame} (${(inspection.frame / inspection.fps).toFixed(2)} s).`,
      );
    } catch (error) {
      setVisualContextStatus(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setVisualContextBusy(false);
    }
  }

  const timelineWarnings = doc ? timelineGapWarnings(doc) : [];
  const warningKey = (warning: (typeof timelineWarnings)[number]) =>
    `${warning.trackId}:${warning.from}:${warning.end}`;
  const warningKeys = timelineWarnings.map(warningKey);
  const warningSignature = warningKeys.join("|");
  useEffect(() => {
    setDismissedTimelineWarnings((dismissed) => {
      const active = new Set(warningKeys);
      const next = dismissed.filter((key) => active.has(key));
      return next.length === dismissed.length ? dismissed : next;
    });
  }, [warningSignature]);
  const visibleTimelineWarnings = timelineWarnings.filter(
    (warning) => !dismissedTimelineWarnings.includes(warningKey(warning)),
  );
  const transcriptionSources = doc
    ? [
        ...doc.clips
          .filter((clip) => clip.componentId === "soundtrack")
          .map((clip) => ({
            id: "soundtrack",
            assetId: String(clip.content.assetId ?? ""),
            label: `Soundtrack · ${clip.label}`,
            clip,
            kind: "audio" as const,
          })),
        ...doc.clips
          .filter((clip) => clip.componentId === "video")
          .map((clip) => ({
            id: `video:${clip.id}`,
            assetId: String(clip.content.assetId ?? ""),
            label: `Video audio · ${clip.label}`,
            clip,
            kind: "video" as const,
          })),
      ]
    : [];
  const transcriptionSourceIds = transcriptionSources
    .map((source) => source.id)
    .join("|");
  useEffect(() => {
    if (
      transcriptionSources.length > 0 &&
      !transcriptionSources.some(
        (source) => source.id === transcriptionSourceId,
      )
    )
      setTranscriptionSourceId(transcriptionSources[0].id);
  }, [transcriptionSourceIds, transcriptionSourceId]);
  useEffect(() => {
    let alive = true;
    setCanvasSettings({
      width: manifest.width,
      height: manifest.height,
      revision: "",
    });
    void fetch(`/api/projects/${encodeURIComponent(manifest.id)}/settings`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      })
      .then((result: { manifest: ProjectManifest; revision: string }) => {
        if (alive && result.manifest.id === manifest.id)
          setCanvasSettings({
            width: result.manifest.width,
            height: result.manifest.height,
            revision: result.revision,
          });
      })
      .catch((settingsError) => {
        if (alive)
          setError(`Canvas settings unavailable: ${String(settingsError)}`);
      });
    return () => {
      alive = false;
    };
  }, [manifest.id, manifest.width, manifest.height]);

  async function changeCanvasFormat(formatId: string) {
    const format = CANVAS_FORMATS.find((item) => item.id === formatId);
    if (!format || !canvasSettings.revision) return;
    setSavingCanvasSettings(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(manifest.id)}/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: canvasSettings.revision,
            width: format.width,
            height: format.height,
          }),
        },
      );
      const resultText = await response.text();
      let result: any;
      try {
        result = JSON.parse(resultText);
      } catch {
        result = { message: resultText };
      }
      if (!response.ok)
        throw new Error(result?.message ?? "Could not save Canvas format.");
      setCanvasSettings({
        width: result.manifest.width,
        height: result.manifest.height,
        revision: result.revision,
      });
      setNotice(`Canvas format changed to ${format.id}.`);
      requestPreviewReload();
    } catch (settingsError) {
      setError(String(settingsError));
    } finally {
      setSavingCanvasSettings(false);
    }
  }
  const edit = (
    next: EditTimeline,
    createCheckpoint = true,
    allowSoundtrackReplacement = false,
    commandSourceId?: string,
  ) => {
    const current = commands.getCurrentDocument();
    const lockedError = current
      ? lockedTrackEditError(current, next)
      : undefined;
    if (lockedError) {
      setError(lockedError);
      return;
    }
    if (
      current &&
      !allowSoundtrackReplacement &&
      !soundtrackTimingUnchanged(current, next)
    ) {
      setError(
        "Soundtrack timing is fixed at frame 0 for the selected audio's full duration. Reselect audio to change it.",
      );
      return;
    }
    sourceCommandId.current = commandSourceId ?? null;
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
    const togglePlayback = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      )
        return;
      const live = sessionRef.current;
      if (!live.snapshot.document) return;
      event.preventDefault();
      if (live.snapshot.playing) live.commands.pause();
      else playPreviewRef.current();
    };
    window.addEventListener("keydown", togglePlayback, true);
    return () => window.removeEventListener("keydown", togglePlayback, true);
  }, []);
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
  const duplicateCanvasClips = (clipIds: readonly string[]) => {
    const baseline = commands.getCurrentDocument();
    const gesture = canvasGesture.current;
    if (!baseline || !gesture) return new Map();
    let next = baseline;
    const copies = new Map<
      string,
      import("@motion/sdk/canvas").CanvasVisualElement
    >();
    try {
      for (const sourceId of clipIds) {
        const source = baseline.clips.find((clip) => clip.id === sourceId);
        if (!source)
          throw new Error("The Canvas element no longer exists to duplicate.");
        const duplicateId = `clip-${crypto.randomUUID()}`;
        next = addTimelineClipCopy(
          next,
          source,
          duplicateId,
          source.from,
          components,
        );
        const duplicate = next.clips.find((clip) => clip.id === duplicateId);
        const definition = components.find(
          (component) => component.id === source.componentId,
        );
        const visual =
          duplicate && definition
            ? getCanvasVisualElement(duplicate, definition)
            : undefined;
        if (!duplicate || !visual)
          throw new Error(
            "The duplicated clip has no Canvas transform contract.",
          );
        copies.set(sourceId, visual);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return new Map();
    }
    if (!copies.size) return copies;
    checkpoint();
    edit(next, false);
    sessionSelectClips([...copies.values()].map((clip) => clip.id));
    gesture.checkpointed = true;
    gesture.latestVersion = commands.getStateVersion();
    setNotice(
      `Duplicated ${copies.size} Canvas element${copies.size === 1 ? "" : "s"}.`,
    );
    return copies;
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
  useEffect(() => {
    localStorage.setItem("motion-preview-master-volume", String(masterVolume));
    send("master-volume", { volume: masterVolume });
  }, [send, masterVolume, previewGeneration]);
  const [inspectorWidth, setInspectorWidth] = useState(
    () => Number(localStorage.getItem("motion-inspector-width")) || 270,
  );
  const [timelineHeight, setTimelineHeight] = useState(() =>
    clampTimelineHeight(
      Number(localStorage.getItem("motion-timeline-height")) ||
        DEFAULT_TIMELINE_HEIGHT,
      window.innerHeight,
    ),
  );
  const panelResize = useRef<
    | {
        kind: "inspector" | "timeline";
        start: number;
        size: number;
        pointerId: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const constrainTimeline = () => {
      setTimelineHeight((current) => {
        const next = clampTimelineHeight(current, window.innerHeight);
        if (next !== current)
          localStorage.setItem("motion-timeline-height", String(next));
        return next;
      });
    };
    window.addEventListener("resize", constrainTimeline);
    return () => window.removeEventListener("resize", constrainTimeline);
  }, []);
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
        track = { id: "audio", name: "Audio", kind: "audio" };
        tracks.push(track);
      } else if (!track.kind) {
        tracks[tracks.findIndex((item) => item.id === track!.id)] = {
          ...track,
          kind: "audio",
        };
        track = tracks.find((item) => item.id === track!.id)!;
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
      edit(next, true, true);
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
          fromFrame?: unknown;
          trackId?: unknown;
          x?: unknown;
          y?: unknown;
          aspectRatio?: unknown;
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
      const from =
        detail.fromFrame === undefined
          ? Math.min(live.snapshot.frame, current.durationInFrames - 1)
          : detail.fromFrame;
      if (
        typeof from !== "number" ||
        !Number.isInteger(from) ||
        from < 0 ||
        from >= MAX_TIMELINE_DURATION_FRAMES ||
        (detail.x !== undefined &&
          (typeof detail.x !== "number" ||
            !Number.isFinite(detail.x) ||
            detail.x < 0 ||
            detail.x > 100)) ||
        (detail.y !== undefined &&
          (typeof detail.y !== "number" ||
            !Number.isFinite(detail.y) ||
            detail.y < 0 ||
            detail.y > 100)) ||
        (detail.aspectRatio !== undefined &&
          (typeof detail.aspectRatio !== "number" ||
            !Number.isFinite(detail.aspectRatio) ||
            detail.aspectRatio < 0.01 ||
            detail.aspectRatio > 100))
      ) {
        setError("The dropped image placement is invalid.");
        return;
      }
      const trackId =
        typeof detail.trackId === "string" &&
        current.tracks.some(
          (track) =>
            track.id === detail.trackId &&
            !isAudioTrack(current, track) &&
            !track.locked,
        )
          ? detail.trackId
          : (current.tracks.find(
              (track) =>
                track.id === "visuals" &&
                !isAudioTrack(current, track) &&
                !track.locked,
            )?.id ??
            current.tracks.find(
              (track) => !isAudioTrack(current, track) && !track.locked,
            )?.id);
      if (!trackId) {
        setError("Add a visual Timeline track before placing an image.");
        return;
      }
      const durationInFrames = Math.min(
        current.fps * 5,
        MAX_TIMELINE_DURATION_FRAMES - from,
      );
      if (durationInFrames < 1) {
        setError("The image cannot be placed beyond the Timeline limit.");
        return;
      }
      const compositionAspect = manifest.width / manifest.height;
      const sourceAspect =
        typeof detail.aspectRatio === "number" ? detail.aspectRatio : undefined;
      let width = 80;
      let height = 80;
      if (sourceAspect !== undefined && sourceAspect >= compositionAspect) {
        height = (80 * compositionAspect) / sourceAspect;
      } else if (sourceAspect !== undefined) {
        width = (80 * sourceAspect) / compositionAspect;
      }
      const image = {
        id: `image-${crypto.randomUUID()}`,
        trackId,
        componentId: "image",
        label:
          typeof detail.displayName === "string"
            ? detail.displayName.slice(0, 200)
            : "Image",
        from,
        durationInFrames,
        content:
          sourceAspect === undefined
            ? { assetId: detail.assetId }
            : { assetId: detail.assetId, aspectRatio: sourceAspect },
        props: {
          x: typeof detail.x === "number" ? detail.x : 50,
          y: typeof detail.y === "number" ? detail.y : 50,
          width,
          height,
          rotation: 0,
          anchor: "center",
          opacity: 1,
          fit: sourceAspect === undefined ? "contain" : "fill",
        },
      };
      edit(
        parseEditTimeline({
          ...current,
          durationInFrames: Math.max(
            current.durationInFrames,
            from + durationInFrames,
          ),
          clips: [...current.clips, image],
        }),
      );
      live.commands.selectClip(image.id);
      setNotice(`${image.label} placed as an editable Image clip.`);
      workspace.activatePanel("editor");
    };
    window.addEventListener("motion-add-image", addImage);
    return () => window.removeEventListener("motion-add-image", addImage);
  }, [manifest.id, manifest.width, manifest.height, workspace]);

  useEffect(() => {
    const addCharacter = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: unknown;
          groupId?: unknown;
          displayName?: unknown;
        }>
      ).detail;
      if (
        detail?.projectId !== manifest.id ||
        typeof detail.groupId !== "string"
      )
        return;
      const live = sessionRef.current;
      const current = live.commands.getCurrentDocument();
      if (live.snapshot.projectId !== manifest.id || !current) return;
      const group = current.assetGroups?.find(
        (candidate) => candidate.id === detail.groupId,
      );
      const firstPose = group?.members.find((member) => member.role === "pose");
      if (!group || !firstPose) {
        setError(
          "Choose at least one pose image before placing this character.",
        );
        return;
      }
      const from = Math.min(
        Math.max(0, live.snapshot.frame),
        MAX_TIMELINE_DURATION_FRAMES - 1,
      );
      const scene = (current.scenes ?? []).find(
        (candidate) =>
          from >= candidate.from &&
          from < candidate.from + candidate.durationInFrames,
      );
      const visualTrack = current.tracks.find(
        (track) => !isAudioTrack(current, track) && !track.locked,
      );
      if (!visualTrack) {
        setError(
          "Add an unlocked visual Timeline track before placing a character.",
        );
        return;
      }
      const sceneEnd = scene
        ? scene.from + scene.durationInFrames
        : MAX_TIMELINE_DURATION_FRAMES;
      const durationInFrames = Math.min(current.fps * 5, sceneEnd - from);
      if (durationInFrames < 1) {
        setError("The character cannot be placed at this Timeline position.");
        return;
      }
      const clip = {
        id: `character-${crypto.randomUUID()}`,
        trackId: visualTrack.id,
        componentId: "character",
        label:
          typeof detail.displayName === "string"
            ? detail.displayName.slice(0, 200)
            : group.name,
        from,
        durationInFrames,
        ...(scene ? { sceneId: scene.id } : {}),
        content: {
          groupId: group.id,
          poseEvents: [
            {
              id: `pose-${crypto.randomUUID()}`,
              atFrame: scene ? from - scene.from : 0,
              memberId: firstPose.id,
            },
          ],
        },
        props: {
          x: 50,
          y: 50,
          width: 40,
          height: 70,
          rotation: 0,
          anchor: "bottom-center",
          opacity: 1,
          fit: "contain",
        },
      };
      try {
        const next = parseEditTimeline({
          ...current,
          durationInFrames: Math.max(
            current.durationInFrames,
            from + durationInFrames,
          ),
          clips: [...current.clips, clip],
        });
        edit(next);
        live.commands.selectClip(clip.id);
        setNotice(`${clip.label} placed as an editable Timeline character.`);
        workspace.activatePanel("editor");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    window.addEventListener("motion-add-character", addCharacter);
    return () =>
      window.removeEventListener("motion-add-character", addCharacter);
  }, [manifest.id, workspace]);

  useEffect(() => {
    const addVideo = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: unknown;
          assetId?: unknown;
          displayName?: unknown;
          fromFrame?: unknown;
          trackId?: unknown;
          x?: unknown;
          y?: unknown;
        }>
      ).detail;
      if (detail?.projectId !== manifest.id) return;
      if (
        typeof detail.assetId !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.assetId) ||
        (detail.x !== undefined &&
          (typeof detail.x !== "number" ||
            !Number.isFinite(detail.x) ||
            detail.x < 0 ||
            detail.x > 100)) ||
        (detail.y !== undefined &&
          (typeof detail.y !== "number" ||
            !Number.isFinite(detail.y) ||
            detail.y < 0 ||
            detail.y > 100))
      ) {
        setError("The dropped video placement is invalid.");
        return;
      }
      const session = sessionRef.current;
      const projectId = session.snapshot.projectId;
      const sessionId = session.snapshot.sessionId;
      void (async () => {
        try {
          const response = await fetch(
            `/api/media/${encodeURIComponent(manifest.id)}/assets/${encodeURIComponent(detail.assetId as string)}/video`,
          );
          const raw = await response.text();
          let metadata: {
            assetId?: unknown;
            durationInSeconds?: unknown;
            width?: unknown;
            height?: unknown;
            message?: unknown;
          };
          try {
            metadata = JSON.parse(raw);
          } catch {
            throw new Error(raw || "The selected MP4 could not be inspected.");
          }
          if (!response.ok)
            throw new Error(
              typeof metadata.message === "string"
                ? metadata.message
                : "The selected MP4 could not be inspected.",
            );
          if (
            metadata.assetId !== detail.assetId ||
            typeof metadata.durationInSeconds !== "number" ||
            !Number.isFinite(metadata.durationInSeconds) ||
            metadata.durationInSeconds <= 0
          )
            throw new Error("The MP4 metadata response is invalid.");
          const live = sessionRef.current;
          if (
            live.snapshot.projectId !== projectId ||
            live.snapshot.sessionId !== sessionId ||
            projectId !== manifest.id
          )
            return;
          const current = live.commands.getCurrentDocument();
          if (!current)
            throw new Error("This project has no editable Timeline.");
          const from =
            detail.fromFrame === undefined
              ? Math.min(live.snapshot.frame, current.durationInFrames - 1)
              : detail.fromFrame;
          if (
            typeof from !== "number" ||
            !Number.isInteger(from) ||
            from < 0 ||
            from >= MAX_TIMELINE_DURATION_FRAMES
          )
            throw new Error("The video start position is invalid.");
          const durationInFrames = Math.ceil(
            metadata.durationInSeconds * current.fps,
          );
          const end = from + durationInFrames;
          if (end > MAX_TIMELINE_DURATION_FRAMES)
            throw new Error(
              "This video would exceed the maximum project duration. Shorten the project position or choose a shorter clip.",
            );
          const isNonVisualTrack = (
            candidate: (typeof current.tracks)[number],
          ) => isAudioTrack(current, candidate);
          const track =
            typeof detail.trackId === "string"
              ? current.tracks.find((item) => item.id === detail.trackId)
              : (current.tracks.find(
                  (item) =>
                    item.id === "visuals" &&
                    !isNonVisualTrack(item) &&
                    !item.locked,
                ) ??
                current.tracks.find(
                  (item) => !isNonVisualTrack(item) && !item.locked,
                ));
          if (
            !track ||
            (typeof detail.trackId === "string" &&
              !current.tracks.some((item) => item.id === detail.trackId)) ||
            isNonVisualTrack(track) ||
            track.locked
          )
            throw new Error("Add video to a visual Timeline track.");
          const video = {
            id: `video-${crypto.randomUUID()}`,
            trackId: track.id,
            componentId: "video",
            label:
              typeof detail.displayName === "string"
                ? detail.displayName.slice(0, 200)
                : "Video",
            from,
            durationInFrames,
            content: {
              assetId: detail.assetId,
              sourceStartSeconds: 0,
              sourceDurationSeconds: metadata.durationInSeconds,
            },
            props: {
              x: typeof detail.x === "number" ? detail.x : 50,
              y: typeof detail.y === "number" ? detail.y : 50,
              width: 80,
              height: 80,
              rotation: 0,
              anchor: "center",
              opacity: 1,
              fit: "contain",
              volume: 1,
            },
          };
          edit(
            parseEditTimeline({
              ...current,
              durationInFrames: Math.max(current.durationInFrames, end),
              clips: [...current.clips, video],
            }),
          );
          live.commands.selectClip(video.id);
          setError("");
          setNotice(`${video.label} added as an editable Video clip.`);
          workspace.activatePanel("editor");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    };
    window.addEventListener("motion-add-video", addVideo);
    return () => window.removeEventListener("motion-add-video", addVideo);
  }, [manifest.id, workspace]);

  function handleCanvasMediaDrop(
    data: {
      projectId: string;
      assetId: string;
      type: "audio" | "image" | "video";
      displayName: string;
    },
    position: { x: number; y: number },
  ) {
    if (data.projectId !== manifest.id) return;
    if (data.type === "audio") {
      setNotice(
        "Audio is not a Canvas element. Use Soundtrack in the Media Library.",
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent(
        data.type === "video" ? "motion-add-video" : "motion-add-image",
        {
          detail: { ...data, x: position.x, y: position.y },
        },
      ),
    );
  }

  function handleTimelineMediaDrop(
    data: {
      projectId: string;
      assetId: string;
      type: "audio" | "image" | "video";
      displayName: string;
    },
    target: { frame: number; trackId: string },
  ) {
    if (data.projectId !== manifest.id) return;
    if (data.type === "audio") {
      setNotice(
        "Audio currently uses the frame-zero Soundtrack control in the Media Library.",
      );
      return;
    }
    const current = sessionRef.current.commands.getCurrentDocument();
    const track = current?.tracks.find((item) => item.id === target.trackId);
    if (!current || !track) {
      setNotice("The selected Timeline track is no longer available.");
      return;
    }
    if (isAudioTrack(current, track)) {
      setNotice("Drop an image or video onto a visual Timeline track.");
      return;
    }
    if (track.locked) {
      setNotice("Unlock this Timeline track before adding media.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent(
        data.type === "video" ? "motion-add-video" : "motion-add-image",
        {
          detail: { ...data, fromFrame: target.frame, trackId: target.trackId },
        },
      ),
    );
  }

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
            playPreviewRef.current();
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
            edit(validated, command.checkpoint, false, envelope.commandId);
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
            let gestureClipIds: readonly string[] = [command.clipId];
            if (command.duplicateId) {
              const duplicate = addTimelineClipCopy(
                current,
                clip,
                command.duplicateId,
                clip.from,
                components,
              );
              sessionCheckpoint();
              edit(duplicate, false, false, envelope.commandId);
              gestureBaseline = duplicate;
              gestureClipId = command.duplicateId;
              gestureClipIds = [command.duplicateId];
              sessionSelectClip(gestureClipId);
            } else {
              if (command.groupMove) {
                const selected = commands.getSelectedClipIds();
                if (!selected.includes(command.clipId))
                  throw new Error("The selected Timeline group has changed.");
                gestureClipIds = selected;
              }
              const group = gestureClipIds.map((id) =>
                current.clips.find((item) => item.id === id),
              );
              if (group.some((item) => !item))
                throw new Error("A selected Timeline clip no longer exists.");
              if (group.some((item) => item?.componentId === "soundtrack"))
                throw new Error(
                  "The soundtrack is fixed at frame zero and cannot be moved with a Timeline group.",
                );
              sessionCheckpoint();
            }
            sourceCommandId.current = envelope.commandId;
            clipGesture.current = {
              gestureId: command.gestureId,
              clipId: gestureClipId,
              clipIds: gestureClipIds,
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
            let next = gesture.baseline;
            if (gesture.clipIds.length > 1 && !command.trim) {
              const delta = command.from - clip.from;
              for (const id of gesture.clipIds) {
                const member = gesture.baseline.clips.find(
                  (item) => item.id === id,
                );
                if (!member)
                  throw new Error("A selected Timeline clip disappeared.");
                const from = member.from + delta;
                next = changeClipRangeWithDurationExtension(
                  next,
                  member.id,
                  from,
                  from + member.durationInFrames,
                  false,
                  resolveTimelineBehavior(member.componentId, components),
                );
              }
            } else {
              next = changeTimelineClipRangeWithRipple(
                gesture.baseline,
                command.clipId,
                command.from,
                command.durationInFrames,
                command.trim,
                command.ripple === true,
                resolveTimelineBehavior(clip.componentId, components),
              );
            }
            edit(next, false, false, envelope.commandId);
            gesture.expectedVersion = commands.getStateVersion();
          } else if (command.type === "endClipGesture") {
            if (clipGesture.current?.gestureId !== command.gestureId)
              throw new Error("The clip drag is no longer active.");
            clipGesture.current = undefined;
            sourceCommandId.current = envelope.commandId;
          } else if (command.type === "undo") {
            const liveSession = sessionRef.current;
            if (!liveSession.snapshot.undoCount)
              throw new Error("There is no edit to undo.");
            sourceCommandId.current = envelope.commandId;
            liveSession.commands.undo();
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
            const liveSession = sessionRef.current;
            if (!liveSession.snapshot.redoCount)
              throw new Error("There is no edit to redo.");
            sourceCommandId.current = envelope.commandId;
            liveSession.commands.redo();
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
      if (
        c.componentId === "video" &&
        field.target === "content" &&
        field.key === "sourceStartSeconds"
      ) {
        const sourceEnd = Number(validated) + c.durationInFrames / current.fps;
        const sourceDuration = Number(c.content.sourceDurationSeconds);
        if (sourceEnd > sourceDuration + 1 / current.fps)
          throw new Error(
            "The Video source start and clip duration exceed the MP4 duration.",
          );
      }
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
  function changeTextContextValue(
    clipId: string,
    key: "text" | "color" | "fontSize",
    value: string | number,
  ) {
    const current = sessionRef.current.commands.getCurrentDocument();
    const isTextClip = (componentId: string) =>
      componentId === "text" || componentId === "subtitles";
    const source = current?.clips.find(
      (candidate) =>
        candidate.id === clipId && isTextClip(candidate.componentId),
    );
    if (!current || !source) return;
    const next = structuredClone(current);
    const target = next.clips.find((candidate) => candidate.id === clipId);
    if (!target || !isTextClip(target.componentId)) return;
    if (key === "text") target.content.text = value;
    else target.props[key] = value;
    try {
      edit(parseEditTimeline(next));
    } catch (editError) {
      setError(String(editError));
    }
  }
  function applyContextImagePreset(
    clipId: string,
    preset: "center" | "fit" | "fill" | "flip",
  ) {
    const current = sessionRef.current.commands.getCurrentDocument();
    if (!current) return;
    const next = structuredClone(current);
    const target = next.clips.find(
      (candidate) =>
        candidate.id === clipId && candidate.componentId === "image",
    );
    if (!target) return;
    if (preset === "flip") {
      target.props.flipHorizontal = target.props.flipHorizontal !== true;
    } else if (preset === "center") {
      target.props.x = 50;
      target.props.y = 50;
      target.props.anchor = "center";
    } else {
      target.props.x = 50;
      target.props.y = 50;
      target.props.width = 100;
      target.props.height = 100;
      target.props.anchor = "center";
      target.props.fit = preset === "fit" ? "contain" : "cover";
    }
    try {
      edit(parseEditTimeline(next));
    } catch (editError) {
      setError(String(editError));
    }
  }
  async function resetContextImageSize(clipId: string) {
    try {
      const first = sessionRef.current.commands.getCurrentDocument();
      const source = first?.clips.find(
        (candidate) =>
          candidate.id === clipId && candidate.componentId === "image",
      );
      if (!first || !source) return;
      const stored = source.content.originalSize;
      let originalSize =
        stored &&
        typeof stored === "object" &&
        "width" in stored &&
        "height" in stored &&
        typeof stored.width === "number" &&
        Number.isFinite(stored.width) &&
        stored.width > 0 &&
        typeof stored.height === "number" &&
        Number.isFinite(stored.height) &&
        stored.height > 0
          ? { width: stored.width, height: stored.height }
          : undefined;
      if (!originalSize) {
        originalSize = await readImageSize(
          `/api/media/${encodeURIComponent(manifest.id)}/assets/${encodeURIComponent(String(source.content.assetId ?? ""))}/thumbnail`,
        );
      }
      const width = Math.max(
        1,
        Math.min(500, (originalSize.width / editorManifest.width) * 100),
      );
      const height = Math.max(
        1,
        Math.min(500, (originalSize.height / editorManifest.height) * 100),
      );
      const current = sessionRef.current.commands.getCurrentDocument();
      if (!current?.clips.some((candidate) => candidate.id === clipId)) return;
      edit(
        parseEditTimeline({
          ...structuredClone(current),
          clips: current.clips.map((candidate) =>
            candidate.id === clipId && candidate.componentId === "image"
              ? {
                  ...candidate,
                  content: {
                    ...candidate.content,
                    originalSize,
                    aspectRatio: originalSize.width / originalSize.height,
                  },
                  props: { ...candidate.props, width, height, fit: "contain" },
                }
              : candidate,
          ),
        }),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? `Could not reset the image size: ${error.message}`
          : "Could not reset the image size.",
      );
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
      const height = clampTimelineHeight(
        d.size + d.start - e.clientY,
        window.innerHeight,
      );
      setTimelineHeight(height);
      localStorage.setItem("motion-timeline-height", String(height));
    }
  }
  function endPanelResize() {
    panelResize.current = undefined;
  }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (panelResize.current?.pointerId !== event.pointerId) return;
      resizePanel(event as unknown as ReactPointerEvent<HTMLButtonElement>);
    };
    const end = (event: PointerEvent) => {
      if (panelResize.current?.pointerId === event.pointerId) endPanelResize();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);
  function beginPanelResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: "inspector" | "timeline",
    start: number,
    size: number,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    panelResize.current = { kind, start, size, pointerId: event.pointerId };
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
    const source = transcriptionSources.find(
      (item) => item.id === transcriptionSourceId,
    );
    const assetId = source?.assetId;
    if (!current || !source || !assetId) {
      setError(
        "Choose the project soundtrack or a video clip on the Timeline as the transcription source.",
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
    setNotice(
      source.kind === "video"
        ? "Extracting audio from the selected video clip, then running local Whisper…"
        : "Running the local Whisper model on the selected soundtrack…",
    );
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(initial.projectId)}/assets/${encodeURIComponent(assetId)}/transcription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fps: current.fps,
            durationInFrames: current.durationInFrames,
            ...(source.kind === "video"
              ? {
                  sourceClipId: source.clip.id,
                  timelineStartFrame: source.clip.from,
                  sourceStartSeconds: Number(
                    source.clip.content.sourceStartSeconds ?? 0,
                  ),
                  sourceDurationSeconds:
                    source.clip.durationInFrames / current.fps,
                }
              : {}),
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
      const liveSource =
        source.kind === "audio"
          ? liveDocument.clips.find((item) => item.componentId === "soundtrack")
          : liveDocument.clips.find(
              (item) =>
                item.id === source.clip.id && item.componentId === "video",
            );
      if (
        liveSource?.content.assetId !== assetId ||
        (source.kind === "video" &&
          (liveSource?.from !== source.clip.from ||
            liveSource?.durationInFrames !== source.clip.durationInFrames ||
            Number(liveSource.content.sourceStartSeconds ?? 0) !==
              Number(source.clip.content.sourceStartSeconds ?? 0)))
      )
        throw new Error(
          "The transcription source changed while Whisper was working. Run it again.",
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
      edit(next);
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
  const textContextClip = textContextPopup
    ? doc?.clips.find((candidate) => candidate.id === textContextPopup.clipId)
    : undefined;
  const textContextTrackClips =
    textContextClip && doc
      ? clipsForTrack(doc.clips, textContextClip.trackId)
      : [];
  const textContextTrack = textContextClip
    ? doc?.tracks.find((track) => track.id === textContextClip.trackId)
    : undefined;
  const contextTrackLocked = textContextTrack?.locked === true;
  const selectedTrackLocked = Boolean(
    clip && doc?.tracks.find((track) => track.id === clip.trackId)?.locked,
  );
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
  async function separateVideoAudio() {
    const sourceDocument = commands.getCurrentDocument();
    const sourceClip = sourceDocument?.clips.find(
      (item) => item.id === clip?.id && item.componentId === "video",
    );
    if (!sourceDocument || !sourceClip) return;
    if (
      sourceDocument.clips.some(
        (item) =>
          item.componentId === "video-audio" &&
          item.content.sourceVideoClipId === sourceClip.id,
      )
    ) {
      setNotice("This video's audio is already a separate Timeline clip.");
      return;
    }
    const projectId = manifest.id;
    const sessionId = sessionRef.current.snapshot.sessionId;
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(String(sourceClip.content.assetId ?? ""))}/video`,
      );
      const result = (await response.json()) as {
        assetId?: unknown;
        hasAudio?: unknown;
        message?: unknown;
      };
      if (!response.ok)
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : "The video audio could not be inspected.",
        );
      if (
        result.assetId !== sourceClip.content.assetId ||
        result.hasAudio !== true
      )
        throw new Error("This video does not contain a usable audio track.");

      const live = sessionRef.current;
      if (
        live.snapshot.projectId !== projectId ||
        live.snapshot.sessionId !== sessionId
      )
        return;
      const current = live.commands.getCurrentDocument();
      const video = current?.clips.find(
        (item) => item.id === sourceClip.id && item.componentId === "video",
      );
      if (!current || !video)
        throw new Error(
          "The selected video changed while audio was inspected.",
        );
      if (
        current.clips.some(
          (item) =>
            item.componentId === "video-audio" &&
            item.content.sourceVideoClipId === video.id,
        )
      ) {
        setNotice("This video's audio is already a separate Timeline clip.");
        return;
      }
      let tracks = current.tracks;
      let audioTrack = tracks.find(
        (track) => isAudioTrack(current, track) && !track.locked,
      );
      if (!audioTrack) {
        const id = `audio-${crypto.randomUUID()}`;
        const name = `Audio ${tracks.filter((track) => isAudioTrack(current, track)).length + 1}`;
        const expanded = createAudioTimelineTrack(current, id, name);
        tracks = expanded.tracks;
        audioTrack = tracks.find((track) => track.id === id);
      }
      if (!audioTrack)
        throw new Error(
          "Add or unlock an audio track before separating audio.",
        );
      const volume = Number(video.props.volume ?? 1);
      const audioClip = {
        id: `video-audio-${crypto.randomUUID()}`,
        trackId: audioTrack.id,
        componentId: "video-audio",
        label: `Audio · ${video.label}`,
        from: video.from,
        durationInFrames: video.durationInFrames,
        content: {
          assetId: video.content.assetId,
          sourceVideoClipId: video.id,
          sourceStartSeconds: Number(video.content.sourceStartSeconds ?? 0),
          sourceDurationSeconds: Number(video.content.sourceDurationSeconds),
        },
        props: { volume: Number.isFinite(volume) ? volume : 1 },
      };
      const next = parseEditTimeline({
        ...current,
        tracks,
        clips: [
          ...current.clips.map((item) =>
            item.id === video.id
              ? { ...item, props: { ...item.props, volume: 0 } }
              : item,
          ),
          audioClip,
        ],
      });
      edit(next);
      live.commands.selectClip(audioClip.id);
      setError("");
      setNotice(
        `Audio separated from ${video.label}. The video is muted; delete or move the new audio clip independently.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
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
    operation: TimelineOperation | "undo" | "redo",
    targetClipId?: string,
  ): string | undefined {
    const liveSnapshot = sessionRef.current.snapshot;
    const liveCommands = sessionRef.current.commands;
    const liveComponents = liveSnapshot.components;
    const current = commands.getCurrentDocument();
    const selectedClip = current?.clips.find(
      (item) => item.id === (targetClipId ?? liveSnapshot.selectedClipId),
    );
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
          "Soundtrack clips can be deleted, but cannot be moved in time, copied, cut, duplicated or trimmed.",
        );
        return "Soundtrack clips can be deleted, but cannot be moved in time, copied, cut, duplicated or trimmed.";
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
    groupMove = false,
  ) {
    const baseline = commands.getCurrentDocument();
    if (!baseline) return;
    const clip = baseline.clips.find((item) => item.id === clipId);
    if (!clip) return;
    let gestureBaseline = baseline;
    let gestureClipId = clipId;
    let gestureClipIds: readonly string[] = [clipId];
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
      edit(next, false);
      gestureBaseline = next;
      gestureClipId = duplicateId;
      gestureClipIds = [duplicateId];
      setSelected(duplicateId);
    } else {
      if (groupMove) {
        const selected = commands.getSelectedClipIds();
        if (!selected.includes(clipId)) {
          setError("The selected Timeline group has changed.");
          return;
        }
        gestureClipIds = selected;
      }
      const group = gestureClipIds.map((id) =>
        baseline.clips.find((item) => item.id === id),
      );
      if (group.some((item) => !item)) {
        setError("A selected Timeline clip no longer exists.");
        return;
      }
      if (group.some((item) => item?.componentId === "soundtrack")) {
        setError(
          "The soundtrack is fixed at frame zero and cannot be moved with a Timeline group.",
        );
        return;
      }
      checkpoint();
    }
    clipGesture.current = {
      gestureId,
      clipId: gestureClipId,
      clipIds: gestureClipIds,
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
    ripple = false,
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
      let next = gesture.baseline;
      if (gesture.clipIds.length > 1 && !trim) {
        const delta = start - clipToChange.from;
        for (const id of gesture.clipIds) {
          const member = gesture.baseline.clips.find((item) => item.id === id);
          if (!member) throw new Error("A selected Timeline clip disappeared.");
          const from = member.from + delta;
          next = changeClipRangeWithDurationExtension(
            next,
            member.id,
            from,
            from + member.durationInFrames,
            false,
            resolveTimelineBehavior(member.componentId, components),
          );
        }
      } else {
        next = changeTimelineClipRangeWithRipple(
          gesture.baseline,
          clipId,
          start,
          duration,
          trim,
          ripple,
          resolveTimelineBehavior(clipToChange.componentId, components),
        );
      }
      edit(next, false);
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
    <>
      {assetOrganizerOpen &&
        doc &&
        createPortal(
          <AssetOrganizerDialog
            projectId={manifest.id}
            groups={doc.assetGroups ?? []}
            onEdit={(update) => {
              const current = commands.getCurrentDocument();
              if (!current) return;
              try {
                edit(update(current));
              } catch (editError) {
                setError(String(editError));
              }
            }}
            onClose={() => setAssetOrganizerOpen(false)}
          />,
          globalThis.document.body,
        )}
      {textContextPopup && textContextClip && (
        <ClipContextPopup
          clip={textContextClip}
          position={textContextPopup.position}
          onChangeText={(clipId, value) =>
            changeTextContextValue(clipId, "text", value)
          }
          onChangeColor={(clipId, value) =>
            changeTextContextValue(clipId, "color", value)
          }
          onChangeFontSize={(clipId, value) =>
            changeTextContextValue(clipId, "fontSize", value)
          }
          onImagePreset={applyContextImagePreset}
          onResetImageSize={resetContextImageSize}
          onClipOperation={(clipId, operation) => {
            const operationError = performTimelineOperation(operation, clipId);
            if (operationError) setError(operationError);
          }}
          canEditClip={!contextTrackLocked}
          canDuplicate={
            !contextTrackLocked &&
            canPerformTimelineOperation(
              textContextClip,
              "duplicate",
              components,
            )
          }
          canDelete={
            !contextTrackLocked &&
            canPerformTimelineOperation(textContextClip, "delete", components)
          }
          timelineView={
            doc && textContextTrack ? (
              <TimelineView
                manifest={editorManifest}
                document={doc}
                focusedTrackId={textContextTrack.id}
                focusedClipId={textContextClip.id}
                components={components}
                selectedClipIds={selectedIds.filter((id) =>
                  textContextTrackClips.some((item) => item.id === id),
                )}
                selectedClipId={textContextClip.id}
                frame={frame}
                playing={playing}
                onEdit={(next, createCheckpoint = true) => {
                  const current = commands.getCurrentDocument();
                  if (current)
                    edit(
                      typeof next === "function" ? next(current) : next,
                      createCheckpoint,
                    );
                }}
                onSelectClip={(clipId, additive = false) => {
                  setSelected(clipId, additive);
                  if (!additive) {
                    const target = doc.clips.find(
                      (candidate) => candidate.id === clipId,
                    );
                    if (target) seek(target.from);
                    setTextContextPopup((current) =>
                      current ? { ...current, clipId } : current,
                    );
                  }
                }}
                onSelectClips={(clipIds) => {
                  sourceCommandId.current = null;
                  sessionSelectClips(clipIds);
                  if (clipIds[0])
                    setTextContextPopup((current) =>
                      current ? { ...current, clipId: clipIds[0] } : current,
                    );
                }}
                onSeek={seek}
                onClipContextMenu={(clipId, position) => {
                  setSelected(clipId);
                  setTextContextPopup({ clipId, position });
                }}
                onPause={pause}
                onPlay={() => playPreviewRef.current()}
                onBeginClipGesture={beginClipGesture}
                onTimelineOperation={(operation) => {
                  const operationError = performTimelineOperation(operation);
                  if (operationError) setError(operationError);
                }}
                keyboardShortcutsEnabled={false}
                rippleMode={rippleMode}
                onRippleModeChange={setRippleMode}
                onUpdateClipGesture={updateClipGesture}
                onEndClipGesture={endClipGesture}
                onResizeStart={() => {}}
                onResizeMove={() => {}}
                onResizeEnd={() => {}}
                onAddSubtitle={() => {}}
                onImportFile={() => {}}
                onExportTiming={() => {}}
                onExportDocument={() => {}}
              />
            ) : null
          }
          onClose={() => setTextContextPopup(undefined)}
        />
      )}
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
          <label className="canvas-format-control">
            Canvas
            <select
              aria-label="Canvas format"
              value={
                CANVAS_FORMATS.find(
                  (format) =>
                    format.width === canvasSettings.width &&
                    format.height === canvasSettings.height,
                )?.id ?? "custom"
              }
              disabled={
                built || savingCanvasSettings || !canvasSettings.revision
              }
              onChange={(event) =>
                void changeCanvasFormat(event.currentTarget.value)
              }
            >
              {canvasSettings.revision &&
                !CANVAS_FORMATS.some(
                  (format) =>
                    format.width === canvasSettings.width &&
                    format.height === canvasSettings.height,
                ) && (
                  <option value="custom" disabled>
                    Custom · {canvasSettings.width} × {canvasSettings.height}
                  </option>
                )}
              {CANVAS_FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
          <label className="transcription-source-control">
            Transcribe from
            <select
              aria-label="Transcription source"
              value={transcriptionSourceId}
              disabled={!transcriptionSources.length || transcribing}
              onChange={(event) =>
                setTranscriptionSourceId(event.currentTarget.value)
              }
            >
              {transcriptionSources.map((sourceOption) => (
                <option key={sourceOption.id} value={sourceOption.id}>
                  {sourceOption.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!doc} onClick={addText}>
            Add Text
          </button>
          <button
            type="button"
            onClick={() => void generateSubtitles()}
            disabled={
              !doc || !transcriptionSources.length || transcribing || built
            }
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
          <button
            type="button"
            onClick={() => setRightPanelTab("visual-context")}
            disabled={!doc || built}
            title="Capture the current Canvas frame and copy a context package for an AI coding request"
          >
            AI context
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
        <div className="editor-feedback">
          <details className="timeline-review">
            <summary>
              Timeline review:{" "}
              {visibleTimelineWarnings.length
                ? `${visibleTimelineWarnings.length} gap${visibleTimelineWarnings.length === 1 ? "" : "s"}`
                : "no visual gaps"}
            </summary>
            {visibleTimelineWarnings.length ? (
              <ul>
                {visibleTimelineWarnings.map((warning) => {
                  const seconds = (warning.end - warning.from) / manifest.fps;
                  const isLongGap = seconds >= 5;
                  const label =
                    warning.kind === "late"
                      ? `Late isolated visual content: starts at ${(warning.end / manifest.fps).toFixed(2)}s after ${seconds.toFixed(2)}s with no visual clips on any track.`
                      : warning.kind === "between"
                        ? `${isLongGap ? "Long empty visual interval" : "Empty visual interval"}: ${seconds.toFixed(2)}s from ${(warning.from / manifest.fps).toFixed(2)}s to ${(warning.end / manifest.fps).toFixed(2)}s across all tracks.`
                        : `Empty visual tail: ${seconds.toFixed(2)}s after the last visible clip on all tracks.`;
                  const targetIds = [
                    warning.previousClipId,
                    warning.nextClipId,
                  ].filter((id): id is string => Boolean(id));
                  return (
                    <li key={warningKey(warning)}>
                      <span>{label}</span>
                      {targetIds.map((id) => {
                        const target = doc?.clips.find(
                          (item) => item.id === id,
                        );
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
                      <button
                        type="button"
                        aria-label="Dismiss empty visual interval warning"
                        onClick={() =>
                          setDismissedTimelineWarnings((dismissed) =>
                            dismissed.includes(warningKey(warning))
                              ? dismissed
                              : [...dismissed, warningKey(warning)],
                          )
                        }
                      >
                        Dismiss
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No visual timeline gaps were found.</p>
            )}
          </details>
          {conflict && (
            <p className="error" role="alert">
              The project changed on disk while you were editing. Export your
              draft or reload from disk; saving is blocked to protect the
              agent’s changes.
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
        </div>
        <div
          className="editor-columns"
          style={
            {
              "--inspector-width": `${inspectorWidth}px`,
            } as React.CSSProperties
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
            masterVolume={masterVolume}
            onMasterVolumeChange={setMasterVolume}
            iframeRef={iframe}
            surfaceRef={canvasSurface}
            onPreviewLoad={() => {
              send("hello");
              send("playback-boundary", { endFrame: playbackEndFrame });
              send("master-volume", { volume: masterVolume });
            }}
            onSeek={seek}
            onPlay={() => playPreviewRef.current()}
            onPause={pause}
            timeline={doc}
            components={components}
            selectedClipIds={selectedIds}
            onSelectClips={(clipIds) => {
              sourceCommandId.current = null;
              sessionSelectClips(clipIds);
            }}
            onCanvasGestureStart={beginCanvasGesture}
            onCanvasDuplicate={duplicateCanvasClips}
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
            onDropMedia={(data, position) =>
              handleCanvasMediaDrop(data, position)
            }
            onClipContextMenu={(clipId, position) => {
              setSelected(clipId);
              setTextContextPopup({ clipId, position });
            }}
          />
          <button
            className="panel-splitter inspector-splitter"
            aria-label="Resize inspector"
            onPointerDown={(event) =>
              beginPanelResize(
                event,
                "inspector",
                event.clientX,
                inspectorWidth,
              )
            }
            onPointerMove={resizePanel}
            onPointerUp={endPanelResize}
          />
          <section className="right-editor-panel" aria-label="Editor tools">
            <div
              className="right-panel-tabs"
              role="tablist"
              aria-label="Right panel"
            >
              <button
                id="inspector-tab"
                type="button"
                role="tab"
                aria-selected={rightPanelTab === "inspector"}
                aria-controls="inspector-panel"
                onClick={() => setRightPanelTab("inspector")}
              >
                Inspector
              </button>
              <button
                id="visual-context-tab"
                type="button"
                role="tab"
                aria-selected={rightPanelTab === "visual-context"}
                aria-controls="visual-context-panel"
                onClick={() => setRightPanelTab("visual-context")}
              >
                AI visual context
              </button>
            </div>
            {rightPanelTab === "inspector" ? (
              <div
                id="inspector-panel"
                className="right-panel-content"
                role="tabpanel"
                aria-labelledby="inspector-tab"
              >
                <InspectorView
                  manifest={editorManifest}
                  document={doc}
                  clip={clip}
                  selectedCount={selectedIds.length}
                  definition={definition}
                  onEdit={(next) => {
                    const current = commands.getCurrentDocument();
                    if (current)
                      edit(typeof next === "function" ? next(current) : next);
                  }}
                  onChangeProperty={property}
                  onChangeRange={changeRange}
                  onDuplicate={duplicate}
                  onDelete={deleteClip}
                  onSeparateVideoAudio={separateVideoAudio}
                  canChangeRange={
                    clip
                      ? !selectedTrackLocked &&
                        canPerformTimelineOperation(clip, "move", components)
                      : false
                  }
                  canChangeTrack={clip ? !selectedTrackLocked : false}
                  canEditProperties={!selectedTrackLocked}
                  canDuplicate={
                    clip
                      ? !selectedTrackLocked &&
                        canPerformTimelineOperation(
                          clip,
                          "duplicate",
                          components,
                        )
                      : false
                  }
                  canDelete={
                    clip
                      ? !selectedTrackLocked &&
                        canPerformTimelineOperation(clip, "delete", components)
                      : false
                  }
                />
              </div>
            ) : (
              <section
                id="visual-context-panel"
                className="visual-context-panel right-panel-content"
                aria-label="AI visual context"
                role="tabpanel"
                aria-labelledby="visual-context-tab"
              >
                <div className="visual-context-heading">
                  <strong>Prepare context from this Canvas frame</strong>
                  <span>
                    Frame {frame} · {(frame / manifest.fps).toFixed(2)} s ·{" "}
                    {clip?.label ?? "No clip selected"}
                  </span>
                </div>
                <label htmlFor="visual-context-request">
                  What should change at this moment?
                </label>
                <textarea
                  id="visual-context-request"
                  value={visualRequest}
                  onChange={(event) =>
                    setVisualRequest(event.currentTarget.value)
                  }
                  maxLength={4000}
                  placeholder="For example: Change the tutorial sample caption to red at this moment."
                  rows={2}
                />
                <div className="visual-context-actions">
                  <button
                    type="button"
                    onClick={() => void prepareVisualContext()}
                    disabled={
                      visualContextBusy || !visualRequest.trim() || built
                    }
                  >
                    {visualContextBusy
                      ? "Preparing…"
                      : "Capture and copy for AI"}
                  </button>
                  <span role="status">{visualContextStatus}</span>
                </div>
                {visualContextPaths && (
                  <div className="visual-context-paths">
                    <div>
                      Screenshot: <code>{visualContextPaths.screenshot}</code>
                    </div>
                    <div>
                      Frame map: <code>{visualContextPaths.inspection}</code>
                    </div>
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
        <div
          className="timeline-location"
          data-timeline-detached={Boolean(detachedTimeline)}
        >
          {detachedTimeline ? (
            <div className="timeline-detached-placeholder" role="status">
              <strong>Timeline is open in its own window.</strong>
              <span>
                Canvas and Inspector remain connected to the same editing
                session.
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
                selectedClipId={selected}
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
                onClipContextMenu={(clipId, position) => {
                  setSelected(clipId);
                  setTextContextPopup({ clipId, position });
                }}
                onPause={pause}
                onPlay={() => playPreviewRef.current()}
                onDropMedia={(data, target) =>
                  handleTimelineMediaDrop(data, target)
                }
                onBeginClipGesture={beginClipGesture}
                onTimelineOperation={(operation) => {
                  const operationError = performTimelineOperation(operation);
                  if (operationError) setError(operationError);
                }}
                keyboardShortcutsEnabled={active}
                rippleMode={rippleMode}
                onRippleModeChange={setRippleMode}
                onUpdateClipGesture={updateClipGesture}
                onEndClipGesture={endClipGesture}
                onResizeStart={(event) => {
                  beginPanelResize(
                    event,
                    "timeline",
                    event.clientY,
                    timelineHeight,
                  );
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
    </>
  );
}
