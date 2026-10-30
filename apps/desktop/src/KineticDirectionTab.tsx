import { useEffect, useMemo, useState } from "react";
import {
  FACTORY_PHRASING_SETTINGS,
  analyzeVocalPhrasing,
  comparePhrasing,
  phrasingSettingsSchema,
  type PhrasingAlgorithm,
  type PhrasingInput,
  type PhrasingSettings,
} from "@motion/lyrics-sync/phrasing";
import type { CorrelationCue, MusicLyricsMap, Report } from "./MusicAnalysis";

type Props = {
  projectId: string;
  width: number;
  height: number;
  correlation: MusicLyricsMap;
  report: Report;
  playhead: number;
  seekTo: (time: number) => void;
  stale: boolean;
};

const ALGORITHMS: Array<{ id: PhrasingAlgorithm; label: string; description: string }> = [
  { id: "stretch", label: "Stretch grouping", description: "Separates conservative long-word candidates and groups continuous phrases." },
  { id: "phrase-optimization", label: "Phrase optimization", description: "Balances phrase duration, pauses, punctuation and musical context." },
  { id: "hybrid", label: "Hybrid", description: "Combines phrase optimization with sustained-word candidates." },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(value.message ?? `Request failed (${response.status}).`);
  return value;
}

function phrasingInput(projectId: string, correlation: MusicLyricsMap, report: Report): PhrasingInput {
  return {
    projectId,
    durationSeconds: correlation.durationSeconds,
    lyricsRevision: correlation.sources.lyrics.revision,
    musicRevision: correlation.sources.musicAnalysis.reportRevision,
    ...(report.vocalProfile ? { vocalProfile: report.vocalProfile } : {}),
    cues: correlation.cues.map((cue: CorrelationCue) => ({
      id: cue.id, text: cue.text, start: cue.start, end: cue.end,
      alignment: cue.alignment, energy: cue.energy, beatTimes: cue.beatTimes,
      words: cue.words.map(word => ({ id: word.id, text: word.text, start: word.start, end: word.end, eventIds: word.eventIds, vocalActivityOverlap: word.vocalActivityOverlap })),
    })),
    sections: report.structure.sections,
    events: (report.musicalEvents?.events ?? []).map(event => ({ id: event.id, time: event.time, endTime: event.endTime, category: event.category, source: event.source, intensity: event.intensity, method: event.method })),
  };
}

function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`; }
function round(value: number) { return Number.isFinite(value) ? value.toFixed(2) : "0.00"; }

export function KineticDirectionTab({ projectId, width, height, correlation, report, playhead, seekTo, stale }: Props) {
  const [algorithm, setAlgorithm] = useState<PhrasingAlgorithm>("hybrid");
  const [settings, setSettings] = useState<PhrasingSettings>({ ...FACTORY_PHRASING_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [savedStale, setSavedStale] = useState(false);
  const input = useMemo(() => phrasingInput(projectId, correlation, report), [projectId, correlation, report]);
  const comparison = useMemo(() => comparePhrasing(input, settings), [input, settings]);
  const plan = comparison.plans.find(candidate => candidate.algorithm === algorithm) ?? comparison.plans[2]!;
  const currentGroup = plan.groups.find(group => playhead >= group.start && playhead < group.end) ?? null;
  const nextGroup = plan.groups.find(group => group.start > playhead) ?? null;
  const currentCue = currentGroup ? correlation.cues.find(cue => cue.id === currentGroup.cueId) : null;
  const currentWord = currentCue?.words.find(word => word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end) ?? null;
  const ratio = width / Math.max(1, height);
  const currentMetrics = plan.metrics;
  const factorySettings = JSON.stringify(settings) === JSON.stringify(FACTORY_PHRASING_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    setAlgorithm("hybrid");
    setSettings({ ...FACTORY_PHRASING_SETTINGS });
    setSavedStale(false);
    setNotice("");
    setError("");
    setLoadingSaved(true);
    void requestJson<{ plan: { algorithm: PhrasingAlgorithm; settings: PhrasingSettings } | null; stale: boolean }>(`/api/media/${encodeURIComponent(projectId)}/vocal-phrasing`)
      .then(saved => {
        if (cancelled || !saved.plan) return;
        setSavedStale(saved.stale);
        if (!saved.stale) { setAlgorithm(saved.plan.algorithm); setSettings(phrasingSettingsSchema.parse(saved.plan.settings)); }
        else setNotice("Saved phrase direction uses older music or lyric timing. Save a fresh plan to replace it.");
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const setValue = (key: keyof PhrasingSettings, value: number) => {
    setSettings(current => phrasingSettingsSchema.parse({ ...current, [key]: value }));
    setNotice("Preview updated. Save phrase plan to keep this version in the project.");
    setError("");
  };

  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/media/${encodeURIComponent(projectId)}/vocal-phrasing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ algorithm, settings }) });
      setSavedStale(false);
      setNotice("Vocal analysis and visual phrase plan saved to the project. Subtitle timing was not changed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };

  const activeWords = currentGroup && currentCue ? currentCue.words.filter(word => currentGroup.wordIds.includes(word.id)) : [];
  const stageWidth = `${Math.max(22, Math.min(96, 54 * ratio))}vh`;

  return <section className="vp-tab" aria-label="Kinetic text direction">
    <header className="vp-header"><div><span className="mlm-kicker">03 / KINETIC DIRECTION</span><h3>Phrase grouping &amp; text preview</h3><p>Compare how the same saved lyrics can be grouped for kinetic typography. Word timing remains owned by the Timeline.</p></div>
      <div className="vp-actions"><label>Grouping method<select value={algorithm} disabled={loadingSaved} onChange={event => { setAlgorithm(event.currentTarget.value as PhrasingAlgorithm); setNotice("Preview updated. Save phrase plan to keep this version in the project."); }}><option value="stretch">Stretch grouping</option><option value="phrase-optimization">Phrase optimization</option><option value="hybrid">Hybrid</option></select></label><button className="vp-save" onClick={() => void save()} disabled={saving || loadingSaved || stale}>{saving ? "Saving…" : "Save phrase plan"}</button></div>
    </header>
    {(stale || savedStale) && <div className="vp-alert">Music or lyric timing changed since this plan was saved. The preview uses the current saved correlation; save a new plan to refresh the project artifact.</div>}
    <div className="vp-comparison" aria-label="Compare grouping algorithms">{comparison.plans.map(candidate => { const sample = candidate.groups.find(group => playhead >= group.start && playhead < group.end); return <button key={candidate.algorithm} className={candidate.algorithm === algorithm ? "is-selected" : ""} onClick={() => setAlgorithm(candidate.algorithm)} aria-pressed={candidate.algorithm === algorithm}><strong>{ALGORITHMS.find(item => item.id === candidate.algorithm)?.label}</strong><span>{candidate.metrics.groupCount} groups · {round(candidate.metrics.medianGroupSeconds)}s median</span><em>{sample?.text ?? "No phrase at playhead"}</em></button>; })}</div>
    <div className="vp-layout">
      <div className="vp-preview-column">
        <div className="vp-stage-wrap"><div className="vp-stage" style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${stageWidth})` }}>
          <div className="vp-stage-meta"><span>{width} × {height}</span><span>{formatTime(playhead)}</span></div>
          {currentGroup ? <div className="vp-stage-phrase" key={currentGroup.id} aria-live="polite">{activeWords.map(word => {
            const state = currentWord ? word.id === currentWord.id ? "is-active" : word.start !== null && word.end !== null && word.end <= playhead ? "is-spoken" : "is-upcoming" : word.start !== null && word.end !== null && word.end <= playhead ? "is-spoken" : "is-upcoming";
            return <span key={word.id} className={state} onClick={() => word.start !== null && seekTo(word.start)} title={word.start === null || word.end === null ? "Untimed word" : `${formatTime(word.start)}–${formatTime(word.end)}`}>{word.text} </span>;
          })}</div> : <div className="vp-stage-idle"><strong>{nextGroup ? "No active phrase" : "End of planned lyrics"}</strong>{nextGroup && <span>Next: {nextGroup.text} · {formatTime(nextGroup.start)}</span>}</div>}
          <div className="vp-stage-footer">{currentGroup ? <><span>{formatTime(currentGroup.start)}–{formatTime(currentGroup.end)}</span><span>{currentGroup.confidence} timing</span></> : <span>Text-only direction preview · no motion applied</span>}</div>
        </div></div>
        <div className="vp-current-info"><div><span className="mlm-kicker">CURRENT GROUP</span><strong>{currentGroup?.text ?? (nextGroup ? `Next: ${nextGroup.text}` : "No phrase at this time")}</strong></div><div>{currentGroup?.reasons.map(reason => <span className="vp-reason" key={reason}>{reason}</span>)}</div></div>
      </div>
      <aside className="vp-inspector"><div className="vp-inspector-heading"><span className="mlm-kicker">PLAN SUMMARY</span><strong>{ALGORITHMS.find(item => item.id === algorithm)?.description}</strong></div>
        <div className="vp-metrics"><div><strong>{currentMetrics.groupCount}</strong><span>visual groups</span></div><div><strong>{round(currentMetrics.medianGroupSeconds)}s</strong><span>median duration</span></div><div><strong>{currentMetrics.singleWordGroups}</strong><span>single-word groups</span></div><div><strong>{round(currentMetrics.transitionsPerMinute)}</strong><span>transitions / min</span></div><div><strong>{currentMetrics.sustainedWordsSeparated}</strong><span>held words isolated</span></div><div><strong>{currentMetrics.groupsCrossingVocalPauses}</strong><span>groups crossing pauses</span></div><div><strong>{currentMetrics.shortTransitions}</strong><span>groups under 0.5s</span></div><div><strong>{currentMetrics.estimatedGroups}</strong><span>estimated timing</span></div></div>
        <details className="vp-settings" open><summary>Phrase behavior</summary>
          <Range label="Sustain sensitivity" help="Lower values flag more long-word candidates." value={settings.stretchThreshold} min={1.2} max={6} step={0.1} display={`${round(settings.stretchThreshold)}×`} disabled={loadingSaved} onChange={value => setValue("stretchThreshold", value)}/>
          <Range label="Pause boundary" help="A larger gap tends to split visual phrases." value={settings.pauseSplitSeconds} min={0.05} max={1.5} step={0.01} display={`${round(settings.pauseSplitSeconds)}s`} disabled={loadingSaved} onChange={value => setValue("pauseSplitSeconds", value)}/>
          <Range label="Target group length" help="The planner aims for groups near this duration." value={settings.targetGroupSeconds} min={0.3} max={4} step={0.05} display={`${round(settings.targetGroupSeconds)}s`} disabled={loadingSaved} onChange={value => setValue("targetGroupSeconds", value)}/>
          <Range label="Music influence" help="How much nearby energy and events affect grouping." value={settings.musicInfluence} min={0} max={1} step={0.01} display={`${Math.round(settings.musicInfluence * 100)}%`} disabled={loadingSaved} onChange={value => setValue("musicInfluence", value)}/>
          <details className="vp-advanced"><summary>Advanced settings</summary>
            <Range label="Minimum sustain duration" help="Shorter words are not considered sustain candidates." value={settings.minimumSustainSeconds} min={0.2} max={4} step={0.05} display={`${round(settings.minimumSustainSeconds)}s`} disabled={loadingSaved} onChange={value => setValue("minimumSustainSeconds", value)}/>
            <Range label="Estimated seconds per syllable" help="A rough baseline for candidate detection, not phonetic timing." value={settings.syllableSeconds} min={0.08} max={0.5} step={0.01} display={`${round(settings.syllableSeconds)}s`} disabled={loadingSaved} onChange={value => setValue("syllableSeconds", value)}/>
            <Range label="Minimum normal word baseline" help="Lower bound preventing tiny words from producing extreme ratios." value={settings.minimumWordBaselineSeconds} min={0.05} max={0.5} step={0.01} display={`${round(settings.minimumWordBaselineSeconds)}s`} disabled={loadingSaved} onChange={value => setValue("minimumWordBaselineSeconds", value)}/>
            <Range label="Maximum words per group" help="Hard readability cap for a single visual group." value={settings.maxGroupWords} min={1} max={12} step={1} display={`${settings.maxGroupWords}`} disabled={loadingSaved} onChange={value => setValue("maxGroupWords", value)}/>
            <Range label="Target words per group" help="Preferred word count before readability and duration costs." value={settings.targetWordsPerGroup} min={1} max={8} step={1} display={`${round(settings.targetWordsPerGroup)}`} disabled={loadingSaved} onChange={value => setValue("targetWordsPerGroup", value)}/>
            <Range label="Punctuation influence" help="How strongly punctuation encourages a boundary." value={settings.punctuationInfluence} min={0} max={1} step={0.01} display={`${Math.round(settings.punctuationInfluence * 100)}%`} disabled={loadingSaved} onChange={value => setValue("punctuationInfluence", value)}/>
            <Range label="Punctuation boundary strength" help="Score bias applied when a phrase ends at punctuation." value={settings.punctuationBoundaryStrength} min={0} max={1} step={0.01} display={`${round(settings.punctuationBoundaryStrength)}`} disabled={loadingSaved} onChange={value => setValue("punctuationBoundaryStrength", value)}/>
            <Range label="Duration balance weight" help="How strongly group duration is balanced against the target." value={settings.durationBalanceWeight} min={0} max={2} step={0.01} display={`${round(settings.durationBalanceWeight)}`} disabled={loadingSaved} onChange={value => setValue("durationBalanceWeight", value)}/>
            <Range label="Word-count weight" help="How strongly the planner prefers the target word count." value={settings.wordCountWeight} min={0} max={1} step={0.01} display={`${round(settings.wordCountWeight)}`} disabled={loadingSaved} onChange={value => setValue("wordCountWeight", value)}/>
            <Range label="Pause boundary strength" help="Score bias for splitting at a detected lyric gap." value={settings.pauseBoundaryStrength} min={0} max={2} step={0.01} display={`${round(settings.pauseBoundaryStrength)}`} disabled={loadingSaved} onChange={value => setValue("pauseBoundaryStrength", value)}/>
            <Range label="Event density weight" help="Contribution of nearby music events to the grouping score." value={settings.eventDensityWeight} min={0} max={1} step={0.005} display={`${round(settings.eventDensityWeight)}`} disabled={loadingSaved} onChange={value => setValue("eventDensityWeight", value)}/>
            <Range label="Energy weight" help="Contribution of local energy to the grouping score." value={settings.energyWeight} min={0} max={1} step={0.01} display={`${round(settings.energyWeight)}`} disabled={loadingSaved} onChange={value => setValue("energyWeight", value)}/>
            <Range label="Short-group threshold" help="Groups shorter than this duration receive the penalty below." value={settings.shortGroupThreshold} min={0.1} max={2} step={0.01} display={`${round(settings.shortGroupThreshold)}s`} disabled={loadingSaved} onChange={value => setValue("shortGroupThreshold", value)}/>
            <Range label="Short-group penalty" help="Score penalty for a group under the configured threshold." value={settings.shortGroupPenalty} min={0} max={2} step={0.01} display={`${round(settings.shortGroupPenalty)}`} disabled={loadingSaved} onChange={value => setValue("shortGroupPenalty", value)}/>
          </details>
          <div className="vp-settings-actions"><button onClick={() => { setSettings({ ...FACTORY_PHRASING_SETTINGS }); setNotice("Factory defaults restored in the preview. Save to update the project plan."); setError(""); }} disabled={loadingSaved || factorySettings}>Reset to factory defaults</button><button onClick={() => void save()} disabled={saving || loadingSaved || stale}>{saving ? "Saving…" : "Save phrase plan"}</button></div>
        </details>
        <details className="vp-analysis"><summary>Vocal feature notes · {comparison.analysis.wordFeatures.length} words</summary><ul>{comparison.analysis.unavailable.map(item => <li key={item}>{item}</li>)}</ul><p>Syllables are rough estimates. A long subtitle interval is only a sustain candidate; it is not proof of a held vowel. No lyric timing is modified here.</p></details>
      </aside>
    </div>
    <footer className={`vp-status${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice || (stale ? "Refresh Music × Lyrics correlation before saving this plan." : "Preview uses the project canvas ratio. Choose a method and adjust its behavior, then save the plan separately from Timeline lyrics.")}</footer>
  </section>;
}

function Range({ label, help, value, min, max, step, display, disabled, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; display: string; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="vp-range"><span><strong>{label}</strong><output>{display}</output></span><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.currentTarget.value))}/><small>{help}</small></label>;
}
