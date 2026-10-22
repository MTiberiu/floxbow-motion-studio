import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PanelWindowContext,
  TimelineCommand,
  TimelineCommandEnvelope,
  TimelineCommandResult,
  TimelineFrame,
  TimelineSnapshot,
} from "../electron/window-contract.cjs";
import {
  componentInfosSchema,
  parseEditTimeline,
  type EditTimeline,
} from "@motion/sdk/timeline";
import {
  createSubtitleClip,
  exportSubtitles,
  importSubtitles,
  subtitleClips,
  subtitlesToLRC,
  subtitlesToSRT,
} from "@motion/lyrics-sync/subtitles";
import { TimelineView } from "./TimelineView";
import { subtitleTrackId } from "./timeline-track-utils";
import "./timeline.css";

type TimelineCommandIntent =
  TimelineCommand | ((snapshot: TimelineSnapshot) => TimelineCommand | null);

type SnapshotWaiter = {
  baseStateVersion: number;
  acknowledgedStateVersion: number;
  resolve: (confirmed: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DetachedTimelineWindow({
  context,
}: {
  context: PanelWindowContext;
}) {
  const bridge = window.floxBowWindows!;
  const [snapshot, setSnapshot] = useState<TimelineSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef<TimelineSnapshot | null>(null);
  latest.current = snapshot;
  const commandQueue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(
    new Map<string, (result: TimelineCommandResult) => void>(),
  );
  const snapshotWaiters = useRef(new Map<string, SnapshotWaiter>());
  const snapshotRequestTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sequence = useRef(context.commandSequence);
  const generation = useRef(0);
  const activeGestures = useRef(new Set<string>());
  const active = useRef(true);

  function requestSnapshot() {
    if (snapshotRequestTimeout.current)
      clearTimeout(snapshotRequestTimeout.current);
    setError("Waiting for the current editor snapshot…");
    snapshotRequestTimeout.current = setTimeout(() => {
      snapshotRequestTimeout.current = null;
      if (active.current)
        setError(
          "The editor snapshot did not arrive. Retry synchronization or attach Timeline.",
        );
    }, 3000);
    void bridge.requestTimelineSnapshot().catch((requestError: unknown) => {
      if (snapshotRequestTimeout.current)
        clearTimeout(snapshotRequestTimeout.current);
      snapshotRequestTimeout.current = null;
      if (active.current)
        setError(
          `Could not request the editor snapshot: ${String(requestError)}`,
        );
    });
  }

  useEffect(() => {
    active.current = true;
    const unsubscribeSnapshot = bridge.onTimelineSnapshot((received) => {
      if (
        !isSnapshotValue(received) ||
        received.projectId !== context.projectId ||
        received.sessionId !== context.sessionId ||
        received.instanceId !== context.instanceId
      )
        return;
      const previous = latest.current;
      if (previous && received.stateVersion < previous.stateVersion) return;
      if (
        previous &&
        received.stateVersion > previous.stateVersion &&
        activeGestures.current.size > 0 &&
        !isOwnCommandId(
          received.sourceCommandId,
          context.instanceId,
          sequence.current,
        )
      ) {
        activeGestures.current.clear();
        generation.current += 1;
        setError(
          "The editor changed during the drag. The Timeline was refreshed; try the drag again.",
        );
      }
      try {
        if (received.document !== null)
          parseEditTimeline(received.document, {
            fps: received.fps,
            durationInFrames: received.durationInFrames,
          });
        componentInfosSchema.parse(received.components);
      } catch (parseError) {
        setError(
          `The editor sent an invalid Timeline snapshot: ${String(parseError)}`,
        );
        return;
      }
      latest.current = received;
      setSnapshot(received);
      if (snapshotRequestTimeout.current) {
        clearTimeout(snapshotRequestTimeout.current);
        snapshotRequestTimeout.current = null;
      }
      for (const [commandId, waiter] of snapshotWaiters.current) {
        const confirmsCommand =
          received.stateVersion >= waiter.acknowledgedStateVersion &&
          (received.sourceCommandId === commandId ||
            received.stateVersion > waiter.baseStateVersion);
        if (!confirmsCommand) continue;
        clearTimeout(waiter.timeout);
        snapshotWaiters.current.delete(commandId);
        waiter.resolve(true);
      }
      if (received.stateVersion >= (previous?.stateVersion ?? 0)) setError("");
    });
    const unsubscribeResult = bridge.onTimelineCommandResult((result) => {
      const resolve = pending.current.get(result.commandId);
      if (!resolve) return;
      pending.current.delete(result.commandId);
      resolve(result);
    });
    const unsubscribeFrame = bridge.onTimelineFrame((frame: TimelineFrame) => {
      const current = latest.current;
      if (
        !current ||
        !isFrameValue(frame) ||
        frame.projectId !== context.projectId ||
        frame.sessionId !== context.sessionId ||
        frame.instanceId !== context.instanceId ||
        frame.stateVersion < current.stateVersion ||
        frame.frame >= current.durationInFrames
      )
        return;
      const updated = {
        ...current,
        frame: frame.frame,
        playing: frame.playing,
      };
      latest.current = updated;
      setSnapshot(updated);
    });
    requestSnapshot();
    return () => {
      active.current = false;
      unsubscribeSnapshot();
      unsubscribeResult();
      unsubscribeFrame();
      if (snapshotRequestTimeout.current) {
        clearTimeout(snapshotRequestTimeout.current);
        snapshotRequestTimeout.current = null;
      }
      for (const resolve of pending.current.values())
        resolve({
          panelId: "timeline",
          projectId: context.projectId,
          sessionId: context.sessionId,
          instanceId: context.instanceId,
          commandId: `${context.instanceId}:1`,
          status: "rejected",
          stateVersion: latest.current?.stateVersion ?? 0,
          message: "Timeline window closed before the command completed.",
        });
      pending.current.clear();
      for (const waiter of snapshotWaiters.current.values()) {
        clearTimeout(waiter.timeout);
        waiter.resolve(false);
      }
      snapshotWaiters.current.clear();
    };
  }, [bridge, context.instanceId, context.projectId, context.sessionId]);

  function waitForAuthoritativeSnapshot(
    commandId: string,
    baseStateVersion: number,
    acknowledgedStateVersion: number,
  ) {
    const confirmsCommand = (current: TimelineSnapshot | null) =>
      Boolean(
        current &&
        current.stateVersion >= acknowledgedStateVersion &&
        (current.sourceCommandId === commandId ||
          current.stateVersion > baseStateVersion),
      );
    if (confirmsCommand(latest.current)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        snapshotWaiters.current.delete(commandId);
        resolve(false);
      }, 10000);
      snapshotWaiters.current.set(commandId, {
        baseStateVersion,
        acknowledgedStateVersion,
        resolve,
        timeout,
      });
    });
  }

  function dispatch(intent: TimelineCommandIntent) {
    const requestedGeneration = generation.current;
    const operation = commandQueue.current.then(async () => {
      if (requestedGeneration !== generation.current) return;
      const current = latest.current;
      if (!current) {
        setError(
          "Waiting for the authoritative editor snapshot. Retry after it arrives.",
        );
        return;
      }
      const command = typeof intent === "function" ? intent(current) : intent;
      if (!command) return;
      sequence.current += 1;
      const commandId = `${context.instanceId}:${sequence.current}`;
      const envelope: TimelineCommandEnvelope = {
        panelId: "timeline",
        projectId: context.projectId,
        sessionId: context.sessionId,
        instanceId: context.instanceId,
        commandId,
        stateVersion: current.stateVersion,
        command,
      };
      setBusy(true);
      const resultPromise = new Promise<TimelineCommandResult>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            pending.current.delete(commandId);
            reject(
              new Error("The editor did not confirm this Timeline command."),
            );
          }, 10000);
          pending.current.set(commandId, (result) => {
            clearTimeout(timeout);
            resolve(result);
          });
        },
      );
      try {
        await bridge.sendTimelineCommand(envelope);
        const result = await resultPromise;
        if (requestedGeneration !== generation.current) return;
        if (result.status === "rejected") {
          setError(
            result.message || "The editor rejected this Timeline command.",
          );
          activeGestures.current.clear();
          generation.current += 1;
          void bridge.requestTimelineSnapshot();
          return;
        }
        // An ACK confirms the command, not the child’s document snapshot.
        const confirmed =
          (command.type === "copy" || command.type === "endClipGesture") &&
          result.stateVersion === current.stateVersion
            ? true
            : await waitForAuthoritativeSnapshot(
                commandId,
                current.stateVersion,
                result.stateVersion,
              );
        if (!confirmed)
          throw new Error(
            "The editor accepted the command but its authoritative Timeline snapshot did not arrive.",
          );
        if (command.type === "beginClipGesture")
          activeGestures.current.add(command.gestureId);
        if (command.type === "endClipGesture")
          activeGestures.current.delete(command.gestureId);
        setError("");
      } catch (commandError) {
        pending.current.delete(commandId);
        setError(
          `Timeline command failed: ${String(commandError)}. Attach or retry synchronization.`,
        );
        generation.current += 1;
        void bridge.requestTimelineSnapshot();
      } finally {
        setBusy(false);
      }
    });
    commandQueue.current = operation.catch(() => undefined);
  }

  const manifest = useMemo(
    () =>
      snapshot && {
        id: snapshot.projectId,
        fps: snapshot.fps,
        durationInFrames: snapshot.durationInFrames,
        ...(snapshot.hasEditableTimeline
          ? { editTimeline: "edit-timeline.json" }
          : {}),
      },
    [snapshot],
  );
  const document = snapshot?.document
    ? parseEditTimeline(snapshot.document, {
        fps: snapshot.fps,
        durationInFrames: snapshot.durationInFrames,
      })
    : undefined;
  const components = useMemo(() => {
    try {
      return componentInfosSchema.parse(snapshot?.components ?? []);
    } catch {
      return [];
    }
  }, [snapshot?.components]);

  function addSubtitle() {
    if (!document || !snapshot) return;
    const clipId = `subtitle-${crypto.randomUUID()}`;
    dispatch((currentSnapshot) => {
      const currentDocument = currentSnapshot.document
        ? parseEditTimeline(currentSnapshot.document, {
            fps: currentSnapshot.fps,
            durationInFrames: currentSnapshot.durationInFrames,
          })
        : null;
      if (!currentDocument) return null;
      const selected = currentDocument.clips.find(
        (clip) => clip.id === currentSnapshot.selectedClipId,
      );
      const clip = createSubtitleClip({
        id: clipId,
        trackId: subtitleTrackId(currentDocument, selected?.trackId),
        from: currentSnapshot.frame,
        durationInFrames: Math.max(
          1,
          Math.min(
            currentDocument.fps * 2,
            currentDocument.durationInFrames - currentSnapshot.frame,
          ),
        ),
        content: { text: "New subtitle", status: "unverified" },
      });
      return {
        type: "editTimeline",
        document: {
          ...currentDocument,
          clips: [...currentDocument.clips, clip],
        },
        checkpoint: true,
      };
    });
    dispatch({ type: "selectClip", clipId });
  }

  async function importFile(file: File | undefined) {
    if (!file || !document || !snapshot) return;
    try {
      const text = await file.text();
      if (file.name.endsWith(".timeline.json")) {
        dispatch({
          type: "editTimeline",
          document: parseEditTimeline(JSON.parse(text), {
            fps: snapshot.fps,
            durationInFrames: snapshot.durationInFrames,
          }),
          checkpoint: true,
        });
        return;
      }
      const format = file.name.toLowerCase().endsWith(".srt")
        ? "srt"
        : file.name.toLowerCase().endsWith(".lrc")
          ? "lrc"
          : "json";
      const timing = importSubtitles(
        text,
        format,
        document.durationInFrames / document.fps,
      );
      if (!components.some((component) => component.id === "subtitles"))
        throw new Error(
          "This project must register subtitleModule before importing subtitles.",
        );
      dispatch((currentSnapshot) => {
        const currentDocument = currentSnapshot.document
          ? parseEditTimeline(currentSnapshot.document, {
              fps: currentSnapshot.fps,
              durationInFrames: currentSnapshot.durationInFrames,
            })
          : null;
        if (!currentDocument) return null;
        const existing = currentDocument.clips.find(
          (clip) => clip.componentId === "subtitles",
        );
        const generated = subtitleClips(
          timing,
          currentDocument,
          subtitleTrackId(currentDocument, existing?.trackId),
          existing?.props ?? {},
        );
        return {
          type: "editTimeline",
          document: parseEditTimeline({
            ...currentDocument,
            clips: [
              ...currentDocument.clips.filter(
                (clip) => clip.componentId !== "subtitles",
              ),
              ...generated,
            ],
          }),
          checkpoint: true,
        };
      });
      if (timing.segments[0])
        dispatch({ type: "selectClip", clipId: timing.segments[0].id });
    } catch (importError) {
      setError(`Subtitle import failed: ${String(importError)}`);
    }
  }

  function exportTiming(format: "json" | "srt" | "lrc") {
    if (!document || !snapshot) return;
    try {
      const timing = exportSubtitles(document);
      download(
        `${snapshot.projectId}.subtitles.${format}`,
        format === "json"
          ? JSON.stringify(timing, null, 2)
          : format === "srt"
            ? subtitlesToSRT(timing)
            : subtitlesToLRC(timing),
      );
    } catch (exportError) {
      setError(`Subtitle export failed: ${String(exportError)}`);
    }
  }

  if (!snapshot || !manifest)
    return (
      <main
        className="panel-window-placeholder"
        data-panel-window="timeline"
        aria-busy="true"
      >
        <h1>Connecting Timeline…</h1>
        <p>{error || "Requesting the current editor snapshot."}</p>
        <div className="detached-timeline-actions">
          <button type="button" onClick={requestSnapshot}>
            Retry sync
          </button>
          <button type="button" onClick={() => void bridge.closePanel()}>
            Attach Timeline
          </button>
        </div>
      </main>
    );

  return (
    <main
      className="detached-timeline-window"
      data-panel-window="timeline"
      data-editor-session-id={snapshot.sessionId}
      data-state-version={snapshot.stateVersion}
    >
      <header className="detached-timeline-toolbar">
        <div>
          <strong>Timeline</strong>
          <span>
            {snapshot.dirty ? "Unsaved edits in main editor" : "Saved"}
            {snapshot.conflict ? " · Revision conflict" : ""}
          </span>
        </div>
        <div className="detached-timeline-actions">
          <button
            type="button"
            onClick={() => dispatch({ type: "undo" })}
            disabled={busy || !snapshot.undoCount}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "redo" })}
            disabled={busy || !snapshot.redoCount}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => void bridge.closePanel()}
            disabled={busy}
          >
            Attach Timeline
          </button>
        </div>
      </header>
      {error && (
        <p className="error detached-timeline-error" role="alert">
          {error}{" "}
          <button type="button" onClick={requestSnapshot}>
            Retry sync
          </button>
        </p>
      )}
      <TimelineView
        manifest={manifest}
        document={document}
        components={components}
        selectedClipId={snapshot.selectedClipId}
        frame={snapshot.frame}
        playing={snapshot.playing}
        onEdit={(next, checkpoint = true) =>
          dispatch((currentSnapshot) => {
            const currentDocument = currentSnapshot.document
              ? parseEditTimeline(currentSnapshot.document, {
                  fps: currentSnapshot.fps,
                  durationInFrames: currentSnapshot.durationInFrames,
                })
              : null;
            if (!currentDocument) return null;
            return {
              type: "editTimeline",
              document:
                typeof next === "function" ? next(currentDocument) : next,
              checkpoint,
            };
          })
        }
        onSelectClip={(clipId) => dispatch({ type: "selectClip", clipId })}
        onSeek={(frame) => dispatch({ type: "seek", frame: Math.round(frame) })}
        onPause={() => dispatch({ type: "pause" })}
        onPlay={() => dispatch({ type: "play" })}
        onBeginClipGesture={(gestureId, clipId, duplicateId) => {
          activeGestures.current.add(gestureId);
          dispatch({
            type: "beginClipGesture",
            gestureId,
            clipId,
            ...(duplicateId ? { duplicateId } : {}),
          });
        }}
        onTimelineOperation={(operation) => {
          if (operation === "playPause")
            dispatch({ type: snapshot.playing ? "pause" : "play" });
          else dispatch({ type: operation });
        }}
        onUpdateClipGesture={(
          gestureId,
          clipId,
          from,
          durationInFrames,
          trim,
        ) => {
          if (!activeGestures.current.has(gestureId)) return;
          dispatch({
            type: "updateClipGesture",
            gestureId,
            clipId,
            from,
            durationInFrames,
            trim,
          });
        }}
        onEndClipGesture={(gestureId) =>
          dispatch({ type: "endClipGesture", gestureId })
        }
        onResizeStart={() => undefined}
        onResizeMove={() => undefined}
        onResizeEnd={() => undefined}
        onAddSubtitle={addSubtitle}
        onImportFile={(file) => void importFile(file)}
        onExportTiming={exportTiming}
        onExportDocument={() =>
          document &&
          download(
            `${snapshot.projectId}.timeline.json`,
            JSON.stringify(document, null, 2),
          )
        }
      />
    </main>
  );
}

function isSnapshotValue(value: unknown): value is TimelineSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<TimelineSnapshot>;
  return (
    snapshot.panelId === "timeline" &&
    typeof snapshot.projectId === "string" &&
    typeof snapshot.sessionId === "string" &&
    typeof snapshot.instanceId === "string" &&
    Number.isSafeInteger(snapshot.stateVersion) &&
    typeof snapshot.fps === "number" &&
    typeof snapshot.durationInFrames === "number" &&
    typeof snapshot.hasEditableTimeline === "boolean" &&
    (snapshot.document === null || typeof snapshot.document === "object") &&
    Array.isArray(snapshot.components) &&
    typeof snapshot.selectedClipId === "string" &&
    typeof snapshot.frame === "number" &&
    typeof snapshot.playing === "boolean" &&
    typeof snapshot.dirty === "boolean" &&
    typeof snapshot.conflict === "boolean" &&
    typeof snapshot.undoCount === "number" &&
    typeof snapshot.redoCount === "number"
  );
}

function isFrameValue(value: unknown): value is TimelineFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<TimelineFrame>;
  return (
    frame.panelId === "timeline" &&
    typeof frame.projectId === "string" &&
    typeof frame.sessionId === "string" &&
    typeof frame.instanceId === "string" &&
    Number.isSafeInteger(frame.stateVersion) &&
    Number.isInteger(frame.frame) &&
    typeof frame.playing === "boolean"
  );
}

function isOwnCommandId(
  sourceCommandId: string | null,
  instanceId: string,
  sequence: number,
) {
  if (!sourceCommandId || !sourceCommandId.startsWith(`${instanceId}:`))
    return false;
  const value = Number(sourceCommandId.slice(instanceId.length + 1));
  return Number.isInteger(value) && value > 0 && value <= sequence;
}
