import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectRecord } from "@motion/project-loader/schema";
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
import registry from "../../../packages/animation-library/registry.json";
import "./style.css";
import {TimelineEditor} from "./TimelineEditor";
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
function App() {
  const [state, setState] = useState<State>();
  const [selected, setSelected] = useState(
    localStorage.getItem("motion-project") ?? "first-tutorial",
  );
  const [tab, setTab] = useState("Preview");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetch("/api/state")
        .then((r) => r.json())
        .then((s) => {
          if (active) {
            setState(s);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    refresh();
    const timer = setInterval(refresh, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (state && !state.projects.some((p) => p.id === selected)) {
      const fallback = state.projects.find((p) => p.manifest)?.id;
      if (fallback) setSelected(fallback);
    }
  }, [state, selected]);
  const project = state?.projects.find((p) => p.id === selected);
  const m = project?.manifest;
  function select(id: string) {
    setSelected(id);
    localStorage.setItem("motion-project", id);
    setReload(0);
  }
  return (
    <div className="studio">
      <aside>
        <div className="brand">
          <span className="brand-icon">
            m<span>✳</span>
          </span>
          <div>
            motion<span>STUDIO / 001</span>
          </div>
        </div>
        <div className="workspace-label">
          LOCAL WORKSPACE <span className="dot" />
        </div>
        <h3>
          Projects <span>{state?.projects.length ?? 0}</span>
        </h3>
        <nav>
          {state?.projects.map((p, i) => (
            <button
              className={`project ${p.id === selected ? "active" : ""}`}
              onClick={() => select(p.id)}
              key={p.id}
            >
              <span className="project-icon">
                {p.manifest?.type === "lyrics" ? "♫" : "◈"}
              </span>
              <span>
                {p.manifest?.name ?? p.id}
                <small>
                  {p.error
                    ? "Needs attention"
                    : p.manifest?.type === "lyrics"
                      ? "Lyrics & music"
                      : "Explainer video"}
                </small>
              </span>
              <span className="project-number">0{i + 1}</span>
            </button>
          ))}
        </nav>
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
        <footer>
          <span className="dot" />{" "}
          {state?.built ? "Built preview" : "Live development"}
          <small>SDK 0.1.0 · Local workspace</small>
        </footer>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> {m?.name ?? "Project"}
          </div>
          <span className="pill">AI MOTION STUDIO</span>
        </header>
        <div className="page-heading">
          <div>
            <span className="eyebrow">YOUR IDEAS, IN MOTION</span>
            <h1>{m?.name ?? "Choose a project"}</h1>
            <p>
              {m?.description ??
                "Independent compositions. One reusable toolkit."}
            </p>
          </div>
          <button onClick={() => setReload((r) => r + 1)}>
            ↻ Reload preview
          </button>
        </div>
        <div className="tabs">
          {["Preview", "Lyrics sync", "Capabilities"].map((t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <span>● {m ? "Project ready" : "Check project"}</span>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {tab === "Preview" && (project?.error?<div className="error" role="alert"><h2>Project needs attention</h2><pre>{project.error}</pre></div>:m&&state?<TimelineEditor key={selected} manifest={m} previewOrigin={state.previewOrigin} built={state.built} reload={reload}/>:<p>Discovering projects…</p>)}
        {tab === "Lyrics sync" && <Lyrics key={selected} id={selected} />}{" "}
        {tab === "Capabilities" && (
          <section className="capabilities">
            <span className="eyebrow">THE REUSABLE TOOLKIT</span>
            <h2>Build once. Set anything in motion.</h2>
            <div className="cap-grid">
              {registry.capabilities.map((c) => (
                <article key={c.id}>
                  <span className="pill">{c.kind}</span>
                  <h3>{c.name}</h3>
                  <p>{c.description}</p>
                  <code>{c.id}</code>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
