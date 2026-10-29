import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import { MusicLyricsMapView } from "./MusicLyricsMapView";
import "./music-analysis.css";

export type AudioAsset = { id: string; displayName: string; status: string; type: string };
export type Point = { time: number; value: number };
export type MusicEventSource = "drums" | "bass" | "vocals" | "other" | "mix";
export type MusicEvent = { id: string; time: number; endTime?: number; category: string; source: MusicEventSource; intensity?: number; method: string };
export type MusicEventGroup = { id: string; start: number; end: number; source: "drums" | "bass" | "other"; count: number; eventIds: string[]; pattern: string };
export type Report = {
  schemaVersion: 1 | 2; projectId: string; assetId: string;
  asset: { displayName: string; sha256: string; sizeBytes: number; modifiedAt: string };
  analyzedAt: string; durationSeconds: number; status: "complete" | "partial";
  provenance: { structure: { status: "available" | "unavailable"; engine?: string; version?: string; device?: string; reason?: string }; dsp: { status: "available" | "partial"; engine: string; reason?: string } };
  structure: { bpm: number | null; beats: number[]; downbeats: number[]; beatPositions: number[]; sections: Array<{ start: number; end: number; label: string }> };
  dsp: { sampleRate: number; channels: number; waveform: number[]; energy: Point[]; accents: Array<{ time: number; strength: number }> };
  musicalEvents?: { status: "available" | "partial" | "unavailable"; method: string; stemsReused: boolean; sources: Record<"drums" | "bass" | "vocals" | "other", "available" | "unavailable">; events: MusicEvent[]; groups: MusicEventGroup[]; counts: Record<"drums" | "bass" | "vocals" | "other" | "mix", number>; instrumentRecognition: { drumLabels: string; otherInstruments: string }; reason?: string };
  performance?: { wallSeconds: number; peakWorkingSetMB: number | null };
};
export type CorrelationWord = { id: string; text: string; start: number | null; end: number | null; beatOffsetSeconds: number | null; eventIds: string[]; preWordCueIds: string[]; vocalActivityOverlap: boolean | null };
export type CorrelationCue = { id: string; text: string; start: number; end: number; alignment: { status: string; wordTimingSource?: string; timingStatus: string }; section: string | null; beatTimes: number[]; downbeatTimes: number[]; eventIds: string[]; energy: { mean: number | null; peak: number | null }; words: CorrelationWord[] };
export type MusicLyricsMap = {
  status: "complete" | "partial";
  durationSeconds: number;
  unavailable: string[];
  sources: { lyrics: { revision: string; timedCueCount: number; untimedWordCount: number } };
  sections: Array<{ start: number; end: number; label: string }>;
  events: Array<{ id: string; time: number; endTime?: number; category: string; source: MusicEventSource; intensity?: number; method: string; sourceRef: string }>;
  phrases: Array<{ id: string; cueIds: string[]; start: number; end: number; text: string; sectionLabels: string[]; eventIds: string[] }>;
  cues: CorrelationCue[];
  compositeCues: Array<{ id: string; time: number; eventIds: string[]; sources: string[]; label: string }>;
};
export type DirectorBrief = { kind: "floxBow-director-brief"; durationSeconds: number; phrases: Array<{ id: string; start: number; end: number; text: string; sectionLabels: string[]; energyMean: number | null; dominantEvents: Array<{ time: number; source: string; category: string; eventId: string }>; beatAnchors: number[]; detailRef: string }> };
export type CorrelationResponse = { map: MusicLyricsMap | null; brief: DirectorBrief | null; stale: boolean };
export type Job = { jobId: string; status: "queued" | "running" | "complete" | "failed" | "canceled"; stage: string; message: string; error?: string };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? `Request failed (${response.status}).`);
  return data;
}

export function MusicAnalysis({ manifest, active }: { manifest: ProjectManifest; active: boolean }) {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [correlation, setCorrelation] = useState<MusicLyricsMap | null>(null);
  const [directorBrief, setDirectorBrief] = useState<DirectorBrief | null>(null);
  const [correlationStale, setCorrelationStale] = useState(false);
  const [correlationBusy, setCorrelationBusy] = useState(false);
  const [correlationZoom, setCorrelationZoom] = useState(40);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const eventStopTimer = useRef<number | null>(null);
  const [visibleSources, setVisibleSources] = useState<Record<"drums" | "bass" | "vocals" | "other" | "mix", boolean>>({ drums: true, bass: true, vocals: true, other: true, mix: true });
  const [playhead, setPlayhead] = useState(0);
  const base = `/api/media/${encodeURIComponent(manifest.id)}/music-analysis`;
  const correlationBase = `/api/media/${encodeURIComponent(manifest.id)}/music-lyrics-map`;
  const busy = job?.status === "queued" || job?.status === "running";

  const load = useCallback(async () => {
    setError("");
    try {
      const [media, saved, mapped] = await Promise.all([
        json<{ assets: AudioAsset[] }>(`/api/media/${encodeURIComponent(manifest.id)}`),
        json<{ report: Report | null }>(base),
        json<CorrelationResponse>(correlationBase),
      ]);
      const audioAssets = media.assets.filter(asset => asset.type === "audio" && asset.status === "ready");
      setAssets(audioAssets);
      setReport(saved.report);
      setCorrelation(mapped.map);
      setDirectorBrief(mapped.brief);
      setCorrelationStale(mapped.stale);
      setSelectedAssetId(current => current && audioAssets.some(asset => asset.id === current) ? current : saved.report?.assetId ?? audioAssets[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [base, correlationBase, manifest.id]);

  const buildCorrelation = useCallback(async () => {
    setCorrelationBusy(true);
    try {
      const result = await json<CorrelationResponse>(correlationBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setCorrelation(result.map);
      setDirectorBrief(result.brief);
      setCorrelationStale(result.stale);
      setNotice("Full-song Music × Lyrics map and Director Brief saved to the project.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setCorrelationBusy(false); }
  }, [correlationBase]);

  useEffect(() => { if (active) void load(); }, [active, load]);

  const pollJob = useCallback(async (jobId: string, signal: AbortSignal) => {
    while (!signal.aborted) {
      const next = await json<Job>(`${base}/jobs/${encodeURIComponent(jobId)}`);
      setJob(next);
      setNotice(next.message);
      if (["complete", "failed", "canceled"].includes(next.status)) {
        if (next.status === "complete") { await load(); await buildCorrelation(); }
        if (next.status === "failed") setError(next.error ?? next.message);
        return;
      }
      await new Promise<void>(resolve => window.setTimeout(resolve, 850));
    }
  }, [base, buildCorrelation, load]);

  useEffect(() => {
    if (!active || !busy || !job?.jobId) return;
    const controller = new AbortController();
    void pollJob(job.jobId, controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => controller.abort();
  }, [active, busy, job?.jobId, pollJob]);

  const analyze = async () => {
    setError("");
    setNotice("Starting music analysis…");
    try {
      const started = await json<{ jobId: string }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: selectedAssetId }) });
      setJob({ jobId: started.jobId, status: "queued", stage: "queued", message: "Preparing analysis…" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      const result = await json<Job>(`${base}/jobs/${encodeURIComponent(job.jobId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      setJob(result);
      setNotice(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const currentAsset = assets.find(asset => asset.id === selectedAssetId);
  const reportMatchesSelection = !report || report.assetId === selectedAssetId;
  const audioUrl = currentAsset ? `/api/media/${encodeURIComponent(manifest.id)}/assets/${encodeURIComponent(currentAsset.id)}/stream` : "";
  const duration = report?.durationSeconds ?? 0;
  const reportComplete = report?.status === "complete" && report.musicalEvents?.status === "available";
  useEffect(() => {
    if (!active) return;
    const toggleSoundtrack = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) return;
      if (!audioRef.current || !reportMatchesSelection) return;
      event.preventDefault();
      event.stopPropagation();
      if (audioRef.current.paused) void audioRef.current.play().catch(reason => setError(reason instanceof Error ? reason.message : "Audio playback could not start."));
      else audioRef.current.pause();
    };
    window.addEventListener("keydown", toggleSoundtrack, true);
    return () => window.removeEventListener("keydown", toggleSoundtrack, true);
  }, [active, reportMatchesSelection]);
  const seekTo = (time: number) => {
    const bounded = Math.max(0, Math.min(duration, time));
    if (audioRef.current) audioRef.current.currentTime = bounded;
    setPlayhead(bounded);
  };
  const playEvent = (event: MusicEvent) => {
    if (!audioRef.current || !reportMatchesSelection) return;
    if (eventStopTimer.current !== null) window.clearTimeout(eventStopTimer.current);
    audioRef.current.currentTime = event.time;
    setPlayhead(event.time);
    void audioRef.current.play();
    const windowSeconds = event.endTime ? Math.min(8, Math.max(1.2, event.endTime - event.time + 0.5)) : 2.5;
    eventStopTimer.current = window.setTimeout(() => audioRef.current?.pause(), windowSeconds * 1000);
  };
  const downloadReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "music-analysis.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="music-analysis">
    <header className="ma-header"><div><span className="ma-eyebrow">PROJECT SETUP · MUSIC ANALYSIS</span><h1>Analyze the soundtrack</h1><p>One synchronized view connects the full song, its structure, sound events, and saved lyrics.</p></div>
      <div className="ma-actions"><label>Audio<select value={selectedAssetId} onChange={event => setSelectedAssetId(event.currentTarget.value)} disabled={busy || !assets.length}><option value="">Choose registered audio…</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.displayName}</option>)}</select></label><button className="ma-primary" onClick={() => void analyze()} disabled={!selectedAssetId || busy}>{busy ? "Analyzing…" : "Analyze Music"}</button>{busy && <button onClick={() => void cancel()}>Cancel</button>}</div>
    </header>
    {(notice || error) && <div className={`ma-notice${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</div>}
    {busy && <div className="ma-progress" role="status"><span className="ma-progress-dot"/><div><strong>{job?.message}</strong><small>{job?.stage === "engine" ? "The first analysis can take longer while model files download." : "Analysis runs in the background; this panel remains usable."}</small></div></div>}
    {!assets.length && <section className="ma-empty"><h2>No audio is ready for analysis</h2><p>Import an MP3 or WAV from Assets, then return here and choose it.</p></section>}
    {report && <>
      {!reportMatchesSelection && <div className="ma-notice">This report belongs to “{report.asset.displayName}”. Press Analyze Music to replace it with the selected soundtrack.</div>}
      <MusicLyricsMapView
        report={report}
        projectId={manifest.id}
        refreshAfterSave={load}
        audioRef={audioRef}
        audioUrl={audioUrl}
        onAudioTimeUpdate={time => setPlayhead(time)}
        correlation={correlation}
        directorBrief={directorBrief}
        correlationStale={correlationStale}
        correlationBusy={correlationBusy}
        correlationZoom={correlationZoom}
        setCorrelationZoom={setCorrelationZoom}
        buildCorrelation={() => void buildCorrelation()}
        downloadReport={downloadReport}
        downloadMap={() => correlation && downloadArtifact("music-lyrics-map.json", correlation)}
        downloadBrief={() => directorBrief && downloadArtifact("director-brief.json", directorBrief)}
        visibleSources={visibleSources}
        setVisibleSources={setVisibleSources}
        playhead={playhead}
        seekTo={seekTo}
        playEvent={playEvent}
        reportMatchesSelection={reportMatchesSelection}
      />
    </>}
    {!report && assets.length > 0 && <section className="ma-empty"><h2>Ready when you are</h2><p>Choose an audio file and press Analyze Music. The report is saved in this project and can be reopened here later.</p></section>}
  </main>;
}

function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`; }
function downloadArtifact(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
