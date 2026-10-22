import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
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
import { CanvasView } from "./CanvasView";
import { TimelineView } from "./TimelineView";
import { InspectorView } from "./InspectorView";
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
  const clipGesture = useRef<{
    gestureId: string;
    clipId: string;
    baseline: EditTimeline;
    expectedVersion: number;
  } | undefined>(undefined);
  const workspace = useWorkspaceManager();
  const detachedTimeline = workspace.detachedTimeline;
  const [timelineTransportError, setTimelineTransportError] = useState("");
  const { snapshot, commands } = session;
  const {
    document: doc,
    dirty,
    components,
    selectedClipId: selected,
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
  const edit = (next: EditTimeline, createCheckpoint = true) => {
    sourceCommandId.current = null;
    sessionEdit(next, createCheckpoint);
  };
  const setSelected = (clipId: string) => {
    sourceCommandId.current = null;
    sessionSelectClip(clipId);
  };
  const seek = (nextFrame: number) => {
    sourceCommandId.current = null;
    sessionSeek(nextFrame);
  };
  const pause = () => {
    sourceCommandId.current = null;
    sessionPause();
  };
  const checkpoint = () => {
    sourceCommandId.current = null;
    sessionCheckpoint();
  };
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

  const timelineSnapshot = (identity: NonNullable<typeof detachedTimeline>): TimelineSnapshot => ({
    panelId: "timeline",
    projectId: snapshot.projectId,
    sessionId: snapshot.sessionId,
    instanceId: identity.instanceId,
    stateVersion: snapshot.stateVersion,
    sourceCommandId: sourceCommandId.current,
    fps: manifest.fps,
    durationInFrames: manifest.durationInFrames,
    hasEditableTimeline: Boolean(manifest.editTimeline),
    document: snapshot.document ?? null,
    components,
    selectedClipId: selected,
    frame,
    playing,
    dirty,
    conflict,
    undoCount: snapshot.undoCount,
    redoCount: snapshot.redoCount,
  });

  async function publishTimelineSnapshot(identity: NonNullable<typeof detachedTimeline>) {
    const bridge = window.floxBowWindows;
    if (!bridge) throw new Error("Native Timeline transport is unavailable.");
    const result = await bridge.publishTimelineSnapshot(timelineSnapshot(identity));
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
        ?.closePanel({ panelId: "timeline", instanceId: detachedTimeline.instanceId })
        .catch(() => workspace.clearDetachedTimeline(detachedTimeline.instanceId));
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
    if (!detachedTimeline || !window.floxBowWindows) return;
    void window.floxBowWindows.publishTimelineFrame({
      panelId: "timeline",
      projectId: snapshot.projectId,
      sessionId: snapshot.sessionId,
      instanceId: detachedTimeline.instanceId,
      stateVersion: snapshot.stateVersion,
      frame,
      playing,
    }).catch((error: unknown) => setTimelineTransportError(String(error)));
  }, [detachedTimeline?.instanceId, snapshot.projectId, snapshot.sessionId, snapshot.stateVersion, frame, playing]);

  useEffect(() => {
    const bridge = window.floxBowWindows;
    if (!bridge) return;
    return bridge.onTimelineSnapshotRequest((request) => {
      if (
        detachedTimeline?.instanceId !== request.instanceId ||
        snapshot.projectId !== request.projectId ||
        snapshot.sessionId !== request.sessionId
      ) return;
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
          ) throw new Error("This Timeline command belongs to an old project session.");
          if (envelope.stateVersion !== commands.getStateVersion())
            throw new Error("Timeline changed elsewhere. The view was refreshed.");
          const current = commands.getCurrentDocument();
          const command = envelope.command;
          if (clipGesture.current && !["updateClipGesture", "endClipGesture"].includes(command.type))
            throw new Error("Finish the active clip drag before sending another edit.");
          if (command.type === "selectClip") {
            if (command.clipId && !current?.clips.some((clip) => clip.id === command.clipId))
              throw new Error("The selected clip no longer exists.");
            sourceCommandId.current = envelope.commandId;
            sessionSelectClip(command.clipId);
          } else if (command.type === "seek") {
            if (!current || command.frame >= current.durationInFrames)
              throw new Error("The requested playhead frame is outside this project.");
            sourceCommandId.current = envelope.commandId;
            sessionSeek(command.frame);
          } else if (command.type === "pause") {
            sourceCommandId.current = envelope.commandId;
            sessionPause();
          } else if (command.type === "editTimeline") {
            if (clipGesture.current) throw new Error("A clip drag is still active.");
            const validated = parseEditTimeline(command.document, manifest);
            sourceCommandId.current = envelope.commandId;
            sessionEdit(validated, command.checkpoint);
          } else if (command.type === "beginClipGesture") {
            if (!current?.clips.some((clip) => clip.id === command.clipId))
              throw new Error("The clip being dragged no longer exists.");
            sourceCommandId.current = envelope.commandId;
            sessionCheckpoint();
            clipGesture.current = {
              gestureId: command.gestureId,
              clipId: command.clipId,
              baseline: structuredClone(current),
              expectedVersion: commands.getStateVersion(),
            };
          } else if (command.type === "updateClipGesture") {
            const gesture = clipGesture.current;
            if (!gesture || gesture.gestureId !== command.gestureId || gesture.clipId !== command.clipId)
              throw new Error("The clip drag is no longer active. The Timeline was refreshed.");
            if (gesture.expectedVersion !== commands.getStateVersion()) {
              clipGesture.current = undefined;
              throw new Error("The clip changed during the drag. The drag was canceled safely.");
            }
            const clip = gesture.baseline.clips.find((item) => item.id === command.clipId);
            if (!clip || command.from + command.durationInFrames > gesture.baseline.durationInFrames)
              throw new Error("The clip range is outside the project.");
            const next = changeClipRange(
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
            if (!snapshot.undoCount) throw new Error("There is no edit to undo.");
            sourceCommandId.current = envelope.commandId;
            undo();
          } else if (command.type === "redo") {
            if (!snapshot.redoCount) throw new Error("There is no edit to redo.");
            sourceCommandId.current = envelope.commandId;
            redo();
          }
          resultStatus = "accepted";
          resultMessage = "";
          resultVersion = commands.getStateVersion();
        } catch (error) {
          resultMessage = String(error).slice(0, 300);
          if (resultMessage.includes("refreshed") || resultMessage.includes("changed"))
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
          if (resultStatus === "rejected") await publishTimelineSnapshot(detachedTimeline);
        } catch (error) {
          setTimelineTransportError(`Timeline command response failed: ${String(error)}`);
        }
      })();
    });
  }, [detachedTimeline?.instanceId, snapshot.projectId, snapshot.sessionId, snapshot.undoCount, snapshot.redoCount, manifest]);
  function property(field: EditableField, value: unknown) {
    if (!doc) return;
    try {
      const next = structuredClone(doc);
      const c = next.clips.find((c) => c.id === selected)!;
      const validated = validateField(field, value);
      const behavior = resolveTimelineBehavior(c.componentId, components);
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
        const next = parseEditTimeline(JSON.parse(text), manifest);
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
      const trackId = existing?.trackId ?? doc.tracks.at(-1)!.id;
      const imported = subtitleClips(data, doc, trackId, existing?.props ?? {});
      if (!components.some((c) => c.id === "subtitles"))
        throw new Error(
          "The project must register subtitleModule before importing subtitles.",
        );
      const next = {
        ...doc,
        clips: [
          ...doc.clips.filter((c) => c.componentId !== "subtitles"),
          ...imported,
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
    edit({ ...doc, clips: doc.clips.filter((item) => item.id !== clip.id) });
    setSelected("");
  }
  function addSubtitle() {
    if (!doc) return;
    const trackId = clip?.trackId ?? doc.tracks.at(-1)!.id;
    const c = createSubtitleClip({
      id: `subtitle-${crypto.randomUUID()}`,
      trackId,
      from: frame,
      durationInFrames: Math.min(doc.fps * 2, doc.durationInFrames - frame),
      content: { text: "New subtitle", status: "unverified" },
    });
    edit({ ...doc, clips: [...doc.clips, c] });
    setSelected(c.id);
  }
  function duplicate() {
    if (!doc || !clip) return;
    const copy = structuredClone(clip);
    copy.id = `clip-${crypto.randomUUID()}`;
    copy.from = Math.min(
      doc.durationInFrames - copy.durationInFrames,
      copy.from + copy.durationInFrames,
    );
    copy.label = clip.label + " (repeat)";
    const duplicateContent = resolveTimelineBehavior(
      clip.componentId,
      components,
    ).duplicateContent;
    if (duplicateContent)
      copy.content = duplicateContent(clip.content, clip.id);
    edit({ ...doc, clips: [...doc.clips, copy] });
    setSelected(copy.id);
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
  function beginClipGesture(gestureId: string, clipId: string) {
    const baseline = commands.getCurrentDocument();
    if (!baseline?.clips.some((item) => item.id === clipId)) return;
    checkpoint();
    clipGesture.current = {
      gestureId,
      clipId,
      baseline: structuredClone(baseline),
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
    if (!gesture || gesture.gestureId !== gestureId || gesture.clipId !== clipId)
      return;
    if (gesture.expectedVersion !== commands.getStateVersion()) {
      clipGesture.current = undefined;
      setNotice("The clip changed during the drag. The drag was canceled safely.");
      return;
    }
    const clipToChange = gesture.baseline.clips.find((item) => item.id === clipId);
    if (!clipToChange) return;
    try {
      edit(
        changeClipRange(
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
      setTimelineTransportError("Timeline detachment is available in the Electron app.");
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
      className="timeline-editor"
      data-editor-session-id={snapshot.sessionId}
      style={
        { "--timeline-height": `${timelineHeight}px` } as React.CSSProperties
      }
    >
      <div className="editor-toolbar">
        <button disabled={!dirty || saving || conflict} onClick={save}>
          Save project
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
      </div>
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
        style={{ "--inspector-width": `${inspectorWidth}px` } as React.CSSProperties}
      >
        <CanvasView
          manifest={manifest}
          previewOrigin={previewOrigin}
          built={built}
          reload={reload}
          previewGeneration={previewGeneration}
          frame={frame}
          playing={playing}
          iframeRef={iframe}
          onPreviewLoad={() => send("hello")}
          onSeek={seek}
          onPlay={play}
          onPause={pause}
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
          manifest={manifest}
          document={doc}
          clip={clip}
          definition={definition}
          onEdit={edit}
          onChangeProperty={property}
          onChangeRange={changeRange}
          onDuplicate={duplicate}
          onDelete={deleteClip}
        />
      </div>
      <div className="timeline-location" data-timeline-detached={Boolean(detachedTimeline)}>
        {detachedTimeline ? (
          <div className="timeline-detached-placeholder" role="status">
            <strong>Timeline is open in its own window.</strong>
            <span>Canvas and Inspector remain connected to the same editing session.</span>
            {timelineTransportError && <span className="error" role="alert">{timelineTransportError}</span>}
            <div>
              <button type="button" onClick={attachTimeline}>Attach Timeline</button>
              <button type="button" onClick={() => void publishTimelineSnapshot(detachedTimeline).then(() => setTimelineTransportError("")).catch((error: unknown) => setTimelineTransportError(String(error)))}>Retry sync</button>
            </div>
          </div>
        ) : (
          <>
            <div className="timeline-window-actions">
              <button type="button" onClick={() => void detachTimeline()}>Detach Timeline</button>
              {timelineTransportError && <span className="error" role="alert">{timelineTransportError}</span>}
            </div>
            <TimelineView
        manifest={manifest}
        document={doc}
        components={components}
        selectedClipId={selected}
        frame={frame}
        onEdit={(next, createCheckpoint = true) => {
          const current = commands.getCurrentDocument();
          if (!current) return;
          edit(
            typeof next === "function" ? next(current) : next,
            createCheckpoint,
          );
        }}
        onSelectClip={setSelected}
        onSeek={seek}
        onPause={pause}
        onBeginClipGesture={beginClipGesture}
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
