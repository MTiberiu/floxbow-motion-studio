import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import { parseEditTimeline, type EditTimeline, type TimelineClip } from "@motion/sdk/timeline";
import { extendSubtitleClipToTimedWords, subtitleContentSchema } from "@motion/lyrics-sync/subtitles";
import type { CorrelationCue, CorrelationWord, DirectorBrief, MusicEvent, MusicEventSource, MusicLyricsMap, Report } from "./MusicAnalysis";
import "./music-lyrics-map-view.css";

type Source = "drums" | "bass" | "vocals" | "other" | "mix";

type Props = {
  report: Report;
  projectId: string;
  refreshAfterSave: () => Promise<void>;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioUrl: string;
  onAudioTimeUpdate: (time: number) => void;
  correlation: MusicLyricsMap | null;
  directorBrief: DirectorBrief | null;
  correlationStale: boolean;
  correlationBusy: boolean;
  correlationZoom: number;
  setCorrelationZoom: Dispatch<SetStateAction<number>>;
  buildCorrelation: () => void;
  downloadReport: () => void;
  downloadMap: () => void;
  downloadBrief: () => void;
  visibleSources: Record<Source, boolean>;
  setVisibleSources: Dispatch<SetStateAction<Record<Source, boolean>>>;
  playhead: number;
  seekTo: (time: number) => void;
  playEvent: (event: MusicEvent) => void;
  reportMatchesSelection: boolean;
};

const SOURCES: Source[] = ["drums", "bass", "vocals", "other", "mix"];
const TRACKS = [
  { key: "structure", label: "Structure", y: 24 },
  { key: "waveform", label: "Wave / beats", y: 74 },
  { key: "drums", label: "Drums", y: 124 },
  { key: "bass", label: "Bass", y: 174 },
  { key: "vocals", label: "Vocals", y: 224 },
  { key: "other", label: "Other", y: 274 },
  { key: "mix", label: "Mix / change", y: 324 },
] as const;

const PLOT_LEFT = 120;
const PLOT_WIDTH = 1150;
const SVG_WIDTH = 1280;
const FULL_SVG_HEIGHT = 384;
const COMPACT_SVG_HEIGHT = 124;

export function MusicLyricsMapView(props: Props) {
  const {
    report, projectId, refreshAfterSave, audioRef, audioUrl, onAudioTimeUpdate, correlation, directorBrief, correlationStale, correlationBusy, correlationZoom, setCorrelationZoom,
    buildCorrelation, downloadReport, downloadMap, downloadBrief, visibleSources, setVisibleSources,
    playhead, seekTo, playEvent, reportMatchesSelection,
  } = props;
  const [autoFollow, setAutoFollow] = useState(true);
  const [lyricView, setLyricView] = useState<"preview" | "word-timeline">("preview");
  const [eventLanesVisible, setEventLanesVisible] = useState(true);
  const [wordBoxesVisible, setWordBoxesVisible] = useState(true);
  const [wordGuidesVisible, setWordGuidesVisible] = useState(true);
  const [analysisTimelineOpen, setAnalysisTimelineOpen] = useState(false);
  const [focusedTimingWordId, setFocusedTimingWordId] = useState<string | null>(null);
  const [manuallySelectedCueId, setManuallySelectedCueId] = useState<string | null>(null);
  const [wordContextMenu, setWordContextMenu] = useState<{ x: number; y: number; cueId: string; wordIndex: number; wordText: string; gap: number } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lyricsListRef = useRef<HTMLDivElement>(null);
  const [timelineStart, setTimelineStart] = useState(0);
  const timelineStartRef = useRef(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(1);
  const [audioError, setAudioError] = useState("");
  const [savedTimeline, setSavedTimeline] = useState<EditTimeline | null>(null);
  const [draftTimeline, setDraftTimeline] = useState<EditTimeline | null>(null);
  const [timelineRevision, setTimelineRevision] = useState("");
  const [timingSaving, setTimingSaving] = useState(false);
  const [timingMessage, setTimingMessage] = useState("");
  const [timingError, setTimingError] = useState("");
  const [cueDrafts, setCueDrafts] = useState<Record<string, CorrelationCue>>({});
  const [cueDirtyIds, setCueDirtyIds] = useState<string[]>([]);
  const [timingDraftDirty, setTimingDraftDirty] = useState(false);
  useEffect(() => {
    let current = true;
    void fetch(`/api/edit/${encodeURIComponent(projectId)}`).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ timeline: EditTimeline; revision: string }>;
    }).then(result => {
      if (!current) return;
      const timeline = parseEditTimeline(result.timeline);
      setSavedTimeline(timeline);
      setDraftTimeline(timeline);
      setTimelineRevision(result.revision);
      setTimingError("");
    }).catch(reason => {
      if (current) setTimingError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { current = false; };
  }, [projectId, correlation?.sources.lyrics.revision]);
  const duration = report.durationSeconds;
  const visibleSpan = duration ? Math.min(duration, correlationZoom) : 0;
  const maxTimelineStart = Math.max(0, duration - visibleSpan);
  const visibleStart = lyricView === "word-timeline" ? playhead - visibleSpan / 2 : Math.min(maxTimelineStart, timelineStart);
  const visibleEnd = visibleStart + visibleSpan;
  const svgHeight = eventLanesVisible ? FULL_SVG_HEIGHT : COMPACT_SVG_HEIGHT;
  const visibleTracks = eventLanesVisible ? TRACKS : TRACKS.slice(0, 2);
  const xAt = (time: number) => PLOT_LEFT + ((time - visibleStart) / Math.max(visibleSpan, 0.001)) * PLOT_WIDTH;
  const visibleCues = (correlation?.cues ?? []).map(cue => cueDrafts[cue.id] ?? cue);
  const activeCue = visibleCues.find(cue => playhead >= cue.start && playhead < cue.end) ?? null;
  const playbackCue = activeCue ?? cueAtGapMidpoint(visibleCues, playhead);
  const manuallySelectedCue = !audioPlaying ? visibleCues.find(cue => cue.id === manuallySelectedCueId) ?? null : null;
  const timingCue = manuallySelectedCue ?? playbackCue;
  const focusedTimingWord = timingCue?.words.find(word => word.id === focusedTimingWordId && word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end) ?? null;
  const activeTimingWord = timingCue?.words.filter(word => word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end).sort((a, b) => (b.start ?? 0) - (a.start ?? 0))[0] ?? null;
  const selectedTimingWordId = focusedTimingWord?.id ?? activeTimingWord?.id ?? null;
  const timingCueIndex = timingCue ? visibleCues.findIndex(cue => cue.id === timingCue.id) : -1;
  useEffect(() => {
    if (!autoFollow || !audioPlaying || timingCueIndex < 0) return;
    const list = lyricsListRef.current;
    const row = list?.children.item(timingCueIndex) as HTMLElement | null;
    if (!list || !row) return;
    const alignSelectedSecond = () => {
      const currentRow = list.children.item(timingCueIndex) as HTMLElement | null;
      if (!currentRow) return;
      const firstRowHeight = (list.children.item(0) as HTMLElement | null)?.getBoundingClientRect().height ?? currentRow.getBoundingClientRect().height;
      const desiredTopOffset = firstRowHeight * 2;
      const canAddFollowTail = !window.matchMedia("(max-width: 850px)").matches;
      list.style.setProperty("--mlm-lyrics-follow-tail", `${canAddFollowTail ? Math.max(0, list.clientHeight - desiredTopOffset) : 0}px`);
      const rowTop = currentRow.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTo({ top: Math.max(0, rowTop - desiredTopOffset), behavior: "auto" });
    };
    alignSelectedSecond();
    const observer = new ResizeObserver(alignSelectedSecond);
    observer.observe(list);
    return () => observer.disconnect();
  }, [autoFollow, audioPlaying, timingCueIndex]);
  const nearbyEvents = useMemo(() => {
    if (!analysisTimelineOpen || (!eventLanesVisible && !detailsOpen)) return [];
    const events = correlation?.events ?? [];
    return [...events].filter(event => Math.abs(event.time - playhead) < 1)
      .sort((a, b) => Math.abs(a.time - playhead) - Math.abs(b.time - playhead)).slice(0, 45);
  }, [correlation, playhead, eventLanesVisible, detailsOpen, analysisTimelineOpen]);
  useEffect(() => {
    if (!analysisTimelineOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAnalysisTimelineOpen(false);
      setDetailsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [analysisTimelineOpen]);
  useEffect(() => {
    if (!wordContextMenu) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".mlm-word-context-menu")) return;
      setWordContextMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setWordContextMenu(null); };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); };
  }, [wordContextMenu]);
  const timedWordCount = correlation?.cues.reduce((count, cue) => count + cue.words.filter(word => word.start !== null && word.end !== null).length, 0) ?? 0;
  const untimedWordCount = correlation?.sources.lyrics.untimedWordCount ?? 0;
  const counts = report.musicalEvents?.counts;
  const events = correlation?.events ?? [];
  const waveform = report.dsp.waveform;
  const energy = report.dsp.energy;

  useEffect(() => { timelineStartRef.current = timelineStart; }, [timelineStart]);
  useEffect(() => {
    setTimelineStart(current => Math.min(maxTimelineStart, Math.max(0, current)));
  }, [maxTimelineStart]);
  useEffect(() => {
    if (lyricView === "word-timeline") return;
    const start = timelineStartRef.current;
    if (playhead < start || playhead > start + visibleSpan) {
      setTimelineStart(Math.min(maxTimelineStart, Math.max(0, playhead - visibleSpan / 2)));
    }
  }, [playhead, visibleSpan, maxTimelineStart, lyricView]);

  const setWordZoom = (scale: number) => {
    const next = Math.max(1, Math.min(duration || 1, correlationZoom * scale));
    setCorrelationZoom(next);
    setTimelineStart(Math.max(0, Math.min(Math.max(0, duration - next), playhead - next / 2)));
  };

  const toggleAudioPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setAudioError("");
      void audio.play().catch(reason => setAudioError(reason instanceof Error ? reason.message : "Audio playback could not start."));
    } else audio.pause();
  };
  const updateAudioVolume = (value: number) => {
    setAudioVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const handleMapClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!duration || !reportMatchesSelection) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) / rect.width * SVG_WIDTH;
    const ratio = Math.min(1, Math.max(0, (svgX - PLOT_LEFT) / PLOT_WIDTH));
    seekTo(visibleStart + ratio * visibleSpan);
  };

  const focusCue = (cue: CorrelationCue) => {
    setManuallySelectedCueId(cue.id);
    seekTo(cue.start);
  };

  const focusWord = (wordId: string) => {
    setFocusedTimingWordId(wordId);
    const cue = visibleCues.find(item => item.words.some(word => word.id === wordId));
    if (cue) setManuallySelectedCueId(cue.id);
  };

  const updateCueDraft = (cue: CorrelationCue) => {
    setCueDrafts(current => ({ ...current, [cue.id]: cue }));
    setCueDirtyIds(current => current.includes(cue.id) ? current : [...current, cue.id]);
    setTimingDraftDirty(true);
    setTimingMessage("Unsaved lyric timing draft. Save to update the Timeline, captions, and correlation.");
    setTimingError("");
  };

  const editWord = (cue: CorrelationCue, wordIndex: number, requestedDelta: number) => {
    if (!draftTimeline) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || !content.words[wordIndex]) { setTimingError("This lyric line has no editable word timing."); return; }
    const word = content.words[wordIndex];
    const delta = Math.round(requestedDelta * 1000) / 1000;
    if (word.end - word.start + delta < .04) { setTimingError("A word must remain at least 40 ms long."); return; }
    content.words = content.words.map((entry, index) => index === wordIndex
      ? { ...entry, end: roundMs(entry.end + delta) }
      : index > wordIndex
        ? { ...entry, start: roundMs(entry.start + delta), end: roundMs(entry.end + delta) }
        : entry);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This timing change would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map((entry, index) => index === wordIndex
      ? { ...entry, end: entry.end === null ? null : roundMs(entry.end + delta) }
      : index > wordIndex
        ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + delta), end: entry.end === null ? null : roundMs(entry.end + delta) }
        : entry);
    const nextEnd = Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end));
    updateCueDraft({ ...cue, end: nextEnd, words });
    setTimingError("");
  };

  const addSpaceAfterWord = (cue: CorrelationCue, wordIndex: number, requestedDelta: number) => {
    if (!draftTimeline || wordIndex < 0 || wordIndex >= cue.words.length - 1) return;
    const word = cue.words[wordIndex];
    const nextWord = cue.words[wordIndex + 1];
    if (word.end === null || nextWord.start === null) { setTimingError("A space can be added only between timed words."); return; }
    const currentGap = Math.max(0, nextWord.start - word.end);
    const delta = requestedDelta < 0 ? -Math.min(-requestedDelta, currentGap) : requestedDelta;
    if (!delta) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || content.words.length !== cue.words.length) { setTimingError("This lyric line no longer has matching editable word timing."); return; }
    content.words = content.words.map((entry, index) => index > wordIndex
      ? { ...entry, start: roundMs(entry.start + delta), end: roundMs(entry.end + delta) }
      : entry);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This gap would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map((entry, index) => index > wordIndex
      ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + delta), end: entry.end === null ? null : roundMs(entry.end + delta) }
      : entry);
    const nextEnd = Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end));
    updateCueDraft({ ...cue, end: nextEnd, words });
    setTimingError("");
  };

  const setWordStartHere = (wordId: string, time: number) => {
    if (!draftTimeline) return;
    const cue = visibleCues.find(item => item.words.some(word => word.id === wordId));
    const wordIndex = cue?.words.findIndex(word => word.id === wordId) ?? -1;
    if (!cue || wordIndex < 0) return;
    const word = cue.words[wordIndex];
    if (word.start === null || word.end === null) return;
    const previousTimed = [...cue.words.slice(0, wordIndex)].reverse().find(entry => entry.end !== null);
    const nextStart = Math.max(previousTimed?.end ?? 0, roundMs(time));
    const delta = roundMs(nextStart - word.start);
    if (!delta) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || content.words.length !== cue.words.length) { setTimingError("This lyric line no longer has matching editable word timing."); return; }
    content.words = content.words.map((entry, index) => index >= wordIndex
      ? { ...entry, start: roundMs(entry.start + delta), end: roundMs(entry.end + delta) }
      : entry);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This start time would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map((entry, index) => index >= wordIndex
      ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + delta), end: entry.end === null ? null : roundMs(entry.end + delta) }
      : entry);
    updateCueDraft({ ...cue, end: Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end)), words });
    seekTo(nextStart);
    setTimingError("");
  };

  const setWordEndHere = (wordId: string, time: number) => {
    if (!draftTimeline) return;
    const cue = visibleCues.find(item => item.words.some(word => word.id === wordId));
    const wordIndex = cue?.words.findIndex(word => word.id === wordId) ?? -1;
    if (!cue || wordIndex < 0) return;
    const word = cue.words[wordIndex];
    if (word.start === null || word.end === null) return;
    const nextTimed = cue.words.slice(wordIndex + 1).find(entry => entry.start !== null);
    const end = Math.min(roundMs(time), nextTimed?.start ?? Number.POSITIVE_INFINITY);
    if (end < word.start + .04) { setTimingError("A word must remain at least 40 ms long."); return; }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || !content.words[wordIndex]) { setTimingError("This lyric line has no editable word timing."); return; }
    const delta = roundMs(end - word.end);
    content.words[wordIndex] = { ...content.words[wordIndex], end: roundMs(content.words[wordIndex].end + delta) };
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This end time would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map((entry, index) => index === wordIndex ? { ...entry, end } : entry);
    updateCueDraft({ ...cue, end: Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end)), words });
    seekTo(end);
    setTimingError("");
  };

  const shiftVerse = (cue: CorrelationCue, requestedDelta: number) => {
    if (!draftTimeline) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const frameDelta = Math.round(requestedDelta * timeline.fps);
    const newFrom = clip.from + frameDelta;
    if (newFrom < 0 || newFrom + clip.durationInFrames > timeline.durationInFrames) { setTimingError("This lyric line must stay within the project duration."); return; }
    const delta = frameDelta / timeline.fps;
    clip.from = newFrom;
    const adjusted = parseEditTimeline(timeline);
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, start: roundMs(cue.start + delta), end: roundMs(cue.end + delta), words: cue.words.map(word => ({ ...word, start: word.start === null ? null : roundMs(word.start + delta), end: word.end === null ? null : roundMs(word.end + delta) })) });
    seekTo(cue.start + delta + .015);
    setTimingError("");
  };

  const resetVerse = (cue: CorrelationCue) => {
    if (!savedTimeline || !draftTimeline) return;
    const savedClip = savedTimeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    const currentClipIndex = draftTimeline.clips.findIndex(item => item.id === cue.id && item.componentId === "subtitles");
    if (!savedClip || currentClipIndex < 0) { setTimingError("The saved version of this lyric line could not be found."); return; }
    const timeline = structuredClone(draftTimeline);
    timeline.clips[currentClipIndex] = structuredClone(savedClip);
    setDraftTimeline(parseEditTimeline(timeline));
    setCueDrafts(current => { const next = { ...current }; delete next[cue.id]; return next; });
    setCueDirtyIds(current => current.filter(id => id !== cue.id));
    setTimingDraftDirty(cueDirtyIds.some(id => id !== cue.id));
    setTimingMessage("This lyric line has been reset to its last saved Timeline timing.");
    setTimingError("");
    seekTo(savedClip.from / savedTimeline.fps);
  };

  const discardTimingDraft = () => {
    if (!savedTimeline) return;
    setDraftTimeline(structuredClone(savedTimeline));
    setCueDrafts({});
    setCueDirtyIds([]);
    setTimingDraftDirty(false);
    setTimingMessage("Unsaved timing changes discarded.");
    setTimingError("");
  };

  const saveTimingDraft = async () => {
    if (!draftTimeline || !timingDraftDirty) return;
    setTimingSaving(true);
    setTimingError("");
    try {
      const response = await fetch(`/api/edit/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeline: draftTimeline, revision: timelineRevision }) });
      const result = await response.json().catch(() => ({})) as { timeline?: EditTimeline; revision?: string; message?: string };
      if (!response.ok || !result.timeline || !result.revision) throw new Error(result.message ?? "The Timeline could not be saved. Reload it and try again.");
      const saved = parseEditTimeline(result.timeline);
      setSavedTimeline(saved);
      setDraftTimeline(saved);
      setTimelineRevision(result.revision);
      setCueDrafts({});
      setCueDirtyIds([]);
      setTimingDraftDirty(false);
      setTimingMessage("Lyric timing saved to the Timeline. Captions and the Music × Lyrics map now use these times.");
      await refreshAfterSave();
    } catch (reason) {
      setTimingError(reason instanceof Error ? reason.message : String(reason));
    } finally { setTimingSaving(false); }
  };

  const currentSection = report.structure.sections.find(section => playhead >= section.start && playhead < section.end);
  const nextCue = correlation?.cues.find(cue => cue.start > (timingCue?.start ?? playhead)) ?? null;

  return <div className="mlm-page">
    <audio ref={audioRef} hidden preload="metadata" src={audioUrl || undefined} onTimeUpdate={event => { onAudioTimeUpdate(event.currentTarget.currentTime); if (audioPlaying) { setManuallySelectedCueId(null); setFocusedTimingWordId(null); } }} onPlay={() => { setAudioPlaying(true); setManuallySelectedCueId(null); setFocusedTimingWordId(null); }} onPause={() => setAudioPlaying(false)} onVolumeChange={event => setAudioVolume(event.currentTarget.volume)} onError={() => setAudioError("The selected audio file could not be loaded.")}/>
    <section className="mlm-panel mlm-audio-overview">
      <div className="mlm-audio-strip"><div><span className="mlm-kicker">AUDIO</span><strong>{report.asset.displayName}</strong></div><div className="mlm-audio-facts"><span>{report.structure.bpm === null ? "BPM unavailable" : `${Math.round(report.structure.bpm)} BPM`}</span><span>{report.structure.beats.length} beats</span><span>{report.structure.sections.length} sections</span><span>{currentSection?.label ?? "No section"}</span><span>{formatTime(duration)}</span></div>
      </div>
      {!reportMatchesSelection && <p className="ma-notice">This report belongs to “{report.asset.displayName}”. Analyze the selected soundtrack to replace it.</p>}
    </section>

    <section className="mlm-panel mlm-lyrics-alignment">
      <div className="mlm-panel-heading"><div><span className="mlm-kicker">02 / VOCAL & LYRICS ALIGNMENT</span><h2>Lyrics synchronized to the song</h2><p>Play the song. Words turn orange as they are sung; use the word timing controls below the preview to correct a line.</p></div><div className="mlm-alignment-tools"><button onClick={() => seekTo(correlation?.cues[0]?.start ?? 0)} disabled={!correlation?.cues.length}>▶ First lyric</button><label><input type="checkbox" checked={autoFollow} onChange={event => setAutoFollow(event.currentTarget.checked)}/> Auto follow</label></div></div>
      {!correlation && <div className="ma-unavailable">Build the full-song correlation to show saved Timeline lyrics against the audio. This does not rerun music analysis.</div>}
      {correlation && <div className="mlm-lyrics-grid">
        <div className="mlm-lyric-preview-column">
          <div className="mlm-lyric-toolbar">
            <div className="mlm-lyric-view-tabs" role="tablist" aria-label="Lyric display mode"><button role="tab" aria-selected={lyricView === "preview"} className={lyricView === "preview" ? "is-active" : ""} onClick={() => setLyricView("preview")}>Karaoke preview</button><button role="tab" aria-selected={lyricView === "word-timeline"} className={lyricView === "word-timeline" ? "is-active" : ""} onClick={() => setLyricView("word-timeline")}>Timed word layout</button>
              <details className="mlm-display-settings"><summary>Display settings</summary><div className="mlm-display-settings-menu">
                <button className="mlm-clean-view-action" onClick={() => { setWordBoxesVisible(false); setWordGuidesVisible(false); setAnalysisTimelineOpen(false); setDetailsOpen(false); }}>Clean text only</button>
                <label><input type="checkbox" checked={wordBoxesVisible} onChange={event => setWordBoxesVisible(event.currentTarget.checked)}/> Word backgrounds and borders</label>
                <label><input type="checkbox" checked={wordGuidesVisible} onChange={event => setWordGuidesVisible(event.currentTarget.checked)}/> Time ruler and playhead</label>
              </div></details>
              <div className={`mlm-word-zoom${lyricView === "preview" ? " is-placeholder" : ""}`}><button aria-label="Zoom out words" title="Show more time" disabled={lyricView === "preview"} onClick={() => setWordZoom(1.5)}>−</button><span>{lyricView === "preview" ? "" : `${formatTime(visibleSpan)} view`}</span><button aria-label="Zoom in words" title="Show less time" disabled={lyricView === "preview"} onClick={() => setWordZoom(.67)}>+</button></div>
            </div>
            <div className="mlm-alignment-transport"><button className="mlm-transport-play" onClick={toggleAudioPlayback} disabled={!audioUrl || !reportMatchesSelection} aria-label={audioPlaying ? "Pause soundtrack" : "Play soundtrack"}>{audioPlaying ? "Ⅱ" : "▶"}</button><time>{formatTime(playhead)} <span>/ {formatTime(duration)}</span></time><input aria-label="Seek soundtrack" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(duration, playhead)} onChange={event => seekTo(Number(event.currentTarget.value))}/><label className="mlm-alignment-volume" title="Soundtrack volume"><span>Vol</span><input aria-label="Soundtrack volume" type="range" min="0" max="1" step="0.01" value={audioVolume} onChange={event => updateAudioVolume(Number(event.currentTarget.value))}/></label><button className="mlm-open-analysis" onClick={() => setAnalysisTimelineOpen(true)} aria-haspopup="dialog">Full analysis</button></div>
          </div>
          <div className="mlm-lyric-stage">
            {lyricView === "preview" && <div className="mlm-lyric-status">{timingCue ? `${formatTime(timingCue.start)}–${formatTime(timingCue.end)} · ${(timingCue.alignment.wordTimingSource ?? "untimed").toUpperCase()} · ${timingCue.alignment.status.toUpperCase()}` : "INSTRUMENTAL / NO ACTIVE LYRIC"}</div>}
            {lyricView === "preview" ? <><div className="mlm-lyric-main" aria-live="polite">{timingCue?.words.length ? timingCue.words.map(word => {
              const isSung = word.end !== null && playhead >= word.end;
              const isNow = word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end;
              return <span key={word.id} className={`mlm-lyric-token${isSung ? " sung" : isNow ? " now" : " future"}`} onClick={() => { if (word.start !== null) seekTo(word.start); }} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text} </span>;
            }) : timingCue ? <span>{timingCue.text}</span> : <span className="mlm-instrumental-mark">♪</span>}</div>
            <div className="mlm-lyric-next">{nextCue?.text ?? ""}</div></> : <>
              <TimedWordRunway cues={visibleCues} audioRef={audioRef} audioPlaying={audioPlaying} playhead={playhead} duration={duration} visibleSpan={visibleSpan} correlationZoom={correlationZoom} wordBoxesVisible={wordBoxesVisible} wordGuidesVisible={wordGuidesVisible} seekTo={seekTo} selectWord={focusWord} setWordStartHere={setWordStartHere} setWordEndHere={setWordEndHere}/>
            </>}
          </div>
          <div className={`mlm-word-timing-panel${timingCue ? "" : " is-empty"}`}>
            {timingCue && <>
            <div className="mlm-timing-panel-title"><strong>Adjust word timing · {timingCue.text}</strong><span>Click a word to seek · Shift + / − for 10 ms</span></div>
            <div className="mlm-timing-word-controls">{timingCue.words.map((word, index) => {
              const isAtWord = selectedTimingWordId === word.id;
              const timingState = word.start === null || word.end === null ? "untimed" : word.end <= playhead ? "sung" : word.start <= playhead ? "now" : "upcoming";
              const nextTimedWord = timingCue.words[index + 1];
              const pauseAfter = word.end !== null && nextTimedWord?.start !== null && nextTimedWord?.start !== undefined ? Math.max(0, nextTimedWord.start - word.end) : 0;
              return <Fragment key={word.id}><div className={`mlm-timing-word ${timingState}${isAtWord ? " is-selected" : ""}`} onClick={event => { if ((event.target as HTMLElement).closest("button:not(.mlm-timing-word-select)")) return; if (word.start !== null) { focusWord(word.id); seekTo(word.start); } }} onContextMenu={event => { if (word.start === null || word.end === null || !nextTimedWord || nextTimedWord.start === null) return; event.preventDefault(); setWordContextMenu({ x: event.clientX, y: event.clientY, cueId: timingCue.id, wordIndex: index, wordText: word.text, gap: Math.max(0, nextTimedWord.start - word.end) }); }}><button className="mlm-timing-word-select" disabled={word.start === null} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text}</button><small>{word.start === null || word.end === null ? "Untimed" : `${formatTime(word.start)} · ${formatDuration(word.end - word.start)}`}</small><div><button disabled={word.start === null || !draftTimeline || timingSaving} aria-label={`Shorten ${word.text}`} title="Shorten by 100 ms (Shift: 10 ms)" onClick={event => { event.stopPropagation(); if (word.start !== null) { focusWord(word.id); seekTo(word.start); } editWord(timingCue, index, event.shiftKey ? -.01 : -.1); }}>−</button><button disabled={word.start === null || !draftTimeline || timingSaving} aria-label={`Lengthen ${word.text}`} title="Lengthen by 100 ms (Shift: 10 ms)" onClick={event => { event.stopPropagation(); if (word.start !== null) { focusWord(word.id); seekTo(word.start); } editWord(timingCue, index, event.shiftKey ? .01 : .1); }}>+</button></div></div>{pauseAfter >= .04 && <div className="mlm-timing-gap" style={{ "--gap-seconds": pauseAfter } as CSSProperties} title={`Pause · ${formatDuration(pauseAfter)}`} aria-label={`Pause ${formatDuration(pauseAfter)} after ${word.text}`}><span>{formatDuration(pauseAfter)}</span></div>}</Fragment>;
            })}</div>
            {wordContextMenu && <div className="mlm-word-context-menu" role="menu" style={{ left: Math.max(8, Math.min(wordContextMenu.x, window.innerWidth - 252)), top: Math.max(8, Math.min(wordContextMenu.y, window.innerHeight - 115)) }} onContextMenu={event => event.preventDefault()}><strong>Space after “{wordContextMenu.wordText}”</strong><span>{wordContextMenu.gap > 0 ? `Current gap: ${formatDuration(wordContextMenu.gap)}` : "No pause between these words"}</span><button role="menuitem" disabled={!draftTimeline || timingSaving} onClick={() => { const cue = visibleCues.find(item => item.id === wordContextMenu.cueId); if (cue) addSpaceAfterWord(cue, wordContextMenu.wordIndex, .1); setWordContextMenu(null); }}>{wordContextMenu.gap > 0 ? "Add 100 ms more space" : "Add 100 ms space after"}</button>{wordContextMenu.gap > 0 && <button role="menuitem" disabled={!draftTimeline || timingSaving} onClick={() => { const cue = visibleCues.find(item => item.id === wordContextMenu.cueId); if (cue) addSpaceAfterWord(cue, wordContextMenu.wordIndex, -.1); setWordContextMenu(null); }}>Reduce space by 100 ms</button>}</div>}
            <div className="mlm-verse-timing-controls"><span>Shift “{timingCue.text}”, keeping word lengths</span><button disabled={!draftTimeline || timingSaving} title="Move 100 ms earlier (Shift: 10 ms)" onClick={event => shiftVerse(timingCue, event.shiftKey ? -.01 : -.1)}>←</button><time>{formatTime(timingCue.start)}</time><button disabled={!draftTimeline || timingSaving} title="Move 100 ms later (Shift: 10 ms)" onClick={event => shiftVerse(timingCue, event.shiftKey ? .01 : .1)}>→</button></div>
            <div className="mlm-timing-actions"><button onClick={() => resetVerse(timingCue)} disabled={!cueDirtyIds.includes(timingCue.id) || timingSaving}>Reset this lyric</button>{timingDraftDirty && <><button onClick={discardTimingDraft} disabled={timingSaving}>Discard draft</button><button className="ma-primary" onClick={() => void saveTimingDraft()} disabled={timingSaving}>{timingSaving ? "Saving…" : "Save timing to Timeline"}</button></>}</div>
            {(timingError || timingMessage) && <div className={`mlm-timing-message${timingError ? " is-error" : ""}`} role={timingError ? "alert" : "status"}>{timingError || timingMessage}</div>}
            </>}
          </div>
          <div className="mlm-sync-warning">Lyric timing comes from the FloxBow Timeline. Some word timings are estimated and lyric lines may be unverified. Compare the preview with the recording; timing edits are saved to the Timeline when you choose Save.</div>
        </div>
        <div className="mlm-lyrics-list-column"><div className="mlm-list-caption">Click a lyric to seek to that moment</div><div className="mlm-lyrics-list" ref={lyricsListRef}>{visibleCues.map((cue, index) => {
          const state = cue.end <= playhead ? "is-sung" : cue.start <= playhead && playhead < cue.end ? "is-current" : "is-upcoming";
          const selected = timingCue?.id === cue.id;
          return <button key={cue.id} className={`${state}${selected ? " is-selected" : ""}`} aria-current={state === "is-current" ? "true" : undefined} onClick={() => focusCue(cue)}><time>{formatTime(cue.start)}</time><span>{cue.text}</span><small>{cue.alignment.wordTimingSource ?? "No word timing"} · {cue.alignment.status}</small><em>{String(index + 1).padStart(2, "0")}</em></button>;
        })}</div></div>
      </div>}
    </section>

    {analysisTimelineOpen && <div className="mlm-analysis-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setAnalysisTimelineOpen(false); setDetailsOpen(false); } }}><section className="mlm-analysis-dialog" role="dialog" aria-modal="true" aria-label="Full music analysis timeline"><header><div><span className="mlm-kicker">FULL SONG ANALYSIS</span><h2>Music, lyrics &amp; events</h2></div><button aria-label="Close full analysis" onClick={() => { setAnalysisTimelineOpen(false); setDetailsOpen(false); }}>×</button></header><section className={`mlm-panel mlm-map-panel${eventLanesVisible ? " has-event-lanes" : " is-compact"}`}>
      <div className="mlm-dock-header"><div className="mlm-panel-heading compact"><div><span className="mlm-kicker">03 / DETECTION TIMELINE</span><h2>{eventLanesVisible ? "Sound events, by category" : "Structure and waveform"}</h2><p>{lyricView === "word-timeline" ? "Playhead stays centered; the song moves beneath it." : "Click the timeline to seek. Scroll the time window below."}</p></div><div className="mlm-detection-actions">{lyricView === "preview" && <><label>Zoom <input aria-label="Timeline zoom" type="range" min="1" max={Math.max(1, Math.ceil(duration))} step="0.1" value={Math.min(Math.max(1, Math.ceil(duration)), correlationZoom)} onChange={event => { const next = Number(event.currentTarget.value); setCorrelationZoom(next); setTimelineStart(Math.max(0, Math.min(Math.max(0, duration - Math.min(duration, next)), playhead - next / 2))); }}/><span>{formatTime(visibleSpan)} window</span></label><button onClick={() => { setCorrelationZoom(duration || 40); setTimelineStart(0); }}>Entire song</button></>}<button className="mlm-hide-timeline" onClick={() => setEventLanesVisible(value => !value)} aria-expanded={eventLanesVisible}>{eventLanesVisible ? "Hide event lanes" : "Show event lanes"}</button></div></div>
        {audioError && <span className="mlm-audio-error" role="alert">{audioError}</span>}
      </div>
      {eventLanesVisible && <div className="mlm-source-toggles" aria-label="Visible event categories">{SOURCES.map(source => <label key={source} className={`mlm-source-toggle mlm-${source}`}><input type="checkbox" checked={visibleSources[source]} onChange={event => setVisibleSources(current => ({ ...current, [source]: event.currentTarget.checked }))}/><span>{titleCase(source === "mix" ? "Mix / change" : source)}</span><b>{counts?.[source] ?? 0}</b></label>)}</div>}
      {!correlation && <div className="ma-unavailable">Build the full-song correlation first; the event timeline uses the same song position and audio report.</div>}
      {correlation && <>
        {correlationStale && <div className="ma-unavailable mlm-stale">Timeline lyrics or the audio report changed. Refresh the map to show the latest saved data.</div>}
        {correlation.unavailable.map(reason => <div className="ma-unavailable mlm-stale" key={reason}>{reason}</div>)}
        <div className="mlm-map-scroll"><svg className="mlm-map" viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`} preserveAspectRatio="none" role="img" aria-label="Audio detection timeline with waveform, beat and sound event lanes" onClick={handleMapClick}>
          <rect className="mlm-map-background" x="0" y="0" width={SVG_WIDTH} height={svgHeight}/>
          {visibleTracks.map(track => <g key={track.key}><text className="mlm-track-label" x="10" y={track.y + 15}>{track.label}</text><line className="mlm-track-rule" x1={PLOT_LEFT} x2={SVG_WIDTH - 10} y1={track.y + 42} y2={track.y + 42}/></g>)}
          {report.structure.sections.filter(section => section.end >= visibleStart && section.start <= visibleEnd).map((section, index) => {
            const start = Math.max(section.start, visibleStart); const end = Math.min(section.end, visibleEnd);
            return <g key={`section-${index}`} className="mlm-structure-section"><rect x={xAt(start)} y="29" width={Math.max(1, xAt(end) - xAt(start) - 1)} height="27" rx="3"/><text x={xAt(start) + 5} y="46">{section.label.toUpperCase()}</text><title>{`${section.label} · ${formatTime(section.start)}–${formatTime(section.end)}`}</title></g>;
          })}
          {makeTicks(visibleStart, visibleEnd, duration, correlationZoom).map(tick => <g key={tick}><line className="mlm-tick" x1={xAt(tick)} x2={xAt(tick)} y1="20" y2={svgHeight - 8}/><text className="mlm-ruler-label" x={xAt(tick) + 3} y="15">{formatTime(tick)}</text></g>)}
          {waveform.map((value, index) => {
            const time = index / Math.max(1, waveform.length - 1) * duration;
            if (time < visibleStart || time > visibleEnd) return null;
            const x = xAt(time); const height = Math.max(1, Math.abs(value) * 14);
            return <line key={`wave-${index}`} className="mlm-waveform-mark" x1={x} x2={x} y1={95 - height} y2={95 + height}/>;
          })}
          {energy.filter(point => point.time >= visibleStart && point.time <= visibleEnd).map((point, index, visible) => {
            const previous = visible[index - 1];
            return previous ? <line key={`energy-${point.time}`} className="mlm-energy-mark" x1={xAt(previous.time)} y1={112 - Math.min(1, previous.value / 0.4) * 5} x2={xAt(point.time)} y2={112 - Math.min(1, point.value / 0.4) * 5}/> : null;
          })}
          {report.structure.beats.filter(time => time >= visibleStart && time <= visibleEnd).map((time, index) => <line key={`beat-${index}`} className="mlm-beat-mark" x1={xAt(time)} x2={xAt(time)} y1="80" y2="113"/>)}
          {report.structure.downbeats.filter(time => time >= visibleStart && time <= visibleEnd).map((time, index) => <line key={`downbeat-${index}`} className="mlm-downbeat-mark" x1={xAt(time)} x2={xAt(time)} y1="78" y2="114"/>)}
          {eventLanesVisible && SOURCES.filter(source => visibleSources[source]).flatMap(source => events.filter(item => item.source === source && item.time >= visibleStart && item.time <= visibleEnd).map(item => {
            const track = TRACKS.find(candidate => candidate.key === source)!;
            const radius = 1.8 + (item.intensity ?? 0.3) * 1.8;
            return <circle key={item.id} className={`mlm-event-mark mlm-event-${source}`} cx={xAt(item.time)} cy={track.y + 24} r={radius} role="button" tabIndex={0} aria-label={`${item.category.replaceAll("_", " ")} at ${formatTime(item.time)}; play event`} onClick={click => { click.stopPropagation(); playEvent(item); }} onKeyDown={key => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); playEvent(item); } }}><title>{`${titleCase(item.source)} · ${item.category.replaceAll("_", " ")} · ${formatTime(item.time)} · ${item.method}`}</title></circle>;
          }))}
          {eventLanesVisible && report.dsp.accents.filter(accent => accent.time >= visibleStart && accent.time <= visibleEnd).map((accent, index) => <circle key={`accent-${index}`} className="mlm-accent-mark" cx={xAt(accent.time)} cy="357" r={1.4 + accent.strength * 1.5}/>)}
          <line className="mlm-playhead" x1={xAt(playhead)} x2={xAt(playhead)} y1="20" y2={svgHeight - 5}/>
        </svg></div>
        {lyricView === "word-timeline" ? <div className="mlm-timeline-scroll-controls is-centered"><span>Seek song</span><input className="mlm-time-scroll" type="range" aria-label="Seek soundtrack" min="0" max={duration || 1} step="0.01" value={Math.min(duration, playhead)} onChange={event => seekTo(Number(event.currentTarget.value))}/><time>{formatTime(playhead)}</time></div> : <div className="mlm-timeline-scroll-controls"><button aria-label="Scroll earlier" disabled={visibleStart <= 0} onClick={() => setTimelineStart(Math.max(0, visibleStart - visibleSpan * .8))}>←</button><input className="mlm-time-scroll" type="range" aria-label="Scroll timeline horizontally" min="0" max={maxTimelineStart} step="0.05" value={visibleStart} onChange={event => setTimelineStart(Number(event.currentTarget.value))}/><button aria-label="Scroll later" disabled={visibleStart >= maxTimelineStart} onClick={() => setTimelineStart(Math.min(maxTimelineStart, visibleStart + visibleSpan * .8))}>→</button><span>{formatTime(visibleStart)} – {formatTime(visibleEnd)}</span></div>}
        {eventLanesVisible && <div className="mlm-legend"><span className="legend-wave">Waveform</span><span className="legend-energy">Energy</span><span className="legend-beat">Beat</span><span className="legend-downbeat">Downbeat</span><span className="legend-events">Drums · Bass · Vocals · Other · Mix</span></div>}
      </>}
      <div className="mlm-correlation-footer">
        <div className="mlm-status-pills">
          {correlation && <>
            <span className={`ma-status ${correlation.status === "complete" ? "complete" : "partial"}`}>{correlation.status} map</span>
            <span>{correlation.cues.length} lyric lines</span><span>{timedWordCount} timed words</span>
            <span>{untimedWordCount} untimed</span><span>{directorBrief?.phrases.length ?? 0} Director Brief phrases</span>
          </>}
        </div>
        <div className="mlm-correlation-actions">
          <button className="ma-primary" onClick={buildCorrelation} disabled={correlationBusy || !reportMatchesSelection}>{correlationBusy ? "Updating map…" : correlationStale ? "Refresh map" : correlation ? "Rebuild map" : "Build song map"}</button>
          {correlation && <><button onClick={downloadMap}>Full map JSON</button>{directorBrief && <button onClick={downloadBrief}>Director Brief</button>}</>}
          <button onClick={downloadReport}>Music report JSON</button>
        </div>
      </div>
    </section>

    <details className="mlm-secondary-data" onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>More analysis details</summary><div className="mlm-lower-panels">
      <section className="mlm-panel mlm-list-panel"><div className="mlm-panel-heading compact"><div><span className="mlm-kicker">04 / EVENTS NEAR PLAYHEAD</span><h2>Nearby sound events</h2><p>Click an event to play a short window around it.</p></div><span className="mlm-panel-hint">{nearbyEvents.length} events</span></div>{nearbyEvents.length ? <div className="mlm-nearby-events">{nearbyEvents.map(event => <button key={event.id} onClick={() => playEvent(event)}><time>{formatTime(event.time)}</time><i className={`mlm-event-${event.source}`}/><strong>{event.category.replaceAll("_", " ")}</strong><span>{event.source}</span></button>)}</div> : <div className="mlm-empty-list">No events within 1 second of the playhead.</div>}</section>
      <details className="mlm-panel mlm-pipeline"><summary><span><span className="mlm-kicker">05 / PIPELINE</span><strong>Report and source data</strong></span><span>Analysis · Lyrics · Correlation</span></summary><div className="mlm-pipeline-content"><p>The song map combines the saved music report with lyric cues and word timing from the Timeline. Lyrics remain the source of truth; saving a lyric timing edit refreshes this derived map.</p><div><span>Structure</span><strong>{report.provenance.structure.status === "available" ? `${report.provenance.structure.engine} ${report.provenance.structure.version ?? ""} · ${report.provenance.structure.device ?? "device unavailable"}` : `Unavailable · ${report.provenance.structure.reason ?? "No structure data"}`}</strong></div><div><span>Audio events</span><strong>{report.musicalEvents?.method ?? report.provenance.dsp.engine}{report.musicalEvents?.stemsReused ? " · cached stems reused" : ""}</strong></div><div><span>DSP</span><strong>{report.provenance.dsp.engine}{report.provenance.dsp.reason ? ` · ${report.provenance.dsp.reason}` : ""}</strong></div><div><span>Source fingerprint</span><strong>{report.asset.sha256.slice(0, 20)}…</strong></div>{report.performance && <div><span>Analysis cost</span><strong>{report.performance.wallSeconds}s{report.performance.peakWorkingSetMB ? ` · peak RAM ${report.performance.peakWorkingSetMB} MB` : ""}</strong></div>}</div></details>
    </div></details></section></div>}
  </div>;
}

type TimedWordRunwayProps = {
  cues: CorrelationCue[];
  audioRef: RefObject<HTMLAudioElement | null>;
  audioPlaying: boolean;
  playhead: number;
  duration: number;
  visibleSpan: number;
  correlationZoom: number;
  wordBoxesVisible: boolean;
  wordGuidesVisible: boolean;
  seekTo: (time: number) => void;
  selectWord: (wordId: string) => void;
  setWordStartHere: (wordId: string, time: number) => void;
  setWordEndHere: (wordId: string, time: number) => void;
};

function TimedWordRunway({ cues, audioRef, audioPlaying, playhead, duration, visibleSpan, correlationZoom, wordBoxesVisible, wordGuidesVisible, seekTo, selectWord, setWordStartHere, setWordEndHere }: TimedWordRunwayProps) {
  const [displayTime, setDisplayTime] = useState(playhead);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; time: number; previous: { cueId: string; word: CorrelationWord } | null; next: { cueId: string; word: CorrelationWord } | null } | null>(null);
  useEffect(() => {
    if (!audioPlaying) setDisplayTime(audioRef.current?.currentTime ?? playhead);
  }, [audioPlaying, audioRef, playhead]);
  useEffect(() => {
    if (!audioPlaying) return;
    let frame = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (audio && now - lastPaint >= 12) {
        setDisplayTime(audio.currentTime);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioPlaying, audioRef]);

  const safeSpan = Math.max(.001, visibleSpan);
  const visibleStart = displayTime - safeSpan / 2;
  const visibleEnd = visibleStart + safeSpan;
  const xAt = (time: number) => PLOT_LEFT + ((time - visibleStart) / safeSpan) * PLOT_WIDTH;
  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) / rect.width * SVG_WIDTH;
    const ratio = Math.min(1, Math.max(0, (svgX - PLOT_LEFT) / PLOT_WIDTH));
    seekTo(visibleStart + ratio * safeSpan);
  };
  const handleContextMenu = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) / rect.width * SVG_WIDTH;
    const ratio = Math.min(1, Math.max(0, (svgX - PLOT_LEFT) / PLOT_WIDTH));
    const time = roundMs(visibleStart + ratio * safeSpan);
    const allWords = cues.flatMap(cue => cue.words.filter(word => word.start !== null && word.end !== null).map(word => ({ cueId: cue.id, word }))).sort((a, b) => a.word.start! - b.word.start!);
    const previous = [...allWords].reverse().find(entry => entry.word.start! <= time) ?? null;
    const next = allWords.find(entry => entry.word.start! > time) ?? null;
    setContextMenu({ x: event.clientX, y: event.clientY, time, previous, next });
  };
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".mlm-boundary-context-menu")) return;
      setContextMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); };
  }, [contextMenu]);
  const words = cues.flatMap(cue => cue.words.filter(word => word.start !== null && word.end !== null && word.end > visibleStart && word.start < visibleEnd).map(word => {
    const x = xAt(word.start!);
    const width = Math.max(1, xAt(word.end!) - x);
    const textWidth = Math.max(1, width - (wordBoxesVisible ? 12 : 4));
    const state = word.end! <= displayTime ? "sung" : word.start! <= displayTime ? "now" : "future";
    return { word, x, width, textWidth, state };
  }));

  return <><svg className={`mlm-word-runway${wordBoxesVisible ? " has-word-boxes" : " is-clean"}`} viewBox={`0 0 ${SVG_WIDTH} 168`} preserveAspectRatio="none" role="img" aria-label="Timed lyric words stretched to their duration on the shared audio time scale" onClick={handleClick} onContextMenu={handleContextMenu}>
    <rect className="mlm-word-runway-bg" x="0" y="0" width={SVG_WIDTH} height="168"/>
    {wordGuidesVisible && makeTicks(visibleStart, visibleEnd, duration, correlationZoom).map(tick => <g key={`lyric-tick-${tick}`}><line className="mlm-word-runway-tick" x1={xAt(tick)} x2={xAt(tick)} y1="24" y2="145"/><text className="mlm-word-runway-time" x={xAt(tick) + 3} y="18">{formatTime(tick)}</text></g>)}
    {words.map(({ word, x, width, textWidth, state }) => <g key={`runway-${word.id}`} className={`mlm-word-runway-word ${state}${wordBoxesVisible ? "" : " no-box"}`} role="button" tabIndex={0} aria-label={`${word.text}, ${formatTime(word.start!)} to ${formatTime(word.end!)}`} onClick={click => { click.stopPropagation(); selectWord(word.id); seekTo(word.start!); }} onKeyDown={key => { if (key.key === "Enter") { key.preventDefault(); selectWord(word.id); seekTo(word.start!); } }}><rect x={x} y="48" width={width} height="76" rx="5"/><text x={x + (wordBoxesVisible ? 6 : 2)} y="99" textLength={textWidth} lengthAdjust="spacingAndGlyphs">{word.text}</text><title>{`${word.text} · ${formatTime(word.start!)}–${formatTime(word.end!)}`}</title></g>)}
    {wordGuidesVisible && <line className="mlm-word-runway-playhead" x1={PLOT_LEFT + PLOT_WIDTH / 2} x2={PLOT_LEFT + PLOT_WIDTH / 2} y1="23" y2="145"/>}
  </svg>{contextMenu && createPortal(<div className="mlm-boundary-context-menu" role="menu" style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 280)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 150)) }} onContextMenu={event => event.preventDefault()}><strong>At {formatTime(contextMenu.time)}</strong>{contextMenu.previous && <button role="menuitem" onClick={() => { setWordEndHere(contextMenu.previous!.word.id, contextMenu.time); setContextMenu(null); }}>Set end of “{contextMenu.previous.word.text}” here</button>}{contextMenu.next && <button role="menuitem" onClick={() => { setWordStartHere(contextMenu.next!.word.id, contextMenu.time); setContextMenu(null); }}>Set start of “{contextMenu.next.word.text}” here</button>}{!contextMenu.previous && !contextMenu.next && <span>No timed word is close to this point.</span>}</div>, document.body)}</>;
}

function sectionAt(report: Report, time: number) {
  return report.structure.sections.find(section => time >= section.start && time < section.end)?.label ?? "—";
}

function cueAtGapMidpoint(cues: CorrelationCue[], time: number): CorrelationCue | null {
  if (!cues.length) return null;
  if (time < cues[0].start) return cues[0];
  for (let index = 1; index < cues.length; index++) {
    const next = cues[index];
    if (time >= next.start) continue;
    const previous = cues[index - 1];
    const gapStart = Math.min(previous.end, next.start);
    const midpoint = gapStart + Math.max(0, next.start - previous.end) / 2;
    return time < midpoint ? previous : next;
  }
  return cues[cues.length - 1];
}

function makeTicks(start: number, end: number, duration: number, _zoom: number) {
  const span = end - start;
  const interval = span > 180 ? 30 : span > 80 ? 15 : span > 35 ? 8 : span > 16 ? 4 : span > 7 ? 2 : 1;
  const first = Math.ceil(Math.max(0, start) / interval) * interval;
  const ticks: number[] = [];
  for (let tick = first; tick <= Math.min(end, duration); tick += interval) ticks.push(tick);
  return ticks;
}

function titleCase(value: string) { return value.replace(/\b\w/g, letter => letter.toUpperCase()); }
function formatTime(seconds: number) { const safe = Math.max(0, seconds); const minutes = Math.floor(safe / 60); return `${minutes}:${(safe % 60).toFixed(2).padStart(5, "0")}`; }
function formatDuration(seconds: number) { return `${Math.max(0, seconds).toFixed(2)}s`; }

function roundMs(seconds: number) { return Math.round(seconds * 1000) / 1000; }

function ensureSubtitleFits(timeline: EditTimeline, clip: TimelineClip): EditTimeline | null {
  const index = timeline.clips.findIndex(item => item.id === clip.id);
  if (index < 0) return null;
  const extended = extendSubtitleClipToTimedWords(clip, timeline.fps);
  if (extended.from + extended.durationInFrames > timeline.durationInFrames) return null;
  timeline.clips[index] = extended;
  return parseEditTimeline(timeline);
}
