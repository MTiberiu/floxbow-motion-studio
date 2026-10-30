import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import { MusicLyricsMapView } from "./MusicLyricsMapView";
import { useSharedTimelineTransport } from "./shared-timeline-transport";
import "./music-analysis.css";

export type AudioAsset = { id: string; displayName: string; status: string; type: string };
export type Point = { time: number; value: number };
export type MusicEventSource = "drums" | "bass" | "vocals" | "other" | "mix";
export type MusicEvent = { id: string; time: number; endTime?: number; category: string; source: MusicEventSource; intensity?: number; method: string };
export type MusicEventGroup = { id: string; start: number; end: number; source: "drums" | "bass" | "other"; count: number; eventIds: string[]; pattern: string };
export type Report = {
  schemaVersion: 1 | 2 | 3; projectId: string; assetId: string;
  asset: { displayName: string; sha256: string; sizeBytes: number; modifiedAt: string };
  analyzedAt: string; durationSeconds: number; status: "complete" | "partial";
  provenance: { structure: { status: "available" | "unavailable"; engine?: string; version?: string; device?: string; reason?: string }; dsp: { status: "available" | "partial"; engine: string; reason?: string } };
  structure: { bpm: number | null; beats: number[]; downbeats: number[]; beatPositions: number[]; sections: Array<{ start: number; end: number; label: string }> };
  dsp: { sampleRate: number; channels: number; waveform: number[]; energy: Point[]; accents: Array<{ time: number; strength: number }> };
  musicalEvents?: { status: "available" | "partial" | "unavailable"; method: string; stemsReused: boolean; sources: Record<"drums" | "bass" | "vocals" | "other", "available" | "unavailable">; events: MusicEvent[]; groups: MusicEventGroup[]; counts: Record<"drums" | "bass" | "vocals" | "other" | "mix", number>; instrumentRecognition: { drumLabels: string; otherInstruments: string }; reason?: string };
  vocalProfile?: { status: "available" | "partial" | "unavailable"; method: string; stemEngine: string; stemEngineVersion: string | null; librosaVersion: string | null; sampleRate: number | null; rmsHopSeconds: number; rmsThreshold: number | null; rms: Array<{ time: number; value: number; active: boolean }>; f0: Array<{ time: number; f0Hz: number | null; valid: boolean; voicedProbability: number | null; octaveOutlierRejected: boolean }>; f0Method: string; f0SampleRate: number; f0HopSeconds: number | null; reason: string | null };
  performance?: { wallSeconds: number; peakWorkingSetMB: number | null };
};
export type CorrelationWord = { id: string; text: string; start: number | null; end: number | null; beatOffsetSeconds: number | null; eventIds: string[]; preWordCueIds: string[]; vocalActivityOverlap: boolean | null };
export type CorrelationCue = { id: string; text: string; start: number; end: number; alignment: { status: string; wordTimingSource?: string; timingStatus: string }; section: string | null; beatTimes: number[]; downbeatTimes: number[]; eventIds: string[]; energy: { mean: number | null; peak: number | null }; words: CorrelationWord[] };
export type MusicLyricsMap = {
  status: "complete" | "partial";
  durationSeconds: number;
  unavailable: string[];
  sources: { musicAnalysis: { reportRevision: string }; lyrics: { revision: string; timedCueCount: number; untimedWordCount: number } };
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
  const [reportSourceAssetId, setReportSourceAssetId] = useState<string | null>(null);
  const [correlation, setCorrelation] = useState<MusicLyricsMap | null>(null);
  const [directorBrief, setDirectorBrief] = useState<DirectorBrief | null>(null);
  const [correlationStale, setCorrelationStale] = useState(false);
  const [correlationBusy, setCorrelationBusy] = useState(false);
  const [correlationZoom, setCorrelationZoom] = useState(40);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [linkingSoundtrack, setLinkingSoundtrack] = useState(false);
  const eventStopTimer = useRef<number | null>(null);
  const [visibleSources, setVisibleSources] = useState<Record<"drums" | "bass" | "vocals" | "other" | "mix", boolean>>({ drums: true, bass: true, vocals: true, other: true, mix: true });
  const transport = useSharedTimelineTransport();
  const base = `/api/media/${encodeURIComponent(manifest.id)}/music-analysis`;
  const correlationBase = `/api/media/${encodeURIComponent(manifest.id)}/music-lyrics-map`;
  const busy = job?.status === "queued" || job?.status === "running";

  const load = useCallback(async () => {
    setError("");
    try {
      const [media, saved, mapped] = await Promise.all([
        json<{ assets: AudioAsset[] }>(`/api/media/${encodeURIComponent(manifest.id)}`),
        json<{ report: Report | null; sourceAssetId: string | null }>(base),
        json<CorrelationResponse>(correlationBase),
      ]);
      const audioAssets = media.assets.filter(asset => asset.type === "audio" && asset.status === "ready");
      setAssets(audioAssets);
      setReport(saved.report);
      setReportSourceAssetId(saved.sourceAssetId);
      setCorrelation(mapped.map);
      setDirectorBrief(mapped.brief);
      setCorrelationStale(mapped.stale);
      const timelineAssetId = transport?.projectId === manifest.id ? transport.audioAssetId : null;
      const preferredAssetId = saved.sourceAssetId ?? (
        timelineAssetId && audioAssets.some(asset => asset.id === timelineAssetId)
          ? timelineAssetId
          : audioAssets[0]?.id ?? ""
      );
      setSelectedAssetId(current => current && audioAssets.some(asset => asset.id === current)
        ? current
        : preferredAssetId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [base, correlationBase, manifest.id, transport?.audioAssetId, transport?.projectId]);

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

  const linkSelectedAudioToTimeline = async () => {
    if (!selectedAssetId || linkingSoundtrack) return;
    setLinkingSoundtrack(true);
    setError("");
    try {
      const response = await fetch(`/api/media/${encodeURIComponent(manifest.id)}/assets/${encodeURIComponent(selectedAssetId)}/soundtrack`);
      const raw = await response.text();
      let result: { displayName?: string; durationInSeconds?: number };
      try { result = JSON.parse(raw) as typeof result; }
      catch { throw new Error(raw || "The selected audio could not be opened."); }
      if (!response.ok) throw new Error(result.displayName ?? (raw || "The selected audio could not be opened."));
      if (typeof result.durationInSeconds !== "number" || !Number.isFinite(result.durationInSeconds) || result.durationInSeconds <= 0)
        throw new Error("The selected audio has no usable duration.");
      window.dispatchEvent(new CustomEvent("motion-use-soundtrack", { detail: {
        projectId: manifest.id,
        assetId: selectedAssetId,
        durationInSeconds: result.durationInSeconds,
        displayName: result.displayName ?? currentAsset?.displayName ?? "Audio",
      } }));
      setNotice(`${result.displayName ?? currentAsset?.displayName ?? "Audio"} is now the Timeline soundtrack. Save the Timeline in the Video Editor to keep this change.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLinkingSoundtrack(false);
    }
  };

  const currentAsset = assets.find(asset => asset.id === selectedAssetId);
  const reportMatchesSelection = !report || reportSourceAssetId === selectedAssetId;
  const timelineMatchesSelection = transport?.projectId === manifest.id && transport.audioAssetId === selectedAssetId;
  const audioAvailable = Boolean(timelineMatchesSelection && reportMatchesSelection);
  const audioPlaying = Boolean(audioAvailable && transport?.playing);
  const playhead = timelineMatchesSelection && transport ? transport.frame / transport.fps : 0;
  const duration = report?.durationSeconds ?? 0;
  const reportComplete = report?.status === "complete" && report.musicalEvents?.status === "available";
  const seekTo = (time: number) => {
    if (!audioAvailable || !transport) return;
    const bounded = Math.max(0, Math.min(duration, time));
    transport.seek(Math.round(bounded * transport.fps));
  };
  const playEvent = (event: MusicEvent) => {
    if (!audioAvailable || !transport) return;
    if (eventStopTimer.current !== null) window.clearTimeout(eventStopTimer.current);
    transport.seek(Math.round(event.time * transport.fps));
    transport.play();
    const windowSeconds = event.endTime ? Math.min(8, Math.max(1.2, event.endTime - event.time + 0.5)) : 2.5;
    eventStopTimer.current = window.setTimeout(() => transport.pause(), windowSeconds * 1000);
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
      {reportMatchesSelection && !timelineMatchesSelection && <div className="ma-notice">Music Analysis uses the shared Video Editor player. Set “{currentAsset?.displayName ?? report.asset.displayName}” as the Timeline soundtrack to enable playback and keep event seeking in sync. <button type="button" onClick={() => void linkSelectedAudioToTimeline()} disabled={!currentAsset || linkingSoundtrack}>{linkingSoundtrack ? "Linking audio…" : "Use as Timeline soundtrack"}</button></div>}
      <MusicLyricsMapView
        report={report}
        projectId={manifest.id}
        projectWidth={manifest.width}
        projectHeight={manifest.height}
        refreshAfterSave={load}
        audioAvailable={audioAvailable}
        audioPlaying={audioPlaying}
        onTogglePlayback={() => { if (!audioAvailable || !transport) return; if (transport.playing) transport.pause(); else transport.play(); }}
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
