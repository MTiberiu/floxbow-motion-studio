import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectRecord } from "@motion/project-loader/schema";
import type {
  PanelWindowContext,
  WindowContext,
} from "../electron/window-contract.cjs";
import {
  parseTimeline,
  toJSON,
  toSRT,
  toLRC,
  toWords,
  fromLyrics,
  reconcile,
  alignmentStatus,
  type LyricTimeline,
} from "@motion/lyrics-sync";
import "./style.css";
import { TimelineEditor } from "./TimelineEditor";
import { CapabilitiesExplorer } from "./CapabilitiesExplorer";
import { StoryboardDesigner } from "./StoryboardDesigner";
import { MotionLibrary } from "./MotionLibrary";
import { PoseSheetStudio } from "./PoseSheetStudio";
import { MediaPanel } from "./MediaPanel";
import { ProjectLibrary } from "./ProjectLibrary";
import { MusicAnalysis } from "./MusicAnalysis";
import { DetachedTimelineWindow } from "./DetachedTimelineWindow";
import {
  WorkspaceManager,
  WorkspaceNavigation,
  WorkspacePanels,
  useWorkspaceManager,
} from "./WorkspaceManager";
type State = {
  previewOrigin: string;
  built: boolean;
  projects: ProjectRecord[];
};
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Lyrics({ id }: { id: string }) {
  const [timeline, setTimeline] = useState<LyricTimeline>();
  const [error, setError] = useState("");
  const [original, setOriginal] = useState("");
  useEffect(() => {
    setTimeline(undefined);
    setError("");
    fetch(`/api/timeline/${id}`)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "This project has no lyric timeline. Import JSON or enter lyrics below.",
          );
        return r.json();
      })
      .then((t) => setTimeline(parseTimeline(t)))
      .catch((e) => setError(e.message));
  }, [id]);
  function update(
    line: number,
    word: number,
    key: "start" | "end",
    value: string,
  ) {
    if (!timeline) return;
    const next = structuredClone(timeline);
    const w = next.lines[line].words[word];
    w[key] = value === "" ? null : Number(value);
    w.source = "manual";
    w.confidence = 0;
    next.status = "unverified";
    setTimeline(next);
  }
  async function load(file: File | undefined, transcript = false) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      setTimeline(transcript ? reconcile(original, data) : parseTimeline(data));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  function save(format: string) {
    try {
      if (!timeline) return;
      const t = parseTimeline(timeline);
      const text =
        format === "srt"
          ? toSRT(t)
          : format === "lrc"
            ? toLRC(t)
            : format === "words.json"
              ? toWords(t)
              : toJSON(t);
      download(`timeline.${format}`, text);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="lyrics">
      <div className="section-title">
        <div>
          <span className="eyebrow">LYRICS WORKBENCH</span>
          <h2>Every word, in its place.</h2>
        </div>
        <span className="pill">{timeline?.status ?? "No timing loaded"}</span>
      </div>
      <p className="muted">{alignmentStatus.message}</p>
      <div className="tools">
        <label className="button">
          Import timeline JSON
          <input
            type="file"
            accept=".json"
            onChange={(e) => load(e.target.files?.[0])}
          />
        </label>
        {["json", "srt", "lrc", "words.json"].map((f) => (
          <button disabled={!timeline} key={f} onClick={() => save(f)}>
            Export {f.toUpperCase()}
          </button>
        ))}
      </div>
      <details>
        <summary>Start from original lyrics or reconcile a transcript</summary>
        <textarea
          aria-label="Original lyrics"
          placeholder="Paste the correct lyrics. No timestamps will be invented."
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
        />
        <div className="tools">
          <button
            onClick={() => {
              setTimeline(fromLyrics(original));
              setError("");
            }}
          >
            Create untimed lyrics
          </button>
          <label className="button">
            Import WhisperX / stable-ts word JSON
            <input
              type="file"
              accept=".json"
              onChange={(e) => load(e.target.files?.[0], true)}
            />
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="muted">
        Times are seconds. Edits stay here until exported. Replace the project’s
        timeline file to update the video. Subtitle exports omit lines with
        missing timing.
      </p>
      {timeline?.lines.map((l, li) => (
        <div className="lyric-line" key={l.id}>
          <div className="line-label">
            {l.section} {l.repeatOf && "↻ repeat"}
            <small>{l.id}</small>
          </div>
          <div className="words">
            {l.words.map((w, wi) => (
              <div
                className={`word ${w.confidence < 0.7 ? "uncertain" : ""}`}
                key={w.id}
              >
                <strong>{w.text}</strong>
                <div>
                  <input
                    aria-label={`${w.id} start`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={w.start ?? ""}
                    placeholder="start"
                    onChange={(e) => update(li, wi, "start", e.target.value)}
                  />
                  <input
                    aria-label={`${w.id} end`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={w.end ?? ""}
                    placeholder="end"
                    onChange={(e) => update(li, wi, "end", e.target.value)}
                  />
                </div>
                <small>
                  {w.source} · {Math.round(w.confidence * 100)}%
                </small>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
function StudioShell() {
  const workspace = useWorkspaceManager();
  const [state, setState] = useState<State>();
  const [selected, setSelected] = useState("");
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [projectDirty, setProjectDirty] = useState({ timeline: false, storyboard: false });
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [leftWidth, setLeftWidth] = useState(
    () => Number(localStorage.getItem("motion-left-width")) || 248,
  );
  const resizing = useRef<{ x: number; width: number } | undefined>(undefined);
  const stateRequestGeneration = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const generation = ++stateRequestGeneration.current;
      void fetch("/api/state")
        .then((r) => r.json())
        .then((s) => {
          if (active && generation === stateRequestGeneration.current) {
            setState(s);
            setError("");
          }
        })
        .catch((e) => {
          if (active && generation === stateRequestGeneration.current)
            setError(String(e));
        });
    };
    refresh();
    const timer = setInterval(refresh, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    if (
      state.projects.some(
        (project) => project.id === selected && project.manifest,
      )
    )
      return;
    if (!selected) return;
    setSelected("");
    localStorage.removeItem("motion-project");
    setAssetsOpen(false);
    setProjectDirty({ timeline: false, storyboard: false });
  }, [state, selected]);
  const project = state?.projects.find((p) => p.id === selected);
  const m = project?.manifest;
  function select(id: string) {
    setSelected(id);
    localStorage.setItem("motion-project", id);
    setReload(0);
    setAssetsOpen(false);
    setProjectDirty({ timeline: false, storyboard: false });
    workspace.activatePanel("editor");
  }
  async function createProject(name: string, width: number, height: number) {
    const id = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!id) throw new Error("Enter a name using letters or numbers.");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, width, height }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data: { project: ProjectRecord } = await response.json();
    stateRequestGeneration.current++;
    setState((current) => current
      ? { ...current, projects: [...current.projects, data.project] }
      : current);
    select(id);
  }
  async function deleteProject(id: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
    stateRequestGeneration.current++;
    setState((current) => current
      ? { ...current, projects: current.projects.filter((project) => project.id !== id) }
      : current);
  }
  function requestProjectLibrary() {
    if (projectDirty.timeline || projectDirty.storyboard) {
      setLeaveDialogOpen(true);
      return;
    }
    leaveProject();
  }
  function leaveProject() {
    setLeaveDialogOpen(false);
    setSelected("");
    localStorage.removeItem("motion-project");
    setAssetsOpen(false);
    setProjectDirty({ timeline: false, storyboard: false });
  }
  function setDirty(kind: "timeline" | "storyboard", dirty: boolean) {
    setProjectDirty((current) => current[kind] === dirty ? current : { ...current, [kind]: dirty });
  }
  function resizeLeft(e: React.PointerEvent<HTMLButtonElement>) {
    if (!resizing.current) return;
    const width = Math.max(
      190,
      Math.min(380, resizing.current.width + e.clientX - resizing.current.x),
    );
    setLeftWidth(width);
    localStorage.setItem("motion-left-width", String(width));
  }
  function stopResize() {
    resizing.current = undefined;
  }
  return (
    <div
      className={`studio${selected ? " project-open" : " library-open"}${assetsOpen ? " assets-open" : ""}${workspace.activePanelId === "storyboard" ? " storyboard-mode" : ""}${workspace.activePanelId === "pose-studio" ? " pose-studio-mode" : ""}`}
      style={{ "--left-width": `${leftWidth}px` } as React.CSSProperties}
    >
      <header className="app-toolbar">
        <div className="brand compact-brand">
          <span className="brand-icon">
            m<span>✳</span>
          </span>
          <div>
            Motion Studio<span>WORKSPACE / 001</span>
          </div>
        </div>
        <div className="toolbar-project">
          <h1 className="toolbar-title">{selected ? (m?.name ?? "Loading project…") : "Project library"}</h1>
          <span className="dot" />
          <small>{state?.built ? "Built preview" : "Live development"}</small>
        </div>
        {selected && <>
          <button className="toolbar-button" onClick={() => setAssetsOpen((open) => !open)} aria-pressed={assetsOpen} title="Show or hide project resources">▤ Assets</button>
          <button className="toolbar-button" onClick={requestProjectLibrary}>Projects</button>
        </>}
        {selected && <WorkspaceNavigation />}
        {selected && <button
          className="toolbar-button"
          aria-label="Reload preview"
          title="Reload preview"
          onClick={() => setReload((r) => r + 1)}
        >
          ↻ Reload
        </button>}
      </header>
      {selected && <>
      <aside className="project-browser">
        <div className="browser-heading">
          <span>PROJECT BROWSER</span>
          <span className="browser-count">{state?.projects.length ?? 0}</span>
        </div>
        <div className="browser-scroll">
          <div className="browser-section-heading"><h3>Project resources</h3></div>
          <nav>
            <div className="asset-list">
              <div><span className="asset-icon">◈</span><span>Composition<small>{m?.entry ?? "Loading…"}</small></span></div>
              <div><span className="asset-icon">▤</span><span>Timeline<small>{m?.editTimeline ?? "Code-only project"}</small></span></div>
              <div><span className="asset-icon">♫</span><span>Lyrics &amp; subtitles<small>Timing and appearance</small></span></div>
            </div>
          </nav>
          <MediaPanel
            key={selected}
            projectId={selected}
            built={state?.built ?? false}
          />
          <div className="agent-note">
            <span>↗</span>
            <h4>Made for your AI agent.</h4>
            <p>
              Create a project folder.
              <br />
              Write a composition.
              <br />
              See it come to life.
            </p>
            <code>projects/&lt;your-video&gt;/</code>
          </div>
        </div>
        <div className="browser-footer">
          <span className="dot" /> Local workspace<small>SDK 0.1.0</small>
        </div>
      </aside>
      <button
        className="panel-splitter left-splitter"
        aria-label="Resize project browser"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          resizing.current = { x: e.clientX, width: leftWidth };
        }}
        onPointerMove={resizeLeft}
        onPointerUp={stopResize}
      />
      </>}
      <main className="workspace-main">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!selected ? <ProjectLibrary projects={state?.projects ?? []} built={state?.built ?? false} loading={!state} onOpen={select} onCreate={createProject} onDelete={deleteProject} /> : <WorkspacePanels
          renderPanel={(id, active) => {
            if (id === "editor") {
              return state && !state.projects.some((item) => item.manifest) ? (
                <section className="empty-project-state">
                  <span className="eyebrow">A CLEAN WORKSPACE</span>
                  <h2>Create your first video project</h2>
                  <p>
                    {state.built
                      ? "This built snapshot has no projects. Start the live development workspace to create source projects."
                      : "Projects are yours to create. Reusable components and technical examples live separately in Capabilities Explorer."}
                  </p>
                  <button
                    className="secondary-action"
                    onClick={requestProjectLibrary}
                  >
                    Back to projects
                  </button>
                </section>
              ) : project?.error ? (
                <div className="error" role="alert">
                  <h2>Project needs attention</h2>
                  <pre>{project.error}</pre>
                </div>
              ) : m && state ? (
                <TimelineEditor
                  key={selected}
                  manifest={m}
                  previewOrigin={state.previewOrigin}
                  built={state.built}
                  reload={reload}
                  active={active}
                  requestPreviewReload={() =>
                    setReload((current) => current + 1)
                  }
                  onDirtyChange={(dirty) => setDirty("timeline", dirty)}
                />
              ) : (
                <p>Discovering projects…</p>
              );
            }
            if (id === "lyrics-sync")
              return (
                <div className="auxiliary-view">
                  <Lyrics key={selected} id={selected} />
                </div>
              );
            if (id === "music-analysis")
              return m ? <MusicAnalysis key={selected} manifest={m} active={active} /> : <p>Select or create a project to analyze its music.</p>;
            if (id === "storyboard")
              return m && state ? (
                <StoryboardDesigner
                  key={selected}
                  manifest={m}
                  active={active}
                  built={state.built}
                  onDirtyChange={(dirty) => setDirty("storyboard", dirty)}
                  onExitProject={requestProjectLibrary}
                />
              ) : (
                <p>Select or create a project to open Storyboard Designer.</p>
              );
            if (id === "motion-library") return <MotionLibrary />;
            if (id === "pose-studio")
              return (
                <PoseSheetStudio manifest={m} built={state?.built ?? false} />
              );
            if (id === "capabilities")
              return (
                <div className="auxiliary-view">
                  <CapabilitiesExplorer />
                </div>
              );
            const exhaustive: never = id;
            return exhaustive;
          }}
        />}
      </main>
      {leaveDialogOpen && <div className="unsaved-exit-backdrop" role="presentation"><section className="unsaved-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-exit-title"><span className="eyebrow">UNSAVED CHANGES</span><h2 id="unsaved-exit-title">Leave this project?</h2><p>{projectDirty.timeline && projectDirty.storyboard ? "The Timeline and Storyboard have unsaved changes." : projectDirty.timeline ? "The Timeline has unsaved changes." : "The Storyboard has unsaved changes."} If you return to projects now, these changes may be lost.</p><footer><button onClick={() => setLeaveDialogOpen(false)}>Stay in project</button><button className="unsaved-exit-confirm" onClick={leaveProject}>Leave without saving</button></footer></section></div>}
    </div>
  );
}

function App() {
  return (
    <WorkspaceManager>
      <StudioShell />
    </WorkspaceManager>
  );
}

function WindowBootstrap() {
  const api = window.floxBowWindows;
  const [context, setContext] = useState<WindowContext>();
  const [error, setError] = useState("");

  useEffect(() => {
    const bridge = window.floxBowWindows;
    if (!bridge) return;
    let active = true;
    bridge
      .getContext()
      .then((next) => {
        if (active) setContext(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  if (!api || context?.role === "primary") return <App />;
  if (context?.role === "panel")
    return <DetachedTimelineWindow context={context as PanelWindowContext} />;
  if (error)
    return (
      <main className="panel-window-placeholder" role="alert">
        <h1>Window could not be verified</h1>
        <p>{error}</p>
      </main>
    );
  return (
    <main className="panel-window-placeholder" aria-busy="true">
      Starting…
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<WindowBootstrap />);
