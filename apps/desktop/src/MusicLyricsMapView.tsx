import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from "react";
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
// Manual timing edits are deliberately bounded so an absolute playhead value
// can never turn into a multi-minute clip-relative word duration again.
const MAX_MANUAL_WORD_DURATION_SECONDS = 15;

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
  const [focusedTimingWordSelection, setFocusedTimingWordSelection] = useState<{ cueId: string; wordId: string } | null>(null);
  const [manuallySelectedCueId, setManuallySelectedCueId] = useState<string | null>(null);
  const [wordContextMenu, setWordContextMenu] = useState<{ x: number; y: number; cueId: string; wordId: string } | null>(null);
  const [wordTextDraft, setWordTextDraft] = useState("");
  const [newWordTextDraft, setNewWordTextDraft] = useState("");
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
  const seekRepeatRef = useRef<number | null>(null);
  const seekAudioStartTimerRef = useRef<number | null>(null);
  const seekRepeatTimeRef = useRef(0);
  const scrubStartedPlaybackRef = useRef(false);
  const invalidTimingRefreshAttempted = useRef(false);
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
  const hasOverlongMapWord = visibleCues.some(cue => cue.words.some(word => word.start !== null && word.end !== null && word.end - word.start > MAX_MANUAL_WORD_DURATION_SECONDS));
  const invalidDraftCueIds = Object.entries(cueDrafts).filter(([, cue]) => cue.words.some(word => word.start !== null && word.end !== null && word.end - word.start > MAX_MANUAL_WORD_DURATION_SECONDS)).map(([cueId]) => cueId);
  const invalidDraftCueKey = invalidDraftCueIds.join("|");
  useEffect(() => {
    if (!hasOverlongMapWord) {
      invalidTimingRefreshAttempted.current = false;
      return;
    }
    if (invalidTimingRefreshAttempted.current) return;
    invalidTimingRefreshAttempted.current = true;
    if (invalidDraftCueIds.length) {
      setCueDrafts(current => Object.fromEntries(Object.entries(current).filter(([cueId]) => !invalidDraftCueIds.includes(cueId))));
      setCueDirtyIds(current => current.filter(cueId => !invalidDraftCueIds.includes(cueId)));
      setTimingDraftDirty(current => current && cueDirtyIds.some(cueId => !invalidDraftCueIds.includes(cueId)));
    }
    setTimingError("An outdated lyric map contains an invalid word duration. Refreshing it from the saved Timeline…");
    void refreshAfterSave();
  }, [hasOverlongMapWord, invalidDraftCueKey, refreshAfterSave]);
  useEffect(() => {
    if (!hasOverlongMapWord) setTimingError(current => current.startsWith("An outdated lyric map") ? "" : current);
  }, [hasOverlongMapWord]);
  const activeCue = visibleCues.find(cue => playhead >= cue.start && playhead < cue.end) ?? null;
  const playbackCue = activeCue ?? cueAtGapMidpoint(visibleCues, playhead);
  const manuallySelectedCue = !audioPlaying ? visibleCues.find(cue => cue.id === manuallySelectedCueId) ?? null : null;
  const focusedCue = focusedTimingWordSelection ? visibleCues.find(cue => cue.id === focusedTimingWordSelection.cueId && cue.words.some(word => word.id === focusedTimingWordSelection.wordId)) ?? null : null;
  const timingCue = audioPlaying ? playbackCue : focusedCue ?? manuallySelectedCue ?? playbackCue;
  const focusedTimingWord = timingCue && focusedTimingWordSelection && timingCue.id === focusedTimingWordSelection.cueId
    ? timingCue.words.find(word => word.id === focusedTimingWordSelection.wordId) ?? null
    : null;
  const activeTimingWord = timingCue?.words.filter(word => word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end).sort((a, b) => (b.start ?? 0) - (a.start ?? 0))[0] ?? null;
  const selectedTimingWordId = audioPlaying ? activeTimingWord?.id ?? null : focusedTimingWord?.id ?? activeTimingWord?.id ?? null;
  const activeTimingWordIndex = timingCue?.words.findIndex(word => word.id === activeTimingWord?.id) ?? -1;
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
    setFocusedTimingWordSelection(null);
    seekTo(cue.start);
  };

  const focusWord = (cueId: string, wordId: string) => {
    setFocusedTimingWordSelection({ cueId, wordId });
    if (visibleCues.some(item => item.id === cueId && item.words.some(word => word.id === wordId))) setManuallySelectedCueId(cueId);
  };

  const seekFromTimeline = (time: number) => {
    setFocusedTimingWordSelection(null);
    setManuallySelectedCueId(null);
    seekTo(time);
  };

  const seekByFrame = (direction: -1 | 1, fromTime = playhead) => {
    const frameSeconds = 1 / (draftTimeline?.fps ?? 30);
    const nextTime = clampTime(fromTime + direction * frameSeconds, duration);
    seekRepeatTimeRef.current = nextTime;
    seekFromTimeline(nextTime);
  };

  const beginAudioScrub = () => {
    const audio = audioRef.current;
    if (!audio || !audio.paused || !audioUrl || !reportMatchesSelection) return;
    scrubStartedPlaybackRef.current = true;
    setAudioError("");
    void audio.play().catch(reason => {
      scrubStartedPlaybackRef.current = false;
      setAudioError(reason instanceof Error ? reason.message : "Audio playback could not start.");
    });
  };

  const endAudioScrub = () => {
    if (scrubStartedPlaybackRef.current) audioRef.current?.pause();
    scrubStartedPlaybackRef.current = false;
  };

  const beginSeekHold = (direction: -1 | 1) => {
    if (!duration) return;
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    seekRepeatRef.current = null;
    seekRepeatTimeRef.current = playhead;
    seekByFrame(direction, seekRepeatTimeRef.current);
    seekRepeatRef.current = window.setInterval(() => seekByFrame(direction, seekRepeatTimeRef.current), 33);
    seekAudioStartTimerRef.current = window.setTimeout(beginAudioScrub, 140);
  };

  const endSeekHold = () => {
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    seekRepeatRef.current = null;
    if (seekAudioStartTimerRef.current !== null) window.clearTimeout(seekAudioStartTimerRef.current);
    seekAudioStartTimerRef.current = null;
    endAudioScrub();
  };
  useEffect(() => () => {
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    if (seekAudioStartTimerRef.current !== null) window.clearTimeout(seekAudioStartTimerRef.current);
  }, []);

  const updateCueDraft = (cue: CorrelationCue) => {
    setCueDrafts(current => ({ ...current, [cue.id]: cue }));
    setCueDirtyIds(current => current.includes(cue.id) ? current : [...current, cue.id]);
    setTimingDraftDirty(true);
    setTimingMessage("Unsaved lyric timing draft. Save to update the Timeline, captions, and correlation.");
    setTimingError("");
  };

  const openWordActions = (cue: CorrelationCue, word: CorrelationWord, x: number, y: number) => {
    setFocusedTimingWordSelection({ cueId: cue.id, wordId: word.id });
    setManuallySelectedCueId(cue.id);
    setWordTextDraft(word.text);
    setNewWordTextDraft("");
    setWordContextMenu({ x, y, cueId: cue.id, wordId: word.id });
  };

  const commitWordContent = (cue: CorrelationCue, content: ReturnType<typeof subtitleContentSchema.parse>, words: CorrelationWord[]) => {
    if (!draftTimeline) return false;
    const cueIndex = visibleCues.findIndex(item => item.id === cue.id);
    const nextCue = cueIndex >= 0 ? visibleCues[cueIndex + 1] : null;
    const editedEnd = Math.max(cue.end, ...words.map(word => word.end ?? cue.end));
    // Keep any pre-existing neighboring overlap as-is, but never make it worse.
    if (nextCue && editedEnd > Math.max(cue.end, nextCue.start) + .001) {
      setTimingError("This change would push the lyric into the next subtitle. Make room there first.");
      return false;
    }
    const overlongWord = words.find(word => word.start !== null && word.end !== null && word.end - word.start > MAX_MANUAL_WORD_DURATION_SECONDS);
    if (overlongWord) {
      setTimingError(`“${overlongWord.text}” would be longer than ${MAX_MANUAL_WORD_DURATION_SECONDS} seconds. No timing was changed.`);
      return false;
    }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return false; }
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This word change would extend beyond the project duration."); return false; }
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, text: content.text, end: Math.max(cue.end, ...words.map(word => word.end ?? cue.end)), words });
    setTimingError("");
    return true;
  };

  const editWord = (cue: CorrelationCue, wordId: string, requestedDelta: number) => {
    if (!draftTimeline) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) { setTimingError("This lyric line has no editable word timing."); return; }
    const timelineWordIndex = content.words.findIndex(entry => entry.id === wordId);
    const cueWordIndex = cue.words.findIndex(entry => entry.id === wordId);
    if (timelineWordIndex < 0 || cueWordIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing. Refresh the song map before editing."); return; }
    const word = content.words[timelineWordIndex]!;
    const delta = Math.round(requestedDelta * 1000) / 1000;
    if (word.end - word.start + delta < .04) { setTimingError("A word must remain at least 40 ms long."); return; }
    if (word.end - word.start + delta > MAX_MANUAL_WORD_DURATION_SECONDS) {
      setTimingError(`A manually timed word cannot be longer than ${MAX_MANUAL_WORD_DURATION_SECONDS} seconds. No timing was changed.`);
      return;
    }
    content.words = content.words.map((entry, index) => index === timelineWordIndex
      ? { ...entry, end: roundMs(entry.end + delta) }
      : index > timelineWordIndex
        ? { ...entry, start: roundMs(entry.start + delta), end: roundMs(entry.end + delta) }
        : entry);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This timing change would extend beyond the project duration."); return; }
    const words = cue.words.map((entry, index) => index === cueWordIndex
      ? { ...entry, end: entry.end === null ? null : roundMs(entry.end + delta) }
      : index > cueWordIndex
        ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + delta), end: entry.end === null ? null : roundMs(entry.end + delta) }
        : entry);
    const nextEnd = Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end));
    const nextCue = visibleCues[visibleCues.findIndex(entry => entry.id === cue.id) + 1];
    if (nextCue && nextEnd > Math.max(cue.end, nextCue.start) + .001) {
      setTimingError("This change would push the lyric into the next subtitle. Make room there first.");
      return;
    }
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, end: nextEnd, words });
    setTimingError("");
  };

  const addSpaceAfterWord = (cue: CorrelationCue, wordId: string, requestedDelta: number) => {
    const wordIndex = cue.words.findIndex(word => word.id === wordId);
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
    if (!content.words) { setTimingError("This lyric line no longer has matching editable word timing."); return; }
    const timelineWordIndex = content.words.findIndex(entry => entry.id === wordId);
    if (timelineWordIndex < 0 || !content.words.some(entry => entry.id === nextWord.id)) { setTimingError("This word pair no longer matches the saved Timeline. Refresh the song map before editing."); return; }
    content.words = content.words.map((entry, index) => index > timelineWordIndex
      ? { ...entry, start: roundMs(entry.start + delta), end: roundMs(entry.end + delta) }
      : entry);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This gap would extend beyond the project duration."); return; }
    const words = cue.words.map((entry, index) => index > wordIndex
      ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + delta), end: entry.end === null ? null : roundMs(entry.end + delta) }
      : entry);
    const nextEnd = Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end));
    const nextCue = visibleCues[visibleCues.findIndex(entry => entry.id === cue.id) + 1];
    if (nextCue && nextEnd > Math.max(cue.end, nextCue.start) + .001) {
      setTimingError("This pause would push the lyric into the next subtitle. Make room there first.");
      return;
    }
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, end: nextEnd, words });
    setTimingError("");
  };

  const setWordStartHere = (cueId: string, wordId: string, time: number) => {
    if (!draftTimeline) return;
    const cue = visibleCues.find(item => item.id === cueId && item.words.some(word => word.id === wordId));
    const wordIndex = cue?.words.findIndex(word => word.id === wordId) ?? -1;
    if (!cue || wordIndex < 0) return;
    const word = cue.words[wordIndex];
    if (word.start === null || word.end === null) return;
    const previousTimed = [...cue.words.slice(0, wordIndex)].reverse().find(entry => entry.end !== null);
    const nextStart = Math.max(previousTimed?.end ?? 0, roundMs(time));
    const delta = roundMs(nextStart - word.start);
    if (!delta) return;
    const cuePosition = visibleCues.findIndex(entry => entry.id === cue.id);
    const nextCue = visibleCues[cuePosition + 1];
    const lastTimedEnd = [...cue.words].reverse().find(entry => entry.end !== null)?.end;
    if (nextCue && lastTimedEnd !== undefined && lastTimedEnd !== null && lastTimedEnd + delta > nextCue.start + .001) {
      setTimingError("This word would push the lyric into the next subtitle. Move the next lyric first.");
      return;
    }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) { setTimingError("This lyric line no longer has matching editable word timing."); return; }
    const timelineWordIndex = content.words.findIndex(entry => entry.id === wordId);
    if (timelineWordIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing. Refresh the song map before editing."); return; }
    content.words = content.words.map((entry, index) => index >= timelineWordIndex
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

  const setWordEndHere = (cueId: string, wordId: string, time: number) => {
    if (!draftTimeline) return;
    const cue = visibleCues.find(item => item.id === cueId && item.words.some(word => word.id === wordId));
    const wordIndex = cue?.words.findIndex(word => word.id === wordId) ?? -1;
    if (!cue || wordIndex < 0) return;
    const word = cue.words[wordIndex];
    if (word.start === null || word.end === null) return;
    const end = roundMs(time);
    if (!Number.isFinite(end)) { setTimingError("The playhead time is invalid. No timing was changed."); return; }
    if (end < word.start + .04) { setTimingError("A word must remain at least 40 ms long."); return; }
    if (end - word.start > MAX_MANUAL_WORD_DURATION_SECONDS) {
      setTimingError(`A manually timed word cannot be longer than ${MAX_MANUAL_WORD_DURATION_SECONDS} seconds. No timing was changed.`);
      return;
    }
    const cuePosition = visibleCues.findIndex(entry => entry.id === cue.id);
    const nextCue = visibleCues[cuePosition + 1];
    const delta = roundMs(end - word.end);
    const lastWordIndex = cue.words.length - 1;
    const lastWord = cue.words[lastWordIndex];
    const newLastEnd = lastWord && (delta > 0 || wordIndex === lastWordIndex) && lastWord.end !== null
      ? roundMs(lastWord.end + delta)
      : lastWord?.end ?? cue.end;
    if (nextCue && newLastEnd > nextCue.start + .001) {
      setTimingError("This word would push the lyric into the next subtitle. Move the next lyric first.");
      return;
    }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) { setTimingError("This lyric line has no editable word timing."); return; }
    const timelineWordIndex = content.words.findIndex(entry => entry.id === wordId);
    if (timelineWordIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing. Refresh the song map before editing."); return; }
    // The playhead/correlation word uses absolute song seconds. Timeline word
    // offsets are relative to clip.from, so convert explicitly before writing.
    const clipStartSeconds = clip.from / timeline.fps;
    const relativeEnd = roundMs(end - clipStartSeconds);
    const storedWord = content.words[timelineWordIndex]!;
    const relativeDelta = roundMs(relativeEnd - storedWord.end);
    const storedAbsoluteStart = roundMs(clipStartSeconds + storedWord.start);
    const storedAbsoluteEnd = roundMs(clipStartSeconds + storedWord.end);
    if (Math.abs(storedAbsoluteStart - word.start) > .05 || Math.abs(storedAbsoluteEnd - word.end) > .05 || Math.abs(relativeDelta - delta) > .05) {
      setTimingError("The lyric view and Timeline draft are out of sync. Reload the lyric timing before editing this word.");
      return;
    }
    if (relativeEnd < storedWord.start + .04) { setTimingError("A word must remain at least 40 ms long."); return; }
    if (relativeEnd > timeline.durationInFrames / timeline.fps - clipStartSeconds + .001) {
      setTimingError("This end time is beyond the project duration. No timing was changed.");
      return;
    }
    content.words = content.words.map((entry, index) => index === timelineWordIndex
      ? { ...entry, end: relativeEnd }
      : index > timelineWordIndex && relativeDelta > 0
        ? { ...entry, start: roundMs(entry.start + relativeDelta), end: roundMs(entry.end + relativeDelta) }
        : entry);
    if (wordIndex === lastWordIndex) {
      const lastEnd = Math.max(...content.words.map(entry => entry.end));
      clip.durationInFrames = Math.max(1, Math.ceil(lastEnd * timeline.fps - 1e-8));
    }
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This end time would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map((entry, index) => index === wordIndex
      ? { ...entry, end: roundMs(clipStartSeconds + relativeEnd) }
      : index > wordIndex && relativeDelta > 0
        ? { ...entry, start: entry.start === null ? null : roundMs(entry.start + relativeDelta), end: entry.end === null ? null : roundMs(entry.end + relativeDelta) }
        : entry);
    updateCueDraft({ ...cue, end: Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end)), words });
    seekTo(end);
    setTimingError("");
  };

  const correctWordText = (cue: CorrelationCue, wordId: string, requestedText: string) => {
    if (!draftTimeline) return false;
    const nextText = requestedText.trim();
    const cueIndex = cue.words.findIndex(word => word.id === wordId);
    if (cueIndex < 0 || !nextText) return false;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return false; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) return false;
    const sourceIndex = content.words.findIndex(word => word.id === wordId);
    if (sourceIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing."); return false; }
    const nextCueText = replaceTextToken(content.text, sourceIndex, nextText);
    if (nextCueText === null) { setTimingError("The lyric text and word timing no longer match. Refresh the song map before editing."); return false; }
    content.text = nextCueText;
    content.words[sourceIndex] = { ...content.words[sourceIndex]!, text: nextText };
    if (content.status !== "demo") content.status = "unverified";
    const nextCueWords = cue.words.map(word => word.id === wordId ? { ...word, text: nextText } : word);
    if (!commitWordContent(cue, content, nextCueWords)) return false;
    setTimingMessage("Word text updated in the Timeline draft.");
    return true;
  };

  const addWordAfter = (cue: CorrelationCue, wordId: string, requestedText: string) => {
    if (!draftTimeline) return;
    const text = requestedText.trim();
    const cueIndex = cue.words.findIndex(word => word.id === wordId);
    const selected = cue.words[cueIndex];
    if (cueIndex < 0 || !selected || selected.start === null || selected.end === null || !text) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) return;
    const sourceIndex = content.words.findIndex(word => word.id === wordId);
    if (sourceIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing."); return; }
    if ((content.text.match(/\S+/g) ?? []).length !== content.words.length) { setTimingError("The lyric text and word timing no longer match. Refresh the song map before adding a word."); return; }
    const newStart = selected.end;
    const newEnd = newStart + .35;
    const nextWord = cue.words[cueIndex + 1];
    const shift = nextWord?.start !== null && nextWord?.start !== undefined ? Math.max(0, newEnd - nextWord.start) : 0;
    const relativeStart = Math.max(0, roundMs(newStart - cue.start));
    const relativeEnd = roundMs(relativeStart + .35);
    const id = `manual-word-${crypto.randomUUID()}`;
    content.words = content.words.map((word, index) => index > sourceIndex && shift > 0
      ? { ...word, start: roundMs(word.start + shift), end: roundMs(word.end + shift) }
      : word);
    content.words.splice(sourceIndex + 1, 0, { id, text, start: relativeStart, end: relativeEnd });
    content.text = insertTextTokenAfter(content.text, sourceIndex, text);
    if (content.status !== "demo") content.status = "unverified";
    const newCueWord: CorrelationWord = { id, text, start: newStart, end: newEnd, beatOffsetSeconds: null, eventIds: [], preWordCueIds: [], vocalActivityOverlap: null };
    const nextCueWords = cue.words.map((word, index) => index > cueIndex && shift > 0
      ? { ...word, start: word.start === null ? null : roundMs(word.start + shift), end: word.end === null ? null : roundMs(word.end + shift) }
      : word);
    nextCueWords.splice(cueIndex + 1, 0, newCueWord);
    if (commitWordContent(cue, content, nextCueWords)) {
      setFocusedTimingWordSelection({ cueId: cue.id, wordId: id });
      setManuallySelectedCueId(cue.id);
      seekTo(newStart);
      setWordContextMenu(null);
      setTimingMessage("Word added to the Timeline draft. Adjust its timing, then save.");
    }
  };

  const deleteWord = (cue: CorrelationCue, wordId: string) => {
    if (!draftTimeline || cue.words.length <= 1) return;
    const cueIndex = cue.words.findIndex(word => word.id === wordId);
    const selected = cue.words[cueIndex];
    if (cueIndex < 0 || !selected || selected.start === null || selected.end === null) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) return;
    const sourceIndex = content.words.findIndex(word => word.id === wordId);
    if (sourceIndex < 0) { setTimingError("This word no longer matches the saved Timeline timing."); return; }
    if ((content.text.match(/\S+/g) ?? []).length !== content.words.length) { setTimingError("The lyric text and word timing no longer match. Refresh the song map before deleting a word."); return; }
    const duration = roundMs(selected.end - selected.start);
    content.text = removeTextTokenAt(content.text, sourceIndex);
    content.words = content.words.filter(word => word.id !== wordId).map(word => {
      const index = content.words!.findIndex(entry => entry.id === word.id);
      return index > sourceIndex ? { ...word, start: roundMs(word.start - duration), end: roundMs(word.end - duration) } : word;
    });
    if (content.status !== "demo") content.status = "unverified";
    const nextCueWords = cue.words.filter(word => word.id !== wordId).map((word, index) => index >= cueIndex
      ? { ...word, start: word.start === null ? null : roundMs(word.start - duration), end: word.end === null ? null : roundMs(word.end - duration) }
      : word);
    const nextSelected = nextCueWords[Math.max(0, cueIndex - 1)] ?? nextCueWords[0];
    if (commitWordContent(cue, content, nextCueWords)) {
      setWordContextMenu(null);
      if (nextSelected?.start !== null && nextSelected?.start !== undefined) {
        setFocusedTimingWordSelection({ cueId: cue.id, wordId: nextSelected.id });
        seekTo(nextSelected.start);
      } else setFocusedTimingWordSelection(null);
      setTimingMessage("Word deleted from the Timeline draft. Save to apply the change.");
    }
  };

  const verseShiftLimits = (cue: CorrelationCue) => {
    if (!draftTimeline) return { minFrames: 0, maxFrames: 0 };
    const clips = draftTimeline.clips.filter(item => item.componentId === "subtitles").sort((a, b) => a.from - b.from);
    const index = clips.findIndex(item => item.id === cue.id);
    const clip = clips[index];
    if (!clip) return { minFrames: 0, maxFrames: 0 };
    const previous = clips[index - 1];
    const next = clips[index + 1];
    const minFrom = Math.max(0, previous ? previous.from + previous.durationInFrames : 0);
    const maxFrom = Math.min(draftTimeline.durationInFrames - clip.durationInFrames, next ? next.from - clip.durationInFrames : draftTimeline.durationInFrames - clip.durationInFrames);
    return { minFrames: minFrom - clip.from, maxFrames: maxFrom - clip.from };
  };

  const shiftVerse = (cue: CorrelationCue, requestedDelta: number) => {
    if (!draftTimeline) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const bounds = verseShiftLimits(cue);
    const requestedFrames = Math.sign(requestedDelta) * Math.max(1, Math.round(Math.abs(requestedDelta) * timeline.fps));
    const frameDelta = Math.max(bounds.minFrames, Math.min(bounds.maxFrames, requestedFrames));
    if (!frameDelta) return;
    const newFrom = clip.from + frameDelta;
    const cuePosition = visibleCues.findIndex(item => item.id === cue.id);
    const previousCue = cuePosition > 0 ? visibleCues[cuePosition - 1] : null;
    const nextCueIndex = cuePosition + 1;
    const nextCue = visibleCues[nextCueIndex];
    const newStart = newFrom / timeline.fps;
    const newEnd = (newFrom + clip.durationInFrames) / timeline.fps;
    if ((previousCue && newStart < previousCue.end - 1e-6) || (nextCue && newEnd > nextCue.start + 1e-6)) {
      setTimingError("This lyric cannot move into the neighboring subtitle. Make room there first.");
      return;
    }
    clip.from = newFrom;
    setDraftTimeline(parseEditTimeline(timeline));
    const delta = frameDelta / timeline.fps;
    updateCueDraft({ ...cue, start: roundMs(cue.start + delta), end: roundMs(cue.end + delta), words: cue.words.map(word => ({ ...word, start: word.start === null ? null : roundMs(word.start + delta), end: word.end === null ? null : roundMs(word.end + delta) })) });
    // Keep the playhead fixed: the lyric moves underneath the centered marker.
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
    for (const cueId of cueDirtyIds) {
      const clip = draftTimeline.clips.find(item => item.id === cueId && item.componentId === "subtitles");
      if (!clip) { setTimingError("A changed lyric no longer has a matching Timeline clip. Reload the lyrics before saving."); return; }
      const content = subtitleContentSchema.parse(clip.content);
      const invalidWord = content.words?.find(word => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || word.end - word.start > MAX_MANUAL_WORD_DURATION_SECONDS);
      if (invalidWord) {
        setTimingError(`“${invalidWord.text}” has an invalid or unusually long timing. Correct that word before saving; the Timeline was not changed.`);
        return;
      }
    }
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
  const actionCue = wordContextMenu ? visibleCues.find(cue => cue.id === wordContextMenu.cueId) ?? null : null;
  const actionWord = actionCue && wordContextMenu ? actionCue.words.find(word => word.id === wordContextMenu.wordId) ?? null : null;
  const nextCue = correlation?.cues.find(cue => cue.start > (timingCue?.start ?? playhead)) ?? null;

  return <div className="mlm-page">
    <audio ref={audioRef} hidden preload="metadata" src={audioUrl || undefined} onTimeUpdate={event => { onAudioTimeUpdate(event.currentTarget.currentTime); if (audioPlaying) { setManuallySelectedCueId(null); setFocusedTimingWordSelection(null); } }} onPlay={() => { setAudioPlaying(true); setManuallySelectedCueId(null); setFocusedTimingWordSelection(null); }} onPause={() => setAudioPlaying(false)} onVolumeChange={event => setAudioVolume(event.currentTarget.volume)} onError={() => setAudioError("The selected audio file could not be loaded.")}/>
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
            <div className="mlm-alignment-transport"><button className="mlm-transport-play" onClick={toggleAudioPlayback} disabled={!audioUrl || !reportMatchesSelection} aria-label={audioPlaying ? "Pause soundtrack" : "Play soundtrack"}>{audioPlaying ? "Ⅱ" : "▶"}</button><button className="mlm-seek-step" aria-label="Seek back one frame" title={`Back 1 frame (${(1000 / (draftTimeline?.fps ?? 30)).toFixed(0)} ms); hold to continue`} disabled={!duration} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginSeekHold(-1); }} onPointerUp={endSeekHold} onPointerCancel={endSeekHold} onLostPointerCapture={endSeekHold} onClick={event => { if (event.detail === 0) seekByFrame(-1); }}>←</button><time>{formatTime(playhead)} <span>/ {formatTime(duration)}</span></time><button className="mlm-seek-step" aria-label="Seek forward one frame" title={`Forward 1 frame (${(1000 / (draftTimeline?.fps ?? 30)).toFixed(0)} ms); hold to continue`} disabled={!duration} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginSeekHold(1); }} onPointerUp={endSeekHold} onPointerCancel={endSeekHold} onLostPointerCapture={endSeekHold} onClick={event => { if (event.detail === 0) seekByFrame(1); }}>→</button><input aria-label="Seek soundtrack" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(duration, playhead)} onChange={event => seekFromTimeline(Number(event.currentTarget.value))}/><label className="mlm-alignment-volume" title="Soundtrack volume"><span>Vol</span><input aria-label="Soundtrack volume" type="range" min="0" max="1" step="0.01" value={audioVolume} onChange={event => updateAudioVolume(Number(event.currentTarget.value))}/></label><button className="mlm-open-analysis" onClick={() => setAnalysisTimelineOpen(true)} aria-haspopup="dialog">Full analysis</button></div>
          </div>
          <div className="mlm-lyric-stage">
            {lyricView === "preview" && <div className="mlm-lyric-status">{timingCue ? `${formatTime(timingCue.start)}–${formatTime(timingCue.end)} · ${(timingCue.alignment.wordTimingSource ?? "untimed").toUpperCase()} · ${timingCue.alignment.status.toUpperCase()}` : "INSTRUMENTAL / NO ACTIVE LYRIC"}</div>}
            {lyricView === "preview" ? <><div className="mlm-lyric-main" aria-live="polite">{timingCue?.words.length ? timingCue.words.map((word, index) => {
              const isSung = activeTimingWordIndex >= 0 ? index < activeTimingWordIndex : word.end !== null && playhead >= word.end;
              const isNow = activeTimingWordIndex >= 0 ? index === activeTimingWordIndex : word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end;
              return <span key={word.id} className={`mlm-lyric-token${isSung ? " sung" : isNow ? " now" : " future"}`} onClick={() => { if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } }} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text} </span>;
            }) : timingCue ? <span>{timingCue.text}</span> : <span className="mlm-instrumental-mark">♪</span>}</div>
            <div className="mlm-lyric-next">{nextCue?.text ?? ""}</div></> : <>
              <TimedWordRunway cues={visibleCues} audioRef={audioRef} audioPlaying={audioPlaying} playhead={playhead} duration={duration} visibleSpan={visibleSpan} fps={draftTimeline?.fps ?? 30} correlationZoom={correlationZoom} wordBoxesVisible={wordBoxesVisible} wordGuidesVisible={wordGuidesVisible} seekTo={seekTo} seekFromTimeline={seekFromTimeline} beginAudioScrub={beginAudioScrub} endAudioScrub={endAudioScrub} selectWord={focusWord}/>
            </>}
          </div>
          <div className={`mlm-word-timing-panel${timingCue ? "" : " is-empty"}`}>
            {timingCue && <>
            <div className="mlm-timing-panel-title"><strong>Adjust word timing · {timingCue.text}</strong><span>Click a word to seek · Shift + / − for 10 ms</span></div>
            <div className="mlm-timing-word-controls">{timingCue.words.map((word, index) => {
              const isAtWord = selectedTimingWordId === word.id;
              const timingState = word.start === null || word.end === null ? "untimed" : activeTimingWordIndex >= 0 ? index < activeTimingWordIndex ? "sung" : index === activeTimingWordIndex ? "now" : "upcoming" : word.end <= playhead ? "sung" : word.start <= playhead ? "now" : "upcoming";
              const nextTimedWord = timingCue.words[index + 1];
              const pauseAfter = word.end !== null && nextTimedWord?.start !== null && nextTimedWord?.start !== undefined ? Math.max(0, nextTimedWord.start - word.end) : 0;
              return <Fragment key={`${timingCue.id}:${word.id}`}><div className={`mlm-timing-word ${timingState}${isAtWord ? " is-selected" : ""}`} onClick={event => { if ((event.target as HTMLElement).closest("button:not(.mlm-timing-word-select)")) return; if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } }} onContextMenu={event => { event.preventDefault(); openWordActions(timingCue, word, event.clientX, event.clientY); }}><button className="mlm-timing-word-select" disabled={word.start === null} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text}</button><small>{word.start === null || word.end === null ? "Untimed" : `${formatTime(word.start)} · ${formatDuration(word.end - word.start)}`}</small><div><button disabled={word.start === null || !draftTimeline || timingSaving} aria-label={`Shorten ${word.text}`} title="Shorten by 100 ms (Shift: 10 ms)" onClick={event => { event.stopPropagation(); if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } editWord(timingCue, word.id, event.shiftKey ? -.01 : -.1); }}>−</button><button disabled={word.start === null || !draftTimeline || timingSaving} aria-label={`Lengthen ${word.text}`} title="Lengthen by 100 ms (Shift: 10 ms)" onClick={event => { event.stopPropagation(); if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } editWord(timingCue, word.id, event.shiftKey ? .01 : .1); }}>+</button><button aria-label={`More actions for ${word.text}`} title="Word actions" onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); openWordActions(timingCue, word, rect.left, rect.bottom); }}>…</button></div></div>{pauseAfter >= .04 && <div className="mlm-timing-gap" style={{ "--gap-seconds": pauseAfter } as CSSProperties} title={`Pause · ${formatDuration(pauseAfter)}`} aria-label={`Pause ${formatDuration(pauseAfter)} after ${word.text}`}><span>{formatDuration(pauseAfter)}</span></div>}</Fragment>;
            })}</div>
            {wordContextMenu && actionCue && actionWord && <div className="mlm-word-context-menu" role="menu" style={{ left: Math.max(8, Math.min(wordContextMenu.x, window.innerWidth - 316)), top: Math.max(8, Math.min(wordContextMenu.y, window.innerHeight - 410)) }} onContextMenu={event => event.preventDefault()}><strong>Word actions · “{actionWord.text}”</strong><span>Start/end use the playhead fixed at the timeline center.</span><label>Correct this word<input value={wordTextDraft} onChange={event => setWordTextDraft(event.currentTarget.value)} /></label><button role="menuitem" disabled={!draftTimeline || timingSaving || !wordTextDraft.trim() || wordTextDraft.trim() === actionWord.text} onClick={() => { if (correctWordText(actionCue, actionWord.id, wordTextDraft)) setWordContextMenu(null); }}>Save word text</button><button role="menuitem" disabled={!draftTimeline || timingSaving || actionWord.start === null || !actionCue.words[actionCue.words.findIndex(word => word.id === actionWord.id) + 1]} onClick={() => { addSpaceAfterWord(actionCue, actionWord.id, .1); setWordContextMenu(null); }}>Add space after</button><button role="menuitem" disabled={!draftTimeline || timingSaving || actionWord.start === null} onClick={() => { setWordStartHere(actionCue.id, actionWord.id, playhead); setWordContextMenu(null); }}>Set start at timeline center</button><button role="menuitem" disabled={!draftTimeline || timingSaving || actionWord.end === null} onClick={() => { setWordEndHere(actionCue.id, actionWord.id, playhead); setWordContextMenu(null); }}>Set end at timeline center</button><label>Add a missing word after<input value={newWordTextDraft} onChange={event => setNewWordTextDraft(event.currentTarget.value)} placeholder="Type the missing word" /></label><button role="menuitem" disabled={!draftTimeline || timingSaving || !newWordTextDraft.trim()} onClick={() => addWordAfter(actionCue, actionWord.id, newWordTextDraft)}>Add word after</button><button className="is-danger" role="menuitem" disabled={!draftTimeline || timingSaving || actionCue.words.length <= 1} onClick={() => deleteWord(actionCue, actionWord.id)}>Delete this word</button></div>}
            <div className="mlm-verse-timing-controls"><span>Shift “{timingCue.text}”, keeping word lengths</span><button disabled={!draftTimeline || timingSaving || verseShiftLimits(timingCue).minFrames >= 0} title={`Move earlier; Shift: one frame (${((1 / (draftTimeline?.fps ?? 30)) * 1000).toFixed(0)} ms)`} onClick={event => shiftVerse(timingCue, event.shiftKey ? -1 / (draftTimeline?.fps ?? 30) : -.1)}>←</button><time>{formatTime(timingCue.start)}</time><button disabled={!draftTimeline || timingSaving || verseShiftLimits(timingCue).maxFrames <= 0} title={`Move later; Shift: one frame (${((1 / (draftTimeline?.fps ?? 30)) * 1000).toFixed(0)} ms)`} onClick={event => shiftVerse(timingCue, event.shiftKey ? 1 / (draftTimeline?.fps ?? 30) : .1)}>→</button></div>
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
  fps: number;
  correlationZoom: number;
  wordBoxesVisible: boolean;
  wordGuidesVisible: boolean;
  seekTo: (time: number) => void;
  seekFromTimeline: (time: number) => void;
  beginAudioScrub: () => void;
  endAudioScrub: () => void;
  selectWord: (cueId: string, wordId: string) => void;
};

function TimedWordRunway({ cues, audioRef, audioPlaying, playhead, duration, visibleSpan, fps, correlationZoom, wordBoxesVisible, wordGuidesVisible, seekTo, seekFromTimeline, beginAudioScrub, endAudioScrub, selectWord }: TimedWordRunwayProps) {
  const [displayTime, setDisplayTime] = useState(playhead);
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; time: number } | null>(null);
  const audioStartTimerRef = useRef<number | null>(null);
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
    seekFromTimeline(visibleStart + ratio * safeSpan);
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 1 || !duration) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, time: displayTime };
    setIsPanning(true);
    audioStartTimerRef.current = window.setTimeout(beginAudioScrub, 140);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const plotWidthInPixels = rect.width * PLOT_WIDTH / SVG_WIDTH;
    const secondsPerPixel = safeSpan / Math.max(1, plotWidthInPixels);
    // Dragging the strip left advances song time beneath the fixed center marker.
    seekFromTimeline(clampTime(drag.time - (event.clientX - drag.x) * secondsPerPixel, duration));
  };
  const stopPointerDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
    if (audioStartTimerRef.current !== null) window.clearTimeout(audioStartTimerRef.current);
    audioStartTimerRef.current = null;
    endAudioScrub();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleRunwayKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target !== event.currentTarget && !(event.target instanceof Element && event.target.closest(".mlm-word-runway-word"))) return;
    event.preventDefault();
    const step = 1 / fps;
    seekFromTimeline(clampTime(displayTime + (event.key === "ArrowLeft" ? -step : step), duration));
  };
  const words = cues.flatMap(cue => cue.words.filter(word => word.start !== null && word.end !== null && word.end > word.start && word.end - word.start <= MAX_MANUAL_WORD_DURATION_SECONDS && word.end > visibleStart && word.start < visibleEnd).map(word => {
    const x = xAt(word.start!);
    const width = Math.max(1, xAt(word.end!) - x);
    const textWidth = Math.max(1, width - (wordBoxesVisible ? 12 : 4));
    const state = word.end! <= displayTime ? "sung" : word.start! <= displayTime ? "now" : "future";
    return { cueId: cue.id, word, x, width, textWidth, state };
  }));

  return <svg className={`mlm-word-runway${wordBoxesVisible ? " has-word-boxes" : " is-clean"}${audioPlaying ? " is-playing" : ""}${isPanning ? " is-panning" : ""}`} viewBox={`0 0 ${SVG_WIDTH} 168`} preserveAspectRatio="none" role="group" tabIndex={0} aria-label="Timed lyric words. Use the arrow keys to seek; hold the mouse wheel and drag to scroll." onClick={handleClick} onKeyDown={handleRunwayKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopPointerDrag} onPointerCancel={stopPointerDrag} onLostPointerCapture={() => { if (audioStartTimerRef.current !== null) window.clearTimeout(audioStartTimerRef.current); audioStartTimerRef.current = null; endAudioScrub(); dragRef.current = null; setIsPanning(false); }}>
    <rect className="mlm-word-runway-bg" x="0" y="0" width={SVG_WIDTH} height="168"/>
    {wordGuidesVisible && makeTicks(visibleStart, visibleEnd, duration, correlationZoom).map(tick => <g key={`lyric-tick-${tick}`}><line className="mlm-word-runway-tick" x1={xAt(tick)} x2={xAt(tick)} y1="24" y2="145"/><text className="mlm-word-runway-time" x={xAt(tick) + 3} y="18">{formatTime(tick)}</text></g>)}
    {words.map(({ cueId, word, x, width, textWidth, state }) => <g key={`runway-${cueId}-${word.id}`} className={`mlm-word-runway-word ${state}${wordBoxesVisible ? "" : " no-box"}`} role="button" tabIndex={0} aria-label={`${word.text}, ${formatTime(word.start!)} to ${formatTime(word.end!)}`} onClick={click => { click.stopPropagation(); selectWord(cueId, word.id); seekTo(word.start!); }} onKeyDown={key => { if (key.key === "Enter") { key.preventDefault(); selectWord(cueId, word.id); seekTo(word.start!); } }}><rect x={x} y="48" width={width} height="76" rx="5"/><text x={x + (wordBoxesVisible ? 6 : 2)} y="99" textLength={textWidth} lengthAdjust="spacingAndGlyphs">{word.text}</text><title>{`${word.text} · ${formatTime(word.start!)}–${formatTime(word.end!)}`}</title></g>)}
    {wordGuidesVisible && <line className="mlm-word-runway-playhead" x1={PLOT_LEFT + PLOT_WIDTH / 2} x2={PLOT_LEFT + PLOT_WIDTH / 2} y1="23" y2="145"/>}
  </svg>;
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

function textTokenRange(text: string, tokenIndex: number) {
  const matches = [...text.matchAll(/\S+/g)];
  const match = matches[tokenIndex];
  return match?.index === undefined ? null : { start: match.index, end: match.index + match[0].length };
}

function replaceTextToken(text: string, tokenIndex: number, replacement: string) {
  const range = textTokenRange(text, tokenIndex);
  return range ? `${text.slice(0, range.start)}${replacement}${text.slice(range.end)}` : null;
}

function insertTextTokenAfter(text: string, tokenIndex: number, inserted: string) {
  const range = textTokenRange(text, tokenIndex);
  return range ? `${text.slice(0, range.end)} ${inserted}${text.slice(range.end)}` : text;
}

function removeTextTokenAt(text: string, tokenIndex: number) {
  const range = textTokenRange(text, tokenIndex);
  if (!range) return text;
  if (tokenIndex === 0) return text.slice(range.end).replace(/^\s+/, "");
  const previous = textTokenRange(text, tokenIndex - 1);
  return previous ? `${text.slice(0, previous.end)}${text.slice(range.end)}` : text;
}

function roundMs(seconds: number) { return Math.round(seconds * 1000) / 1000; }
function clampTime(seconds: number, duration: number) { return Math.max(0, Math.min(duration, seconds)); }

function ensureSubtitleFits(timeline: EditTimeline, clip: TimelineClip): EditTimeline | null {
  const index = timeline.clips.findIndex(item => item.id === clip.id);
  if (index < 0) return null;
  const extended = extendSubtitleClipToTimedWords(clip, timeline.fps);
  if (extended.from + extended.durationInFrames > timeline.durationInFrames) return null;
  timeline.clips[index] = extended;
  return parseEditTimeline(timeline);
}
