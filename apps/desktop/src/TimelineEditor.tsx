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
    edit,
    selectClip: setSelected,
    seek,
    save,
    reloadFromDisk: reloadDisk,
    play,
    pause,
    undo,
    redo,
    checkpoint,
    receivePreviewMessage,
    setError,
    setNotice,
  } = commands;
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
      <TimelineView
        manifest={manifest}
        document={doc}
        components={components}
        selectedClipId={selected}
        frame={frame}
        onEdit={edit}
        onSelectClip={setSelected}
        onSeek={seek}
        onPause={pause}
        onCheckpoint={checkpoint}
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
    </section>
  );
}