import { useEffect, useRef, useState } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import type { SubtitleCue } from "@motion/lyrics-sync/subtitles";
import {
  directorBrief,
  newScene,
  newSet,
  sceneFingerprint,
  timingWarnings,
  storyboardSchema,
  type Storyboard,
  type StoryScene,
  type StorySet,
  type Representation,
} from "@motion/project-loader/storyboard";
import { StoryboardCanvas, storyId } from "./StoryboardCanvas";
import {
  download,
  exportStoryboard,
  loadReferenceImages,
  timingContextText,
} from "./storyboard-export";
import "./storyboard.css";
type Timing = {
  revision: string;
  cues: SubtitleCue[];
  scenes: { id: string; name: string }[];
  audio: {
    clipId: string;
    assetId: string;
    start: number;
    duration: number;
    sourceStart: number;
  }[];
};
type Media = {
  revision: string;
  assets: { id: string; displayName: string; type: string; status: string }[];
};
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step="0.1"
        placeholder="Unspecified"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : +e.target.value)
        }
      />
    </label>
  );
}
export function StoryboardDesigner({
  manifest,
  active,
  built,
}: {
  manifest: ProjectManifest;
  active: boolean;
  built: boolean;
}) {
  const [doc, setDoc] = useState<Storyboard>(),
    [revision, setRevision] = useState(""),
    [saved, setSaved] = useState("");
  const [sceneId, setSceneId] = useState(""),
    [setId, setSetId] = useState(""),
    [repId, setRepId] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState<Timing>({
      revision: "",
      cues: [],
      scenes: [],
      audio: [],
    }),
    [media, setMedia] = useState<Media>({ revision: "", assets: [] });
  const [briefText, setBriefText] = useState(""),
    [audioId, setAudioId] = useState(""),
    [time, setTime] = useState(0),
    [wordIds, setWordIds] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    if (doc) {
      let cancelled = false;
      void loadReferenceImages(doc).then((images) => {
        if (!cancelled) setImages(images);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [doc?.references.map((r) => r.id + r.assetId).join()]);
  const audio = useRef<HTMLAudioElement>(null),
    history = useRef<Storyboard[]>([]),
    future = useRef<Storyboard[]>([]);
  const base = `/api/storyboard/${manifest.id}`,
    draftKey = `floxbow-storyboard:${manifest.id}`;
  const scene = doc?.scenes.find((s) => s.id === sceneId) ?? doc?.scenes[0],
    set = scene?.sets.find((s) => s.id === setId) ?? scene?.sets[0];
  const rep = set?.representations.find((r) => r.id === repId),
    object = scene?.objects.find((o) => o.id === rep?.objectId);
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  useEffect(() => {
    if (
      doc &&
      (doc.composition.width !== manifest.width ||
        doc.composition.height !== manifest.height ||
        doc.composition.fps !== manifest.fps)
    ) {
      setDoc({
        ...doc,
        composition: {
          width: manifest.width,
          height: manifest.height,
          fps: manifest.fps,
        },
      });
      setNotice(
        "Project format updated. Percentage positions are preserved; save the storyboard to record the new composition.",
      );
    }
  }, [doc, manifest.width, manifest.height, manifest.fps]);
  const format = {
    name: manifest.name,
    width: manifest.width,
    height: manifest.height,
    fps: manifest.fps,
  };
  const source =
    timing.audio.find((a) => a.clipId === audioId) ?? timing.audio[0];
  async function refreshContext() {
    const results = await Promise.allSettled([
      json<Timing>(`${base}/timing`),
      json<Media>(`/api/media/${manifest.id}`),
    ]);
    if (results[0].status === "fulfilled") setTiming(results[0].value);
    else setError(String(results[0].reason));
    if (results[1].status === "fulfilled") setMedia(results[1].value);
  }
  async function load(restore = false) {
    const snapshot = await json<{ document: Storyboard; revision: string }>(
      base,
    );
    let next = snapshot.document;
    if (restore) {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        next = storyboardSchema.parse(draft.document);
        if (draft.revision !== snapshot.revision) {
          setError(
            "Disk changed while a local draft was open. Export the draft before reloading; saving is blocked by revision checks.",
          );
          setRevision(draft.revision);
        } else setRevision(snapshot.revision);
      } else setRevision(snapshot.revision);
    } else {
      setRevision(snapshot.revision);
      localStorage.removeItem(draftKey);
    }
    setDoc(next);
    setSaved(JSON.stringify(snapshot.document));
    history.current = [];
    future.current = [];
    await refreshContext();
  }
  useEffect(() => {
    void load(true).catch((e) => setError(String(e)));
  }, [manifest.id]);
  useEffect(() => {
    if (!active) audio.current?.pause();
    else void refreshContext();
  }, [active]);
  useEffect(() => {
    if (!doc) return;
    try {
      if (dirty)
        localStorage.setItem(
          draftKey,
          JSON.stringify({ document: doc, revision }),
        );
      else localStorage.removeItem(draftKey);
    } catch {
      setError("Local draft backup is full. Save to the project now.");
    }
  }, [doc, revision, dirty]);
  useEffect(() => {
    setWordIds([]);
    audio.current?.pause();
  }, [set?.id]);
  function edit(fn: (d: Storyboard) => void) {
    if (!doc || busy || built) return;
    const next = structuredClone(doc);
    fn(next);
    next.composition = {
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
    };
    next.scenes.forEach((s) =>
      s.sets.forEach((set) =>
        set.representations.forEach((r, i) => {
          r.setId = set.id;
          r.zOrder = i;
        }),
      ),
    );
    history.current = [...history.current.slice(-79), doc];
    future.current = [];
    setDoc(next);
    setNotice("");
  }
  function editScene(fn: (s: StoryScene) => void) {
    if (scene) edit((d) => fn(d.scenes.find((s) => s.id === scene.id)!));
  }
  function editSet(fn: (s: StorySet) => void) {
    if (set) editScene((s) => fn(s.sets.find((x) => x.id === set.id)!));
  }
  function editRep(patch: Partial<Representation>) {
    editSet((s) => {
      const r = s.representations.find((r) => r.id === repId);
      if (r) Object.assign(r, patch);
    });
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!doc) return;
    const clean = storyboardSchema.parse(doc);
    const snapshot = await json<{ document: Storyboard; revision: string }>(
      base,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: clean, revision }),
      },
    );
    setRevision(snapshot.revision);
    setSaved(JSON.stringify(doc));
    setNotice("Storyboard saved.");
  }
  function addSet(copy?: StorySet) {
    const id = storyId("set");
    editScene((s) => {
      const next = copy
        ? structuredClone(copy)
        : newSet(id, `Set ${s.sets.length + 1}`);
      next.id = id;
      if (copy) {
        next.name += " copy";
        next.representations.forEach((r) => (r.id = storyId("rep")));
        next.start =
          copy.start !== null && copy.duration !== null
            ? copy.start + copy.duration
            : null;
      }
      s.sets.push(next);
    });
    setSetId(id);
    setRepId("");
  }
  function reorder(delta: number) {
    editScene((s) => {
      const i = s.sets.findIndex((x) => x.id === set?.id),
        j = i + delta;
      if (i >= 0 && j >= 0 && j < s.sets.length)
        [s.sets[i], s.sets[j]] = [s.sets[j], s.sets[i]];
    });
  }
  async function importReference() {
    const response = await fetch(`/api/media/${manifest.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: media.revision, type: "image" }),
    });
    if (!response.ok) throw new Error(await response.text());
    await refreshContext();
  }
  function addReference(assetId: string) {
    const asset = media.assets.find((a) => a.id === assetId);
    if (!asset || doc?.references.some((r) => r.assetId === assetId)) return;
    edit((d) =>
      d.references.push({
        id: storyId("ref"),
        assetId,
        name: asset.displayName,
        category: "identity",
        description: "",
      }),
    );
  }
  function anchor(cue: SubtitleCue, words = false) {
    const selected = words
      ? (cue.words?.filter((w) => wordIds.includes(w.id)) ?? [])
      : [];
    if (words && !selected.length) return;
    editSet((s) =>
      s.anchors.push({
        cueId: cue.id,
        wordIds: selected.map((w) => w.id),
        text: selected.length
          ? selected.map((w) => w.text).join(" ")
          : cue.text,
        start: selected.length
          ? Math.min(...selected.map((w) => w.start))
          : cue.start,
        end: selected.length
          ? Math.max(...selected.map((w) => w.end))
          : cue.end,
        status: cue.status,
        sourceRevision: timing.revision,
        actionTime: null,
        instruction: "",
      }),
    );
  }
  function seek(value: number) {
    if (!audio.current || !source) return;
    const bounded = Math.max(
      source.start,
      Math.min(source.start + source.duration, value),
    );
    audio.current.currentTime = bounded - source.start + source.sourceStart;
    setTime(bounded);
  }
  if (!doc)
    return <div className="sb-loading">{error || "Loading storyboard…"}</div>;
  return (
    <section className="storyboard" aria-label="Storyboard Designer">
      <header className="sb-header">
        <div>
          <strong>Storyboard Designer</strong>
          <small>
            {manifest.name} · {dirty ? "Unsaved changes" : "Saved"}
          </small>
        </div>
        <button
          disabled={busy || built || !dirty}
          onClick={() => void run(save)}
        >
          Save storyboard
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (
              !dirty ||
              window.confirm(
                "Discard the local storyboard draft and reload the saved version?",
              )
            )
              void run(() => load());
          }}
        >
          Reload
        </button>
        <button
          disabled={busy || !doc.scenes.length}
          onClick={() =>
            void run(async () => {
              if (dirty) await save();
              const latest = await json<Timing>(`${base}/timing`);
              const text =
                directorBrief(doc, format) + "\n\n" + timingContextText(latest);
              if (window.floxBowWindows)
                await window.floxBowWindows.copyStoryboardContext(text);
              else await navigator.clipboard.writeText(text);
              setNotice(
                "Full story copied. Use Export Full Context for images.",
              );
            })
          }
        >
          Copy Full Story
        </button>
        <button
          disabled={busy || !doc.scenes.length}
          onClick={() =>
            void run(async () => {
              if (dirty) await save();
              await exportStoryboard(
                doc,
                format,
                await json<Timing>(`${base}/timing`),
              );
              setNotice("Context package exported.");
            })
          }
        >
          Export Full Context
        </button>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(doc, null, 2)], {
                type: "application/json",
              }),
              `${manifest.id}-storyboard-draft.json`,
            )
          }
        >
          Export draft
        </button>
        <button
          disabled={!history.current.length || busy}
          onClick={() => {
            const prev = history.current.pop();
            if (prev) {
              future.current.push(doc);
              setDoc(prev);
            }
          }}
        >
          Undo
        </button>
        <button
          disabled={!future.current.length || busy}
          onClick={() => {
            const next = future.current.pop();
            if (next) {
              history.current.push(doc);
              setDoc(next);
            }
          }}
        >
          Redo
        </button>
      </header>
      {(error || notice || built) && (
        <div className="sb-feedback" role={error ? "alert" : "status"}>
          {error ||
            notice ||
            "Built snapshot: storyboard is read-only. Open the live workspace to edit."}
        </div>
      )}
      <div className="sb-layout">
        <aside className="sb-left">
          <h3>Scenes</h3>
          <button
            disabled={built || busy}
            onClick={() => {
              const id = storyId("scene");
              edit((d) =>
                d.scenes.push(newScene(id, `Scene ${d.scenes.length + 1}`)),
              );
              setSceneId(id);
              setSetId("");
            }}
          >
            Create Scene
          </button>
          {doc.scenes.map((s) => (
            <button
              className={scene?.id === s.id ? "selected" : ""}
              key={s.id}
              onClick={() => {
                setSceneId(s.id);
                setSetId("");
                setRepId("");
              }}
            >
              {s.name}
            </button>
          ))}
          {scene && (
            <>
              <h3>Sets</h3>
              <button onClick={() => addSet()}>Create Set</button>
              <button disabled={!set} onClick={() => addSet(set)}>
                Duplicate selected Set
              </button>
              <button
                disabled={!scene.sets.length}
                onClick={() => addSet(scene.sets.at(-1))}
              >
                Continue last Set
              </button>
              {scene.sets.map((s, i) => (
                <button
                  key={s.id}
                  className={set?.id === s.id ? "selected" : ""}
                  onClick={() => {
                    setSetId(s.id);
                    setRepId("");
                  }}
                >
                  {i + 1}. {s.name}
                  <small>
                    {s.start ?? "?"}s · {s.duration ?? "?"}s
                  </small>
                </button>
              ))}
            </>
          )}
          <h3>Reference library</h3>
          <button
            disabled={built || busy}
            onClick={() => void run(importReference)}
          >
            Import PNG reference
          </button>
          <select
            aria-label="Use registered image"
            value=""
            onChange={(e) => addReference(e.target.value)}
          >
            <option value="">Use registered image…</option>
            {media.assets
              .filter((a) => a.type === "image")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({a.status})
                </option>
              ))}
          </select>
          {doc.references.map((r) => (
            <details key={r.id}>
              <summary>{r.name}</summary>
              <img
                className="sb-thumbnail"
                src={`${base}/media/${r.assetId}`}
                alt={r.name}
              />
              <Field
                label="Reference name"
                value={r.name}
                onChange={(value) =>
                  edit((d) => {
                    d.references.find((x) => x.id === r.id)!.name = value;
                  })
                }
              />
              <Field
                label="Category"
                value={r.category}
                onChange={(value) =>
                  edit((d) => {
                    d.references.find((x) => x.id === r.id)!.category = value;
                  })
                }
              />
              <Field
                label="Reference notes"
                multiline
                value={r.description}
                onChange={(value) =>
                  edit((d) => {
                    d.references.find((x) => x.id === r.id)!.description =
                      value;
                  })
                }
              />
              <button
                disabled={!set}
                onClick={() =>
                  editSet((s) => {
                    if (!s.referenceIds.includes(r.id))
                      s.referenceIds.push(r.id);
                  })
                }
              >
                Link to Set
              </button>
              <button
                disabled={!object}
                onClick={() =>
                  editScene((s) => {
                    const o = s.objects.find((o) => o.id === object?.id)!;
                    if (!o.referenceIds.includes(r.id))
                      o.referenceIds.push(r.id);
                  })
                }
              >
                Link to selected object
              </button>
              <button
                disabled={!set}
                onClick={() => {
                  const id = storyId("rep");
                  editSet((s) =>
                    s.representations.push({
                      id,
                      setId: s.id,
                      objectId: null,
                      referenceId: r.id,
                      kind: "reference",
                      coordinateSpace: "composition-percent",
                      anchor: "top-left",
                      rotation: 0,
                      zOrder: s.representations.length,
                      spatialNote: "",
                      x: 10,
                      y: 10,
                      width: 30,
                      height:
                        ((30 * manifest.width) / manifest.height) *
                        ((images[r.id]?.naturalHeight ?? 1) /
                          (images[r.id]?.naturalWidth ?? 1)),
                      points: [],
                      color: "#24334b",
                      thickness: 3,
                      text: "",
                      visible: true,
                      opacity: 1,
                      locked: false,
                      pose: "",
                      instructions:
                        "Reference appearance is guidance, not mandated final artwork",
                      motion: "",
                    }),
                  );
                  setRepId(id);
                }}
              >
                Place reference on canvas
              </button>
              <button
                disabled={!set}
                onClick={() =>
                  editSet((s) => {
                    s.tracing = { referenceId: r.id, opacity: 0.25 };
                  })
                }
              >
                Trace beneath sketch
              </button>
            </details>
          ))}
        </aside>
        <main className="sb-center">
          {set ? (
            <>
              <div className="sb-set-title">
                <h2>{set.name}</h2>
                <button onClick={() => reorder(-1)}>Earlier</button>
                <button onClick={() => reorder(1)}>Later</button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${set.name}? Undo remains available.`,
                      )
                    )
                      editScene((s) => {
                        s.sets = s.sets.filter((x) => x.id !== set.id);
                      });
                  }}
                >
                  Delete Set
                </button>
              </div>
              <StoryboardCanvas
                images={images}
                key={set.id}
                set={set}
                width={manifest.width}
                height={manifest.height}
                selected={repId}
                select={setRepId}
                change={(representations) =>
                  editSet((s) => {
                    s.representations = representations;
                  })
                }
                tracingUrl={
                  set.tracing
                    ? `${base}/media/${doc.references.find((r) => r.id === set.tracing?.referenceId)?.assetId}`
                    : undefined
                }
              />
              {set.tracing && (
                <label>
                  Tracing opacity (editor only)
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={set.tracing.opacity}
                    onChange={(e) =>
                      editSet((s) => {
                        s.tracing!.opacity = +e.target.value;
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      editSet((s) => {
                        s.tracing = null;
                      })
                    }
                  >
                    Remove tracing aid
                  </button>
                </label>
              )}
              <div className="sb-audio">
                <h3>Audio & subtitle context</h3>
                <small>
                  Uses the saved Timeline. Save Timeline edits, then refresh.
                  All times below are project seconds.
                </small>
                <button onClick={() => void run(refreshContext)}>
                  Refresh saved timing
                </button>
                {source ? (
                  <>
                    <select
                      aria-label="Storyboard audio source"
                      value={source.clipId}
                      onChange={(e) => {
                        audio.current?.pause();
                        setAudioId(e.target.value);
                      }}
                    >
                      {timing.audio.map((a) => (
                        <option key={a.clipId} value={a.clipId}>
                          {a.clipId}
                        </option>
                      ))}
                    </select>
                    <audio
                      ref={audio}
                      controls
                      src={`${base}/media/${source.assetId}`}
                      onTimeUpdate={() => {
                        const t =
                          audio.current!.currentTime -
                          source.sourceStart +
                          source.start;
                        setTime(t);
                        if (t >= source.start + source.duration)
                          audio.current!.pause();
                        if (
                          set.start !== null &&
                          set.duration !== null &&
                          t >= set.start + set.duration
                        )
                          audio.current!.pause();
                      }}
                    />
                    <span>{time.toFixed(2)}s</span>
                    <button
                      disabled={set.start === null}
                      onClick={() =>
                        void run(async () => {
                          seek(set.start!);
                          await audio.current!.play();
                        })
                      }
                    >
                      Replay Set interval
                    </button>
                  </>
                ) : (
                  <p>
                    No saved soundtrack or separated video audio. Add one in the
                    editor.
                  </p>
                )}
                {timing.cues
                  .filter(
                    (c) =>
                      set.start === null ||
                      set.duration === null ||
                      (c.start < set.start + set.duration && c.end > set.start),
                  )
                  .map((c) => (
                    <div className="sb-cue" key={c.id}>
                      <button onClick={() => seek(c.start)}>
                        {c.start.toFixed(2)}s
                      </button>{" "}
                      {c.text} <small>{c.status}</small>
                      <button onClick={() => anchor(c)}>Link phrase</button>
                      {c.wordTimingStatus === "matches-text" ? (
                        <>
                          <div>
                            {c.words?.map((w) => (
                              <label className="sb-word" key={w.id}>
                                <input
                                  type="checkbox"
                                  checked={wordIds.includes(w.id)}
                                  onChange={(e) =>
                                    setWordIds((ids) =>
                                      e.target.checked
                                        ? [...ids, w.id]
                                        : ids.filter((id) => id !== w.id),
                                    )
                                  }
                                />
                                {w.text} {w.start.toFixed(2)}s
                              </label>
                            ))}
                          </div>
                          <button onClick={() => anchor(c, true)}>
                            Link selected words
                          </button>
                        </>
                      ) : (
                        <small>
                          Word timing {c.wordTimingStatus}; no word precision
                          inferred.
                        </small>
                      )}
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="sb-empty">
              <h2>Tell the story in rough sketches</h2>
              <p>
                Create a Scene, then a Set. Each Set is one story beat inside
                the scene.
              </p>
            </div>
          )}
        </main>
        <aside className="sb-right">
          {scene && (
            <>
              <details open>
                <summary>Scene direction</summary>
                <Field
                  label="Scene name"
                  value={scene.name}
                  onChange={(name) =>
                    editScene((s) => {
                      s.name = name;
                    })
                  }
                />
                <Field
                  label="Narrative"
                  multiline
                  value={scene.description}
                  onChange={(description) =>
                    editScene((s) => {
                      s.description = description;
                    })
                  }
                />
                <Field
                  label="Creative directions"
                  multiline
                  value={scene.directions}
                  onChange={(directions) =>
                    editScene((s) => {
                      s.directions = directions;
                    })
                  }
                />
                <Field
                  label="Style guidance"
                  multiline
                  value={scene.style}
                  onChange={(style) =>
                    editScene((s) => {
                      s.style = style;
                    })
                  }
                />
                <TimeField
                  label="Scene estimate (seconds)"
                  value={scene.duration}
                  onChange={(duration) =>
                    editScene((s) => {
                      s.duration = duration;
                    })
                  }
                />
                <label>
                  Link existing Timeline scene
                  <select
                    value={scene.timelineSceneId ?? ""}
                    onChange={(e) =>
                      editScene((s) => {
                        s.timelineSceneId = e.target.value || null;
                      })
                    }
                  >
                    <option value="">Unlinked</option>
                    {timing.scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <small>
                  Storyboard estimates never change Timeline timing.
                </small>
              </details>
              {set && (
                <>
                  <details open>
                    <summary>Set direction & timing</summary>
                    <Field
                      label="Set name"
                      value={set.name}
                      onChange={(name) =>
                        editSet((s) => {
                          s.name = name;
                        })
                      }
                    />
                    <Field
                      label="What happens"
                      multiline
                      value={set.description}
                      onChange={(description) =>
                        editSet((s) => {
                          s.description = description;
                        })
                      }
                    />
                    <TimeField
                      label="Set start (seconds)"
                      value={set.start}
                      onChange={(start) =>
                        editSet((s) => {
                          s.start = start;
                        })
                      }
                    />
                    <TimeField
                      label="Set duration (seconds)"
                      value={set.duration}
                      onChange={(duration) =>
                        editSet((s) => {
                          s.duration = duration;
                        })
                      }
                    />
                    <Field
                      label="Timing flexibility / constraints"
                      value={set.timing}
                      onChange={(timing) =>
                        editSet((s) => {
                          s.timing = timing;
                        })
                      }
                    />
                    <Field
                      label="Composition / staging notes"
                      multiline
                      value={set.compositionNote}
                      onChange={(compositionNote) =>
                        editSet((s) => {
                          s.compositionNote = compositionNote;
                        })
                      }
                    />
                    <Field
                      label="Camera / framing notes"
                      multiline
                      value={set.cameraNote}
                      onChange={(cameraNote) =>
                        editSet((s) => {
                          s.cameraNote = cameraNote;
                        })
                      }
                    />
                    <Field
                      label="Transition from previous Set"
                      multiline
                      value={set.transition}
                      onChange={(transition) =>
                        editSet((s) => {
                          s.transition = transition;
                        })
                      }
                    />
                    {timingWarnings(scene).map((w) => (
                      <small className="sb-warning" key={w}>
                        {w}
                      </small>
                    ))}
                    {set.referenceIds.map((id) => (
                      <button
                        key={id}
                        onClick={() =>
                          editSet((s) => {
                            s.referenceIds = s.referenceIds.filter(
                              (x) => x !== id,
                            );
                          })
                        }
                      >
                        Unlink {doc.references.find((r) => r.id === id)?.name}
                      </button>
                    ))}
                  </details>
                  <details open>
                    <summary>Objects & layers</summary>
                    {set.representations.map((r, i) => (
                      <button
                        key={r.id}
                        className={r.id === repId ? "selected" : ""}
                        onClick={() => setRepId(r.id)}
                      >
                        {i + 1}.{" "}
                        {scene.objects.find((o) => o.id === r.objectId)?.name ??
                          r.kind}{" "}
                        {r.visible ? "" : "(hidden)"}
                      </button>
                    ))}
                    {rep && (
                      <>
                        <label>
                          Object identity
                          <select
                            value={rep.objectId ?? ""}
                            onChange={(e) =>
                              editRep({ objectId: e.target.value || null })
                            }
                          >
                            <option value="">Unassigned drawing</option>
                            {scene.objects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() => {
                            const name = `Object ${scene.objects.length + 1}`;
                            const id = storyId("obj");
                            editScene((s) => {
                              s.objects.push({
                                id,
                                name,
                                category: "",
                                description: "",
                                instructions: "",
                                referenceIds: [],
                              });
                              s.sets
                                .find((s) => s.id === set.id)!
                                .representations.find(
                                  (r) => r.id === rep.id,
                                )!.objectId = id;
                            });
                          }}
                        >
                          Create object from sketch
                        </button>
                        <button
                          onClick={() => editRep({ visible: !rep.visible })}
                        >
                          {rep.visible ? "Hide" : "Show"} in this Set
                        </button>
                        <button
                          onClick={() => editRep({ locked: !rep.locked })}
                        >
                          {rep.locked ? "Unlock" : "Lock"}
                        </button>
                        <button
                          onClick={() =>
                            editSet((s) => {
                              const copy = structuredClone(rep);
                              copy.id = storyId("rep");
                              copy.x += 20;
                              s.representations.push(copy);
                            })
                          }
                        >
                          Duplicate drawing
                        </button>
                        <button
                          onClick={() =>
                            editSet((s) => {
                              s.representations = s.representations.filter(
                                (r) => r.id !== rep.id,
                              );
                            })
                          }
                        >
                          Clear selected drawing
                        </button>
                        <button
                          onClick={() =>
                            editSet((s) => {
                              s.representations = [
                                ...s.representations.filter(
                                  (r) => r.id !== rep.id,
                                ),
                                rep,
                              ];
                            })
                          }
                        >
                          Bring to front
                        </button>
                        <div className="sb-spatial">
                          <small>
                            Composition percentages. Top-left anchor; rotation
                            around bounds center.
                          </small>
                          {(
                            [
                              "x",
                              "y",
                              "width",
                              "height",
                              "rotation",
                              "opacity",
                            ] as const
                          ).map((key) => (
                            <label key={key}>
                              {key === "opacity"
                                ? "Sketch / reference editor opacity (not final animation)"
                                : key}
                              <input
                                type="number"
                                step="0.1"
                                value={rep[key]}
                                onChange={(e) =>
                                  editRep({ [key]: +e.target.value })
                                }
                              />
                            </label>
                          ))}
                          <Field
                            label="Spatial note"
                            value={rep.spatialNote}
                            onChange={(spatialNote) => editRep({ spatialNote })}
                          />
                        </div>
                        <Field
                          label="Pose / expression"
                          multiline
                          value={rep.pose}
                          onChange={(pose) => editRep({ pose })}
                        />
                        <Field
                          label="Sketch instructions"
                          multiline
                          value={rep.instructions}
                          onChange={(instructions) => editRep({ instructions })}
                        />
                        <Field
                          label="Motion hint: entry, exit, start/end, duration, behavior"
                          multiline
                          value={rep.motion}
                          onChange={(motion) => editRep({ motion })}
                        />
                      </>
                    )}
                    {object && (
                      <>
                        <Field
                          label="Object name"
                          value={object.name}
                          onChange={(name) =>
                            editScene((s) => {
                              s.objects.find((o) => o.id === object.id)!.name =
                                name;
                            })
                          }
                        />
                        <Field
                          label="Object category"
                          value={object.category}
                          onChange={(category) =>
                            editScene((s) => {
                              s.objects.find(
                                (o) => o.id === object.id,
                              )!.category = category;
                            })
                          }
                        />
                        <Field
                          label="Object description"
                          multiline
                          value={object.description}
                          onChange={(description) =>
                            editScene((s) => {
                              s.objects.find(
                                (o) => o.id === object.id,
                              )!.description = description;
                            })
                          }
                        />
                        <Field
                          label="Object AI notes"
                          multiline
                          value={object.instructions}
                          onChange={(instructions) =>
                            editScene((s) => {
                              s.objects.find(
                                (o) => o.id === object.id,
                              )!.instructions = instructions;
                            })
                          }
                        />
                        {object.referenceIds.map((id) => (
                          <small key={id}>
                            Appearance:{" "}
                            {doc.references.find((r) => r.id === id)?.name}
                          </small>
                        ))}
                      </>
                    )}
                    <h4>Reuse a scene object</h4>
                    {scene.objects.map((o) => (
                      <div key={o.id}>
                        <strong>{o.name}</strong>
                        <button
                          onClick={() => {
                            const source = scene.sets
                              .flatMap((s) => s.representations)
                              .find((r) => r.objectId === o.id);
                            if (!source) return;
                            editSet((s) => {
                              s.representations.push({
                                ...structuredClone(source),
                                id: storyId("rep"),
                                visible: true,
                                locked: false,
                              });
                            });
                          }}
                        >
                          Reuse drawing
                        </button>
                        <button
                          onClick={() => {
                            const id = storyId("rep");
                            editSet((s) =>
                              s.representations.push({
                                id,
                                objectId: o.id,
                                setId: set.id,
                                coordinateSpace: "composition-percent",
                                anchor: "top-left",
                                rotation: 0,
                                zOrder: s.representations.length,
                                spatialNote: "",
                                referenceId: null,
                                kind: "rectangle",
                                x: 10,
                                y: 10,
                                width: 10,
                                height: 15,
                                points: [],
                                color: "#24334b",
                                thickness: 4,
                                text: "",
                                visible: true,
                                locked: false,
                                opacity: 1,
                                pose: "New pose — replace or reshape this placeholder",
                                instructions: "",
                                motion: "",
                              }),
                            );
                            setRepId(id);
                          }}
                        >
                          Same object, new sketch
                        </button>
                      </div>
                    ))}
                  </details>
                  <details>
                    <summary>
                      Saved timing anchors ({set.anchors.length})
                    </summary>
                    {set.anchors.map((a, i) => (
                      <div key={i}>
                        <p>
                          {a.text} · {a.start}–{a.end}s · {a.status}
                        </p>
                        {a.sourceRevision !== timing.revision && (
                          <small className="sb-warning">
                            Saved Timeline changed; review this anchor.
                          </small>
                        )}
                        <TimeField
                          label="Intended action time (separate from audio)"
                          value={a.actionTime}
                          onChange={(value) =>
                            editSet((s) => {
                              s.anchors[i].actionTime = value;
                            })
                          }
                        />
                        <Field
                          label="Action / timing instruction"
                          value={a.instruction}
                          onChange={(value) =>
                            editSet((s) => {
                              s.anchors[i].instruction = value;
                            })
                          }
                        />
                        <button
                          onClick={() =>
                            editSet((s) => {
                              s.anchors.splice(i, 1);
                            })
                          }
                        >
                          Remove anchor
                        </button>
                      </div>
                    ))}
                  </details>
                </>
              )}
              <details>
                <summary>Import Director Brief</summary>
                <textarea
                  aria-label="External Director brief"
                  placeholder="Paste the external Director’s plan. Original instructions remain separate."
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                />
                <button
                  disabled={!briefText.trim()}
                  onClick={() => {
                    edit((d) => {
                      d.briefs.push({
                        id: storyId("brief"),
                        sceneId: scene.id,
                        text: briefText,
                        sourceFingerprint: sceneFingerprint(d, scene),
                        approved: false,
                      });
                    });
                    setBriefText("");
                  }}
                >
                  Import as new version
                </button>
                {doc.briefs
                  .filter((b) => b.sceneId === scene.id)
                  .map((b, i) => (
                    <div key={b.id}>
                      <strong>
                        Version {i + 1} ·{" "}
                        {b.sourceFingerprint === sceneFingerprint(doc, scene)
                          ? "current"
                          : "STALE — storyboard changed"}
                      </strong>
                      <pre>{b.text}</pre>
                      <label>
                        <input
                          type="checkbox"
                          checked={b.approved}
                          onChange={(e) =>
                            edit((d) => {
                              d.briefs.find((x) => x.id === b.id)!.approved =
                                e.target.checked;
                            })
                          }
                        />
                        Approved plan
                      </label>
                    </div>
                  ))}
              </details>
            </>
          )}
        </aside>
      </div>
      <footer className="sb-sequence">
        {scene?.sets.map((s, i) => (
          <button
            key={s.id}
            className={s.id === set?.id ? "selected" : ""}
            onClick={() => setSetId(s.id)}
          >
            {i + 1} · {s.name}
            <small>
              {s.start ?? "?"}s →{" "}
              {s.start !== null && s.duration !== null
                ? s.start + s.duration
                : "?"}
              s
            </small>
          </button>
        ))}
      </footer>
    </section>
  );
}
