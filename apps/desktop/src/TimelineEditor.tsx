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
  componentInfosSchema,
  fieldValue,
  validateField,
  type EditTimeline,
  type TimelineClip,
  type ComponentInfo,
  type EditableField,
} from "@motion/sdk/timeline";
import { resolveTimelineBehavior } from "./timeline-behaviors";
import {
  exportSubtitles,
  createSubtitleClip,
  importSubtitles,
  subtitleClips,
  subtitleWordTimingMatchesText,
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
type Disk = { timeline: EditTimeline; revision: string };
type Drag = {
  clip: TimelineClip;
  mode: "move" | "left" | "right";
  x: number;
  timeline: EditTimeline;
  pixels: number;
  scrollLeft: number;
};
export function TimelineEditor({
  manifest,
  previewOrigin,
  built,
  reload,
  requestPreviewReload,
}: {
  manifest: ProjectManifest;
  previewOrigin: string;
  built: boolean;
  reload: number;
  requestPreviewReload: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const canvasViewport = useRef<HTMLDivElement>(null);
  const timelineScroll = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<EditTimeline>();
  const docRef = useRef(doc);
  docRef.current = doc;
  const [revision, setRevision] = useState("");
  const revisionRef = useRef("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [selected, setSelected] = useState("");
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(
    Math.min(manifest.fps * 2, manifest.durationInFrames - 1),
  );
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<EditTimeline[]>([]);
  const [redo, setRedo] = useState<EditTimeline[]>([]);
  const [zoom, setZoom] = useState(1);
  const [inspectorWidth, setInspectorWidth] = useState(
    () => Number(localStorage.getItem("motion-inspector-width")) || 270,
  );
  const [timelineHeight, setTimelineHeight] = useState(
    () => Number(localStorage.getItem("motion-timeline-height")) || 280,
  );
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(900);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasScale, setCanvasScale] = useState<number | null>(null);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panelResize = useRef<
    { kind: "inspector" | "timeline"; start: number; size: number } | undefined
  >(undefined);
  const canvasDrag = useRef<
    { x: number; y: number; panX: number; panY: number } | undefined
  >(undefined);
  const spaceRef = useRef(false);
  const drag = useRef<Drag | undefined>(undefined);
  const ruler = useRef<HTMLDivElement>(null);
  const draftKey = `motion-draft-v1:${manifest.id}`;
  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      return iframe.current?.contentWindow?.postMessage(
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
  const setClean = (disk: Disk, refreshPreview = false) => {
    docRef.current = disk.timeline;
    setDoc(disk.timeline);
    send("document", { timeline: disk.timeline });
    if (refreshPreview) requestPreviewReload();
    revisionRef.current = disk.revision;
    setRevision(disk.revision);
    dirtyRef.current = false;
    setDirty(false);
    setConflict(false);
    setError("");
    localStorage.removeItem(draftKey);
    setUndo([]);
    setRedo([]);
  };
  useEffect(() => {
    if (!manifest.editTimeline) return;
    let active = true;
    const read = async (initial = false) => {
      try {
        const r = await fetch(`/api/edit/${manifest.id}`);
        if (!r.ok) throw new Error(await r.text());
        const disk: Disk = await r.json();
        disk.timeline = parseEditTimeline(disk.timeline, manifest);
        if (!active) return;
        if (initial) {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            try {
              const draft = JSON.parse(raw);
              const t = parseEditTimeline(draft.timeline, manifest);
              docRef.current = t;
              setDoc(t);
              revisionRef.current = draft.revision;
              setRevision(draft.revision);
              dirtyRef.current = true;
              setDirty(true);
              setConflict(draft.revision !== disk.revision);
              setNotice("Restored your unsaved draft.");
              return;
            } catch {
              localStorage.removeItem(draftKey);
            }
          }
          setClean(disk);
        } else if (disk.revision !== revisionRef.current) {
          if (dirtyRef.current) {
            setConflict(true);
          } else {
            setClean(disk, true);
            setNotice("Updated from project files.");
          }
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    read(true);
    const timer = setInterval(() => read(), 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [manifest.id, manifest.editTimeline]);
  useEffect(() => {
    const canvas = canvasViewport.current;
    const timeline = timelineScroll.current;
    if (canvas) {
      const observer = new ResizeObserver(([entry]) =>
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        }),
      );
      observer.observe(canvas);
      return () => observer.disconnect();
    }
    return;
  }, []);
  useEffect(() => {
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canvasFullscreen)
        setCanvasFullscreen(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [canvasFullscreen]);
  useEffect(() => {
    const element = timelineScroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setTimelineViewportWidth(entry.contentRect.width),
    );
    observer.observe(element);
    setTimelineViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.code === "Space" &&
        target &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
        canvasDrag.current = undefined;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.source !== iframe.current?.contentWindow ||
        e.origin !== previewOrigin ||
        e.data?.channel !== "motion-editor-v1" ||
        e.data.projectId !== manifest.id
      )
        return;
      if (e.data.type === "ready") {
        try {
          setComponents(componentInfosSchema.parse(e.data.components));
          if (docRef.current) send("document", { timeline: docRef.current });
          send("seek", { frame: frameRef.current });
        } catch (e) {
          setError(String(e));
        }
      }
      if (
        e.data.type === "frame" &&
        Number.isInteger(e.data.frame) &&
        e.data.frame >= 0 &&
        e.data.frame < manifest.durationInFrames
      ) {
        setFrame(e.data.frame);
        frameRef.current = e.data.frame;
        setPlaying(e.data.playing === true);
      }
      if (e.data.type === "error") setError(String(e.data.message));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [previewOrigin, manifest.id, send]);
  useEffect(() => {
    if (doc) {
      if (dirty)
        try {
          localStorage.setItem(
            draftKey,
            JSON.stringify({ timeline: doc, revision }),
          );
        } catch {
          setError(
            "Draft storage is full. Save the project or export your timeline.",
          );
        }
    }
  }, [doc, dirty, revision]);
  function edit(next: EditTimeline, checkpoint = true) {
    try {
      parseEditTimeline(next, manifest);
      if (checkpoint && docRef.current) {
        setUndo((h) => [...h.slice(-49), structuredClone(docRef.current!)]);
        setRedo([]);
      }
      docRef.current = next;
      setDoc(next);
      send("document", { timeline: next });
      dirtyRef.current = true;
      setDirty(true);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  function seek(f: number) {
    const value = Math.max(
      0,
      Math.min(manifest.durationInFrames - 1, Math.round(f)),
    );
    setFrame(value);
    frameRef.current = value;
    send("seek", { frame: value });
  }
  async function save() {
    if (!doc) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/edit/${manifest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: doc, revision }),
      });
      if (!r.ok) throw new Error(await r.text());
      const disk: Disk = await r.json();
      setClean(disk);
      setNotice("Saved to the project. Renders use these edits.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function reloadDisk() {
    try {
      const r = await fetch(`/api/edit/${manifest.id}`);
      if (!r.ok) throw new Error(await r.text());
      setClean(await r.json(), true);
      setNotice("Loaded the file on disk.");
    } catch (e) {
      setError(String(e));
    }
  }
  function property(field: EditableField, value: unknown) {
    if (!doc) return;
    try {
      const next = structuredClone(doc);
      const c = next.clips.find((c) => c.id === selected)!;
      const validated = validateField(field, value);
      const behavior = resolveTimelineBehavior(c.componentId, components);
      const behaviorEdit = field.target === "content"
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
  function begin(e: ReactPointerEvent, clip: TimelineClip, mode: Drag["mode"]) {
    if (!doc || !ruler.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(clip.id);
    send("pause");
    setUndo((h) => [...h.slice(-49), structuredClone(doc)]);
    setRedo([]);
    drag.current = {
      clip: structuredClone(clip),
      mode,
      x: e.clientX,
      timeline: structuredClone(doc),
      pixels: ruler.current.getBoundingClientRect().width,
      scrollLeft: timelineScroll.current?.scrollLeft ?? 0,
    };
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const scrollDelta =
      (timelineScroll.current?.scrollLeft ?? d.scrollLeft) - d.scrollLeft;
    const delta = Math.round(
      ((e.clientX - d.x + scrollDelta) / d.pixels) * manifest.durationInFrames,
    );
    let start = d.clip.from,
      end = start + d.clip.durationInFrames;
    if (d.mode === "move") {
      start = Math.max(
        0,
        Math.min(
          manifest.durationInFrames - d.clip.durationInFrames,
          start + delta,
        ),
      );
      end = start + d.clip.durationInFrames;
    } else if (d.mode === "left")
      start = Math.max(0, Math.min(end - 1, start + delta));
    else
      end = Math.max(
        start + 1,
        Math.min(manifest.durationInFrames, end + delta),
      );
    edit(
      changeClipRange(d.timeline, d.clip.id, start, end, d.mode !== "move", resolveTimelineBehavior(d.clip.componentId, components)),
      false,
    );
  }
  const finish = () => {
    drag.current = undefined;
  };
  function scrub(e: ReactPointerEvent) {
    if (!ruler.current) return;
    const r = ruler.current.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * manifest.durationInFrames);
  }
  const fitScale = Math.min(
    (canvasSize.width - 32) / manifest.width,
    (canvasSize.height - 32) / manifest.height,
  );
  const currentScale = canvasScale ?? Math.max(0.05, fitScale || 0.1);
  function setCanvasZoom(mode: "fit" | "actual" | "in" | "out") {
    if (mode === "fit") {
      setCanvasScale(null);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (mode === "actual") {
      setCanvasScale(1);
      return;
    }
    setCanvasScale(
      Math.max(
        0.1,
        Math.min(4, currentScale * (mode === "in" ? 1.2 : 1 / 1.2)),
      ),
    );
  }
  function canvasWheel(e: React.WheelEvent) {
    if (!e.ctrlKey || !canvasViewport.current) return;
    e.preventDefault();
    const rect = canvasViewport.current.getBoundingClientRect();
    const ratio = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.max(0.1, Math.min(4, currentScale * ratio));
    const ox = e.clientX - (rect.left + rect.width / 2);
    const oy = e.clientY - (rect.top + rect.height / 2);
    setPan((p) => ({
      x: ox * (1 - next / currentScale) + (p.x * next) / currentScale,
      y: oy * (1 - next / currentScale) + (p.y * next) / currentScale,
    }));
    setCanvasScale(next);
  }
  function canvasPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 1 || (spaceRef.current && e.button === 0)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      canvasDrag.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }
  function canvasPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = canvasDrag.current;
    if (d) setPan({ x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y });
  }
  function canvasPointerUp() {
    canvasDrag.current = undefined;
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
    const duplicateContent = resolveTimelineBehavior(clip.componentId, components).duplicateContent;
    if (duplicateContent) copy.content = duplicateContent(clip.content, clip.id);
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
        <button
          disabled={!undo.length}
          onClick={() => {
            if (!doc) return;
            const prev = undo.at(-1)!;
            setUndo(undo.slice(0, -1));
            setRedo((h) => [...h, doc]);
            edit(prev, false);
          }}
        >
          Undo
        </button>
        <button
          disabled={!redo.length}
          onClick={() => {
            if (!doc) return;
            const next = redo.at(-1)!;
            setRedo(redo.slice(0, -1));
            setUndo((h) => [...h, doc]);
            edit(next, false);
          }}
        >
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
        style={
          { "--inspector-width": `${inspectorWidth}px` } as React.CSSProperties
        }
      >
        <div className="preview-pane">
          <div className="canvas-toolbar" aria-label="Canvas navigation">
            <button onClick={() => setCanvasZoom("fit")}>Fit</button>
            <button aria-label="Zoom out" onClick={() => setCanvasZoom("out")}>
              −
            </button>
            <button aria-label="Zoom in" onClick={() => setCanvasZoom("in")}>
              +
            </button>
            <button onClick={() => setCanvasZoom("actual")}>100%</button>
            <button
              aria-label="Reset canvas view"
              onClick={() => {
                setCanvasZoom("fit");
                setPan({ x: 0, y: 0 });
              }}
            >
              Reset view
            </button>
            <span>{Math.round(currentScale * 100)}%</span>
            <button
              onClick={() => setCanvasFullscreen(true)}
              title="Fullscreen video preview"
            >
              Fullscreen
            </button>
          </div>
          <div
            className={`preview-stage ${canvasFullscreen ? "preview-fullscreen" : ""}`}
            ref={canvasViewport}
            onWheel={canvasWheel}
          >
            {canvasFullscreen && (
              <button
                className="canvas-fullscreen-exit"
                onClick={() => setCanvasFullscreen(false)}
              >
                Exit fullscreen · Esc
              </button>
            )}
            <div
              className="canvas-surface"
              style={{
                width: manifest.width,
                height: manifest.height,
                translate: `${pan.x}px ${pan.y}px`,
                transform: `translate(-50%,-50%) scale(${currentScale})`,
              }}
            >
              <iframe
                ref={iframe}
                key={reload}
                title="Composition preview"
                sandbox="allow-scripts allow-same-origin"
                allow="autoplay"
                onLoad={() => send("hello")}
                src={
                  built
                    ? `${previewOrigin}/${manifest.id}/index.html`
                    : `${previewOrigin}/preview.html?project=${encodeURIComponent(manifest.id)}`
                }
              />
              <div
                className={`canvas-pan-input ${spaceHeld ? "space-pan" : ""}`}
                onPointerDown={canvasPointerDown}
                onPointerMove={canvasPointerMove}
                onPointerUp={canvasPointerUp}
                onPointerCancel={canvasPointerUp}
              />
            </div>
            <div
              className="canvas-pan-surface"
              onPointerDown={canvasPointerDown}
              onPointerMove={canvasPointerMove}
              onPointerUp={canvasPointerUp}
              onPointerCancel={canvasPointerUp}
            />
          </div>
          <div className="transport">
            <button onClick={() => seek(frame - 1)} aria-label="Previous frame">
              −1 frame
            </button>
            <button onClick={() => send(playing ? "pause" : "play")}>
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => seek(frame + 1)} aria-label="Next frame">
              +1 frame
            </button>
            <label>
              Frame{" "}
              <input
                aria-label="Playhead frame"
                type="number"
                min={0}
                max={manifest.durationInFrames - 1}
                value={frame}
                onChange={(e) => seek(Number(e.target.value))}
              />
            </label>
            <output data-testid="frame-readout">
              {frame} / {manifest.durationInFrames - 1} ·{" "}
              {(frame / manifest.fps).toFixed(3)}s
            </output>
          </div>
        </div>
        <button
          className="panel-splitter inspector-splitter"
          aria-label="Resize inspector"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            panelResize.current = {
              kind: "inspector",
              start: e.clientX,
              size: inspectorWidth,
            };
          }}
          onPointerMove={resizePanel}
          onPointerUp={endPanelResize}
        />
        <section className="properties" aria-label="Clip properties">
          <span className="eyebrow">INSPECTOR</span>
          {clip ? (
            <>
              <h3>{definition?.name ?? clip.componentId}</h3>
              <small data-testid="declared-fields">
                {definition?.fields.map((f) => f.key).join(",") ??
                  "metadata pending"}
              </small>
              <small>{clip.id}</small>
              <label>
                Track
                <select
                  aria-label="Clip track"
                  value={clip.trackId}
                  onChange={(e) =>
                    edit({
                      ...doc!,
                      clips: doc!.clips.map((c) =>
                        c.id === clip.id
                          ? { ...c, trackId: e.target.value }
                          : c,
                      ),
                    })
                  }
                >
                  {doc?.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="range-fields">
                <label>
                  Start frame
                  <input
                    aria-label="Clip start frame"
                    type="number"
                    min={0}
                    max={clip.from + clip.durationInFrames - 1}
                    value={clip.from}
                    onChange={(e) =>
                      edit(
                        changeClipRange(
                          doc!,
                          clip.id,
                          Number(e.target.value),
                          clip.from + clip.durationInFrames,
                          true,
                          resolveTimelineBehavior(clip.componentId, components),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  End frame
                  <input
                    aria-label="Clip end frame"
                    type="number"
                    min={clip.from + 1}
                    max={manifest.durationInFrames}
                    value={clip.from + clip.durationInFrames}
                    onChange={(e) =>
                      edit(
                        changeClipRange(
                          doc!,
                          clip.id,
                          clip.from,
                          Number(e.target.value),
                          true,
                          resolveTimelineBehavior(clip.componentId, components),
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <small>
                {(clip.from / manifest.fps).toFixed(3)}s →{" "}
                {((clip.from + clip.durationInFrames) / manifest.fps).toFixed(
                  3,
                )}
                s · end is exclusive
              </small>
              {definition?.fields.map((field) => (
                <PropertyControl
                  key={field.key}
                  field={field}
                  value={fieldValue(clip, field)}
                  onChange={(v) => property(field, v)}
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
              <div className="tools">
                <button onClick={duplicate}>Duplicate clip</button>
                <button
                  onClick={() => {
                    edit({
                      ...doc!,
                      clips: doc!.clips.filter((c) => c.id !== clip.id),
                    });
                    setSelected("");
                  }}
                >
                  Delete clip
                </button>
              </div>
            </>
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
                <strong>{doc?.clips.length ?? 0}</strong>
              </div>
              <p className="muted">
                Select an element on the timeline to edit its timing and
                declared properties.
              </p>
            </>
          )}
        </section>
      </div>
      {doc ? (
        <div className="timeline-dock">
          <button
            className="timeline-resize"
            aria-label="Resize timeline height"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              panelResize.current = {
                kind: "timeline",
                start: e.clientY,
                size: timelineHeight,
              };
            }}
            onPointerMove={resizePanel}
            onPointerUp={endPanelResize}
          />
          <div className="timeline-actions">
            <h3>
              Timeline{" "}
              <small>
                {doc.fps} FPS · {doc.tracks.length} tracks
              </small>
            </h3>
            <button
              disabled={!components.some((c) => c.id === "subtitles")}
              onClick={addSubtitle}
            >
              Add subtitle
            </button>
            <button
              onClick={() =>
                edit({
                  ...doc,
                  tracks: [
                    ...doc.tracks,
                    {
                      id: `track-${crypto.randomUUID()}`,
                      name: `Track ${doc.tracks.length + 1}`,
                    },
                  ],
                })
              }
            >
              Add track
            </button>
            <label>
              Zoom{" "}
              <select
                aria-label="Timeline zoom"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              >
                <option value={1}>Fit</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <label>
              View{" "}
              <input
                aria-label="Timeline playhead frame"
                type="number"
                min={0}
                max={manifest.durationInFrames - 1}
                value={frame}
                onChange={(e) => seek(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="timeline-scroll" ref={timelineScroll}>
            <div
              className="timeline-canvas"
              style={{
                minWidth:
                  zoom === 1
                    ? "100%"
                    : `${Math.max(760, timelineViewportWidth - 120) * zoom + 120}px`,
              }}
            >
              <div className="ruler-row">
                <div className="track-label">TRACKS</div>
                <div
                  className="time-ruler"
                  ref={ruler}
                  role="slider"
                  aria-label="Timeline playhead"
                  aria-valuemin={0}
                  aria-valuemax={manifest.durationInFrames - 1}
                  aria-valuenow={frame}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      seek(frame - 1);
                    }
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      seek(frame + 1);
                    }
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    scrub(e);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) scrub(e);
                  }}
                >
                  {Array.from({ length: 11 }, (_, i) => (
                    <span key={i} style={{ left: `${i * 10}%` }}>
                      {(((doc.durationInFrames / doc.fps) * i) / 10).toFixed(1)}
                      s
                    </span>
                  ))}
                  <div
                    className="playhead-line"
                    style={{ left: `${(frame / doc.durationInFrames) * 100}%` }}
                  />
                  <div
                    className="playhead-cap"
                    style={{ left: `${(frame / doc.durationInFrames) * 100}%` }}
                  />
                </div>
              </div>
              {doc.tracks.map((track) => (
                <div className="track-row" key={track.id}>
                  <div className="track-label">{track.name}</div>
                  <div
                    className="track-lane"
                    data-track={track.id}
                    onPointerDown={() => setSelected("")}
                  >
                    {doc.clips
                      .filter((c) => c.trackId === track.id)
                      .map((c) => (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Clip ${c.id}`}
                          aria-pressed={selected === c.id}
                          data-clip-id={c.id}
                          className={`timeline-clip ${c.componentId === "subtitles" ? "subtitle-clip" : ""} ${selected === c.id ? "is-selected" : ""}`}
                          style={{
                            left: `${(c.from / doc.durationInFrames) * 100}%`,
                            width: `${(c.durationInFrames / doc.durationInFrames) * 100}%`,
                          }}
                          onPointerDown={(e) => begin(e, c, "move")}
                          onPointerMove={move}
                          onPointerUp={finish}
                          onPointerCancel={finish}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(c.id);
                            }
                            if (
                              e.key === "ArrowLeft" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              const start = Math.max(
                                0,
                                Math.min(
                                  doc.durationInFrames - c.durationInFrames,
                                  c.from + (e.key === "ArrowRight" ? 1 : -1),
                                ),
                              );
                              edit(
                                changeClipRange(
                                  doc,
                                  c.id,
                                  start,
                                  start + c.durationInFrames,
                                ),
                              );
                            }
                          }}
                        >
                          <button
                            className="resize-handle left"
                            aria-label={`Resize start ${c.id}`}
                            onPointerDown={(e) => begin(e, c, "left")}
                          />
                          <span className="clip-title">
                            {String(c.content.text ?? c.label)}
                          </span>
                          <small>
                            {c.from}–{c.from + c.durationInFrames}
                          </small>
                          <button
                            className="resize-handle right"
                            aria-label={`Resize end ${c.id}`}
                            onPointerDown={(e) => begin(e, c, "right")}
                          />
                        </div>
                      ))}
                    <div
                      className="playhead-line"
                      style={{
                        left: `${(frame / doc.durationInFrames) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="timeline-footer">
            <label className="button">
              Import subtitles / timeline
              <input
                aria-label="Import subtitles"
                type="file"
                accept=".json,.srt,.lrc"
                onChange={(e) => {
                  importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={() => exportTiming("json")}>
              Export timing JSON
            </button>
            <button onClick={() => exportTiming("srt")}>Export SRT</button>
            <button onClick={() => exportTiming("lrc")}>Export LRC</button>
            <button
              onClick={() =>
                download(
                  `${manifest.id}.timeline.json`,
                  JSON.stringify(doc, null, 2),
                )
              }
            >
              Export editable timeline
            </button>
          </div>
        </div>
      ) : (
        <p className="muted timeline-loading">
          {manifest.editTimeline
            ? "Loading editable timeline…"
            : "This code-only project has no declared timeline. Playback remains available."}
        </p>
      )}
    </section>
  );
}
function PropertyControl({
  field,
  value,
  onChange,
}: {
  field: EditableField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = field.label;
  if (field.type === "boolean")
    return (
      <label className="checkbox-property">
        <input
          aria-label={label}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
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
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          type={field.type === "color" ? "color" : "number"}
          value={String(value)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) =>
            onChange(
              field.type === "number" ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
