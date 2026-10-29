import { useEffect, useState } from "react";
import {
  newMotionDefinition,
  readMotionLibrary,
  writeMotionLibrary,
  type MotionDefinition,
} from "./motion-library";
import { copyTextToClipboard } from "./copy-to-clipboard";
import "./motion-library.css";

const copy = <T,>(value: T): T => structuredClone(value);

export function useMotionLibrary() {
  const [library, setLibrary] = useState<MotionDefinition[]>(() => readMotionLibrary());
  useEffect(() => {
    const refresh = () => setLibrary(readMotionLibrary());
    window.addEventListener("floxbow-motion-library-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("floxbow-motion-library-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { library, setLibrary, saveLibrary: writeMotionLibrary };
}

export function MotionLibrary() {
  const { library, setLibrary, saveLibrary } = useMotionLibrary();
  const [selectedId, setSelectedId] = useState(library[0]?.id ?? "");
  const [draft, setDraft] = useState<MotionDefinition | null>(library[0] ? copy(library[0]) : null);
  const [notice, setNotice] = useState("");
  const selected = library.find((item) => item.id === selectedId);

  function select(item: MotionDefinition) {
    setSelectedId(item.id);
    setDraft(copy(item));
    setNotice("");
  }
  function update(patch: Partial<MotionDefinition>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }
  function save() {
    if (!draft) return;
    try {
      const next = library.some((item) => item.id === draft.id)
        ? library.map((item) => item.id === draft.id ? draft : item)
        : [...library, draft];
      const saved = saveLibrary(next);
      setLibrary(saved);
      setDraft(copy(draft));
      setNotice("Motion set saved to your reusable library.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function create(type: MotionDefinition["type"] = "custom") {
    const item = newMotionDefinition(type);
    setLibrary((current) => [...current, item]);
    setSelectedId(item.id);
    setDraft(item);
    setNotice("New motion set. Add its pose ideas, then save it.");
  }
  function duplicate() {
    if (!draft) return;
    const item = { ...copy(draft), id: newMotionDefinition().id, name: `${draft.name} copy`, builtIn: false };
    setLibrary((current) => [...current, item]);
    setSelectedId(item.id);
    setDraft(item);
    setNotice("Copy created. Rename it to make another reusable variation.");
  }
  function remove() {
    if (!draft || draft.builtIn) return;
    const next = library.filter((item) => item.id !== draft.id);
    setLibrary(next);
    saveLibrary(next);
    const first = next[0];
    setSelectedId(first?.id ?? "");
    setDraft(first ? copy(first) : null);
    setNotice("Motion set removed from your library.");
  }
  function addPose() {
    if (!draft) return;
    update({ poses: [...draft.poses, { id: newMotionDefinition().id, name: `pose-${draft.poses.length + 1}`, note: "" }] });
  }
  function updatePose(index: number, patch: Partial<MotionDefinition["poses"][number]>) {
    if (!draft) return;
    update({ poses: draft.poses.map((pose, i) => i === index ? { ...pose, ...patch } : pose) });
  }
  async function copyPrompt() {
    if (!draft) return;
    const text = [
      `Reusable motion set: ${draft.name} (${draft.type})`,
      draft.description,
      `Duration: ${draft.duration ?? "AI may suggest"} seconds; loop: ${draft.loop ? "yes" : "no"}.`,
      `Direction: ${draft.direction || "unspecified"}; view: ${draft.view || "unspecified"}.`,
      draft.poseGuidance,
      "Pose ideas:",
      ...draft.poses.map((pose, i) => `${i + 1}. ${pose.name}${pose.note ? ` — ${pose.note}` : ""}`),
      "Keep the supplied character identity and visual style consistent. Treat these as guidance; suggest additional poses if needed.",
    ].filter(Boolean).join("\n");
    try {
      await copyTextToClipboard(text);
      setNotice("Motion prompt copied. You can use it with any project or AI.");
    } catch {
      setNotice("Clipboard access is unavailable in this window. Open Motion Library in the app shell to copy prompts.");
    }
  }

  return <section className="motion-library" aria-label="Reusable Motion Library">
    <header className="motion-library-header"><div><strong>Motion Library</strong><span>Reusable action sets available across your projects</span></div><button onClick={() => create()}>＋ New motion set</button></header>
    {notice && <div className="motion-library-notice" role="status">{notice}</div>}
    <div className="motion-library-body">
      <aside className="motion-library-list" aria-label="Saved motion sets">
        {library.map((item) => <button key={item.id} className={item.id === selectedId ? "selected" : ""} onClick={() => select(item)}><span>{item.name}</span><small>{item.type} · {item.poses.length} pose ideas</small></button>)}
      </aside>
      {draft ? <main className="motion-library-editor">
        <div className="motion-library-title"><div><small>Reusable motion set</small><h1>{draft.name}</h1></div><div><button onClick={() => void copyPrompt()}>Copy AI prompt</button><button onClick={duplicate}>Duplicate set</button><button className="primary" onClick={save}>Save</button></div></div>
        <div className="motion-library-fields">
          <label>Name<input value={draft.name} onChange={(e) => update({ name: e.target.value })}/></label>
          <label>Action type<select value={draft.type} onChange={(e) => update({ type: e.target.value as MotionDefinition["type"] })}><option value="walk">Walk</option><option value="run">Run</option><option value="jump">Jump</option><option value="dance">Dance</option><option value="idle">Idle</option><option value="custom">Custom</option></select></label>
          <label>Approximate duration<input type="number" min="0.1" step="0.1" value={draft.duration ?? ""} onChange={(e) => update({ duration: e.target.value === "" ? null : +e.target.value })} placeholder="AI can suggest"/></label>
          <label className="motion-loop"><input type="checkbox" checked={draft.loop} onChange={(e) => update({ loop: e.target.checked })}/> Loop by default</label>
          <label>What should this action look like?<textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="Describe the intent in your own words"/></label>
          <label>Pose guidance<textarea value={draft.poseGuidance} onChange={(e) => update({ poseGuidance: e.target.value })} placeholder="Identity, consistency, timing or style guidance"/></label>
          <label>Direction<input value={draft.direction} onChange={(e) => update({ direction: e.target.value })} placeholder="e.g. left to right"/></label>
          <label>View<input value={draft.view} onChange={(e) => update({ view: e.target.value })} placeholder="e.g. side view"/></label>
        </div>
        <div className="motion-poses-heading"><div><strong>Pose ideas</strong><span>Suggestions for an AI; images can be supplied per project later.</span></div><button onClick={addPose}>＋ Add pose</button></div>
        <div className="motion-pose-list">{draft.poses.map((pose, index) => <div className="motion-pose-row" key={pose.id}><span className="motion-pose-index">{index + 1}</span><input aria-label={`Pose ${index + 1} name`} value={pose.name} onChange={(e) => updatePose(index, { name: e.target.value })}/><input aria-label={`Pose ${index + 1} note`} value={pose.note} onChange={(e) => updatePose(index, { note: e.target.value })} placeholder="Pose note"/><button title="Remove pose" aria-label={`Remove pose ${index + 1}`} onClick={() => update({ poses: draft.poses.filter((_, i) => i !== index) })}>×</button></div>)}</div>
        {!draft.builtIn && <button className="motion-delete" onClick={remove}>Remove motion set from library</button>}
      </main> : <main className="motion-library-empty"><h1>Your motion library</h1><p>Create reusable walks, runs, jumps, dances and other action sets. Add them to characters from Storyboard, or copy an action prompt for another project.</p><button onClick={() => create("walk")}>Create a walk set</button></main>}
    </div>
  </section>;
}
