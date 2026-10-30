import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import { parseEditTimeline, type EditTimeline, type TimelineClip } from "@motion/sdk/timeline";
import { createSubtitleClip, extendSubtitleClipToTimedWords, subtitleContentSchema } from "@motion/lyrics-sync/subtitles";
import { buildWordGravityCurve, getWordGravityAtTime } from "@motion/lyrics-sync/phrasing";
import type { CorrelationCue, CorrelationWord, DirectorBrief, MusicEvent, MusicEventSource, MusicLyricsMap, Report } from "./MusicAnalysis";
import { KineticDirectionTab } from "./KineticDirectionTab";
import "./music-lyrics-map-view.css";

type Source = "drums" | "bass" | "vocals" | "other" | "mix";

type Props = {
  report: Report;
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  refreshAfterSave: () => Promise<void>;
  audioAvailable: boolean;
  audioPlaying: boolean;
  onTogglePlayback: () => void;
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
    report, projectId, refreshAfterSave, audioAvailable, audioPlaying, onTogglePlayback, correlation, directorBrief, correlationStale, correlationBusy, correlationZoom, setCorrelationZoom,
    buildCorrelation, downloadReport, downloadMap, downloadBrief, visibleSources, setVisibleSources,
    playhead, seekTo, playEvent, reportMatchesSelection,
  } = props;
  const [autoFollow, setAutoFollow] = useState(true);
  const [lyricView, setLyricView] = useState<"preview" | "word-timeline" | "kinetic">("preview");
  const [kineticTabOpened, setKineticTabOpened] = useState(false);
  const [eventLanesVisible, setEventLanesVisible] = useState(true);
  const [wordBoxesVisible, setWordBoxesVisible] = useState(true);
  const [wordGuidesVisible, setWordGuidesVisible] = useState(true);
  const [verseBoundsVisible, setVerseBoundsVisible] = useState(true);
  const [wordGravityVisible, setWordGravityVisible] = useState(false);
  const [analysisTimelineOpen, setAnalysisTimelineOpen] = useState(false);
  const [focusedTimingWordSelection, setFocusedTimingWordSelection] = useState<{ cueId: string; wordId: string } | null>(null);
  const [manuallySelectedCueId, setManuallySelectedCueId] = useState<string | null>(null);
  const [wordContextMenu, setWordContextMenu] = useState<{ x: number; y: number; cueId: string; wordId: string } | null>(null);
  const [gapContextMenu, setGapContextMenu] = useState<{ x: number; y: number; cueId: string; leftWordId: string; rightWordId: string } | null>(null);
  const [wordTextDraft, setWordTextDraft] = useState("");
  const [newWordTextDraft, setNewWordTextDraft] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const displaySettingsRef = useRef<HTMLDetailsElement>(null);
  const lyricsListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeDisplaySettings = (event: PointerEvent) => {
      const menu = displaySettingsRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeDisplaySettings);
    return () => document.removeEventListener("pointerdown", closeDisplaySettings);
  }, []);
  const [timelineStart, setTimelineStart] = useState(0);
  const timelineStartRef = useRef(0);
  const [savedTimeline, setSavedTimeline] = useState<EditTimeline | null>(null);
  const [draftTimeline, setDraftTimeline] = useState<EditTimeline | null>(null);
  const [timelineRevision, setTimelineRevision] = useState("");
  const [timingSaving, setTimingSaving] = useState(false);
  const [timingMessage, setTimingMessage] = useState("");
  const [timingError, setTimingError] = useState("");
  const [cueDrafts, setCueDrafts] = useState<Record<string, CorrelationCue>>({});
  const [addedCueDrafts, setAddedCueDrafts] = useState<Record<string, CorrelationCue>>({});
  const [removedCueIds, setRemovedCueIds] = useState<string[]>([]);
  const [cueDirtyIds, setCueDirtyIds] = useState<string[]>([]);
  const [timingDraftDirty, setTimingDraftDirty] = useState(false);
  const [cueContextMenu, setCueContextMenu] = useState<{ x: number; y: number; cueId: string; direction?: "before" | "after" } | null>(null);
  const [newCueTextDraft, setNewCueTextDraft] = useState("");
  useEffect(() => {
    if (!cueContextMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".mlm-cue-context-menu")) setCueContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCueContextMenu(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [cueContextMenu]);
  const seekRepeatRef = useRef<number | null>(null);
  const seekAudioStartTimerRef = useRef<number | null>(null);
  const seekPreviewStopRef = useRef<number | null>(null);
  const seekRepeatTimeRef = useRef(0);
  const seekHoldActiveRef = useRef(false);
  const seekHoldAudioStartedRef = useRef(false);
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
      setCueDrafts({});
      setAddedCueDrafts({});
      setRemovedCueIds([]);
      setCueDirtyIds([]);
      setTimingDraftDirty(false);
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
  const visibleCues = [
    ...(correlation?.cues ?? []).filter(cue => !removedCueIds.includes(cue.id)),
    ...Object.values(addedCueDrafts),
  ].map(cue => cueDrafts[cue.id] ?? cue).sort((a, b) => a.start - b.start);
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
    if (audioAvailable) onTogglePlayback();
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
    if (!audioAvailable || audioPlaying || !reportMatchesSelection) return;
    scrubStartedPlaybackRef.current = true;
    onTogglePlayback();
  };

  const endAudioScrub = () => {
    if (scrubStartedPlaybackRef.current) onTogglePlayback();
    scrubStartedPlaybackRef.current = false;
  };

  const previewSeekAudio = () => {
    if (!audioAvailable || !reportMatchesSelection) return;
    if (seekPreviewStopRef.current !== null) window.clearTimeout(seekPreviewStopRef.current);
    seekPreviewStopRef.current = null;
    if (!audioPlaying) beginAudioScrub();
    // A brief tap should audition the newly selected position too; holding
    // an arrow continues to scrub and is stopped by endSeekHold instead.
    if (scrubStartedPlaybackRef.current) {
      seekPreviewStopRef.current = window.setTimeout(() => {
        seekPreviewStopRef.current = null;
        endAudioScrub();
      }, 260);
    }
  };

  const beginSeekHold = (direction: -1 | 1) => {
    if (!duration) return;
    seekHoldActiveRef.current = true;
    seekHoldAudioStartedRef.current = false;
    if (seekPreviewStopRef.current !== null) window.clearTimeout(seekPreviewStopRef.current);
    seekPreviewStopRef.current = null;
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    seekRepeatRef.current = null;
    seekRepeatTimeRef.current = playhead;
    seekByFrame(direction, seekRepeatTimeRef.current);
    seekRepeatRef.current = window.setInterval(() => seekByFrame(direction, seekRepeatTimeRef.current), 33);
    seekAudioStartTimerRef.current = window.setTimeout(() => {
      seekHoldAudioStartedRef.current = true;
      beginAudioScrub();
    }, 140);
  };

  const endSeekHold = () => {
    if (!seekHoldActiveRef.current) return;
    seekHoldActiveRef.current = false;
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    seekRepeatRef.current = null;
    if (seekAudioStartTimerRef.current !== null) window.clearTimeout(seekAudioStartTimerRef.current);
    seekAudioStartTimerRef.current = null;
    const audioStartedByHold = seekHoldAudioStartedRef.current;
    seekHoldAudioStartedRef.current = false;
    if (audioStartedByHold) endAudioScrub();
    else previewSeekAudio();
  };
  useEffect(() => () => {
    if (seekRepeatRef.current !== null) window.clearInterval(seekRepeatRef.current);
    if (seekAudioStartTimerRef.current !== null) window.clearTimeout(seekAudioStartTimerRef.current);
    if (seekPreviewStopRef.current !== null) window.clearTimeout(seekPreviewStopRef.current);
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

  const setGapEdgeAtPlayhead = (cue: CorrelationCue, leftWordId: string, rightWordId: string, edge: "start" | "end") => {
    if (!draftTimeline) return;
    const leftIndex = cue.words.findIndex(word => word.id === leftWordId);
    const rightIndex = cue.words.findIndex(word => word.id === rightWordId);
    const left = cue.words[leftIndex];
    const right = cue.words[rightIndex];
    if (!left || !right || rightIndex !== leftIndex + 1 || left.start === null || left.end === null || right.start === null || right.end === null) {
      setTimingError("This gap no longer matches two adjacent timed words. Refresh the lyric timing before editing it.");
      return;
    }
    const time = roundMs(playhead);
    const valid = edge === "start"
      ? time >= left.start + .04 && time <= right.start
      : time >= left.end && time <= right.end - .04;
    if (!valid) {
      setTimingError(`Place the playhead between ${formatTime(left.start + .04)} and ${formatTime(right.start)} to set the gap ${edge === "start" ? "start" : "end"}.`);
      return;
    }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) { setTimingError("This lyric line has no editable word timing."); return; }
    const leftTimelineIndex = content.words.findIndex(word => word.id === leftWordId);
    const rightTimelineIndex = content.words.findIndex(word => word.id === rightWordId);
    if (leftTimelineIndex < 0 || rightTimelineIndex !== leftTimelineIndex + 1) { setTimingError("The gap no longer matches adjacent Timeline words. No timing was changed."); return; }
    const relativeTime = roundMs(time - clip.from / timeline.fps);
    content.words = content.words.map((word, index) => index === (edge === "start" ? leftTimelineIndex : rightTimelineIndex)
      ? edge === "start" ? { ...word, end: relativeTime } : { ...word, start: relativeTime }
      : word);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This gap boundary would extend beyond the project duration."); return; }
    const words = cue.words.map((word, index) => index === (edge === "start" ? leftIndex : rightIndex)
      ? edge === "start" ? { ...word, end: time } : { ...word, start: time }
      : word);
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, words });
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection({ cueId: cue.id, wordId: edge === "start" ? leftWordId : rightWordId });
    setGapContextMenu(null);
    setTimingError("");
  };

  const closeGapAndShare = (cue: CorrelationCue, leftWordId: string, rightWordId: string) => {
    if (!draftTimeline) return;
    const leftIndex = cue.words.findIndex(word => word.id === leftWordId);
    const rightIndex = cue.words.findIndex(word => word.id === rightWordId);
    const left = cue.words[leftIndex];
    const right = cue.words[rightIndex];
    if (!left || !right || rightIndex !== leftIndex + 1 || left.start === null || left.end === null || right.start === null || right.end === null) {
      setTimingError("This gap no longer matches two adjacent timed words. Refresh the lyric timing before editing it.");
      return;
    }
    const gap = roundMs(right.start - left.end);
    if (gap <= 0) { setGapContextMenu(null); return; }
    const share = gap / 2;
    const leftStart = left.start;
    const leftEnd = left.end;
    const rightStart = right.start;
    const rightEnd = right.end;
    if (leftEnd - leftStart + share > MAX_MANUAL_WORD_DURATION_SECONDS || rightEnd - rightStart + share > MAX_MANUAL_WORD_DURATION_SECONDS) {
      setTimingError("The gap cannot be shared because it would make a neighboring word too long.");
      return;
    }
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words) { setTimingError("This lyric line has no editable word timing."); return; }
    const leftTimelineIndex = content.words.findIndex(word => word.id === leftWordId);
    const rightTimelineIndex = content.words.findIndex(word => word.id === rightWordId);
    if (leftTimelineIndex < 0 || rightTimelineIndex !== leftTimelineIndex + 1) { setTimingError("The gap no longer matches adjacent Timeline words. No timing was changed."); return; }
    const relativeLeftEnd = roundMs(leftEnd + share - clip.from / timeline.fps);
    const relativeRightStart = roundMs(rightStart - (gap - share) - clip.from / timeline.fps);
    content.words = content.words.map((word, index) => index === leftTimelineIndex ? { ...word, end: relativeLeftEnd } : index === rightTimelineIndex ? { ...word, start: relativeRightStart } : word);
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This change would extend beyond the project duration."); return; }
    const words = cue.words.map((word, index) => index === leftIndex ? { ...word, end: roundMs(leftEnd + share) } : index === rightIndex ? { ...word, start: roundMs(rightStart - (gap - share)) } : word);
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, words });
    setManuallySelectedCueId(cue.id);
    setGapContextMenu(null);
    setTimingError("");
    setTimingMessage(`Removed the ${formatDuration(gap)} gap and shared it between “${left.text}” and “${right.text}”.`);
  };

  const openGapActions = (cue: CorrelationCue, leftWordId: string, rightWordId: string, x: number, y: number) => {
    setGapContextMenu(current => current?.cueId === cue.id && current.leftWordId === leftWordId && current.rightWordId === rightWordId
      ? null
      : { x: Math.max(8, Math.min(x, window.innerWidth - 316)), y: Math.max(8, Math.min(y, window.innerHeight - 270)), cueId: cue.id, leftWordId, rightWordId });
    setWordContextMenu(null);
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection({ cueId: cue.id, wordId: leftWordId });
  };

  const setWordStartHere = (cueId: string, wordId: string, time: number) => {
    if (!draftTimeline) return;
    const cue = visibleCues.find(item => item.id === cueId && item.words.some(word => word.id === wordId));
    const wordIndex = cue?.words.findIndex(word => word.id === wordId) ?? -1;
    if (!cue || wordIndex < 0) return;
    const word = cue.words[wordIndex];
    if (word.start === null || word.end === null) return;
    const previousTimed = [...cue.words.slice(0, wordIndex)].reverse().find(entry => entry.end !== null);
    const requestedStart = roundMs(time);
    if (requestedStart < (previousTimed?.end ?? 0)) {
      setTimingError("This start would overlap the previous word. Move the playhead after that word first.");
      return;
    }
    const nextStart = requestedStart;
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
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection({ cueId: cue.id, wordId });
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
    const timingUpdates = new Map<string, { start: number | null; end: number | null }>();
    timingUpdates.set(wordId, { start: word.start, end });
    let redistributedSeconds = 0;
    if (delta < 0) {
      const followingTimedWords = cue.words.slice(wordIndex + 1).filter(entry => entry.start !== null && entry.end !== null && entry.end > entry.start);
      if (followingTimedWords.length) {
        const releasedSeconds = roundMs(-delta);
        const releasedMilliseconds = Math.round(releasedSeconds * 1000);
        const baseShareMilliseconds = Math.floor(releasedMilliseconds / followingTimedWords.length);
        const extraShareWords = releasedMilliseconds % followingTimedWords.length;
        const shares = followingTimedWords.map((_, index) => (baseShareMilliseconds + (index < extraShareWords ? 1 : 0)) / 1000);
        if (followingTimedWords.some((entry, index) => entry.end! - entry.start! + shares[index]! > MAX_MANUAL_WORD_DURATION_SECONDS)) {
          setTimingError("The removed time cannot be shared evenly because a following word would exceed the 15 second limit.");
          return;
        }
        let cursor = end;
        let previousOriginalEnd = word.end;
        for (let index = 0; index < followingTimedWords.length; index++) {
          const following = followingTimedWords[index]!;
          const share = shares[index]!;
          const originalGap = Math.max(0, following.start! - previousOriginalEnd);
          const nextStart = roundMs(cursor + originalGap);
          const nextEnd = roundMs(nextStart + (following.end! - following.start!) + share);
          if (nextEnd - nextStart > MAX_MANUAL_WORD_DURATION_SECONDS) {
            setTimingError("The removed time cannot be shared without making a following word too long.");
            return;
          }
          timingUpdates.set(following.id, { start: nextStart, end: nextEnd });
          cursor = nextEnd;
          previousOriginalEnd = following.end!;
        }
        redistributedSeconds = releasedSeconds;
      }
    } else if (relativeDelta > 0) {
      // Extending this word pushes later words together, preserving their gaps.
      for (const entry of cue.words.slice(wordIndex + 1)) {
        if (entry.start !== null && entry.end !== null) timingUpdates.set(entry.id, { start: roundMs(entry.start + relativeDelta), end: roundMs(entry.end + relativeDelta) });
      }
    }
    const missingUpdatedWord = [...timingUpdates.keys()].some(id => !content.words!.some(entry => entry.id === id));
    if (missingUpdatedWord) { setTimingError("The lyric view and Timeline draft are out of sync. Reload the lyric timing before editing this word."); return; }
    for (const [id, update] of timingUpdates) {
      const sourceWord = cue.words.find(entry => entry.id === id);
      const stored = content.words.find(entry => entry.id === id);
      if (!sourceWord || !stored || sourceWord.start === null || sourceWord.end === null || Math.abs(roundMs(clipStartSeconds + stored.start) - sourceWord.start) > .05 || Math.abs(roundMs(clipStartSeconds + stored.end) - sourceWord.end) > .05 || update.start === null || update.end === null) {
        setTimingError("The lyric view and Timeline draft are out of sync. Reload the lyric timing before editing this word.");
        return;
      }
    }
    content.words = content.words.map(entry => {
      const update = timingUpdates.get(entry.id);
      if (!update) return entry;
      return {
        ...entry,
        start: update.start === null ? entry.start : roundMs(update.start - clipStartSeconds),
        end: update.end === null ? entry.end : roundMs(update.end - clipStartSeconds),
      };
    });
    if (wordIndex === lastWordIndex) {
      const lastEnd = Math.max(...content.words.map(entry => entry.end));
      clip.durationInFrames = Math.max(1, Math.ceil(lastEnd * timeline.fps - 1e-8));
    }
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This end time would extend beyond the project duration."); return; }
    setDraftTimeline(adjusted);
    const words = cue.words.map(entry => {
      const update = timingUpdates.get(entry.id);
      return update ? { ...entry, start: update.start, end: update.end } : entry;
    });
    updateCueDraft({ ...cue, end: Math.max(cue.end, ...words.map(entry => entry.end ?? cue.end)), words });
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection({ cueId: cue.id, wordId });
    setTimingError("");
    setTimingMessage(redistributedSeconds > 0
      ? `Shortened “${word.text}” and shared ${formatDuration(redistributedSeconds)} across ${cue.words.filter((entry, index) => index > wordIndex && entry.start !== null && entry.end !== null).length} following words.`
      : "");
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

  const verseShiftHint = (cue: CorrelationCue) => {
    const index = visibleCues.findIndex(item => item.id === cue.id);
    const next = visibleCues[index + 1];
    const previous = visibleCues[index - 1];
    const bounds = verseShiftLimits(cue);
    const fps = draftTimeline?.fps ?? 30;
    const firstTimedWord = cue.words.find(word => word.start !== null && word.end !== null);
    const leadingGap = firstTimedWord?.start === null || firstTimedWord?.start === undefined ? 0 : Math.max(0, firstTimedWord.start - cue.start);
    const leadIn = leadingGap >= .04 ? `Caption begins at ${formatTime(cue.start)}; first timed word begins at ${formatTime(firstTimedWord!.start!)} (${formatDuration(leadingGap)} lead-in). ` : "";
    if (next && bounds.maxFrames <= 0) return `${leadIn}No room after this lyric: the next one starts at ${formatTime(next.start)}. Drag its orange right handle left to shorten it, then move it.`;
    if (next) return `${leadIn}Up to ${formatDuration(bounds.maxFrames / fps)} available before the next lyric at ${formatTime(next.start)}. To move farther, shorten this line with its orange handle first.`;
    if (bounds.minFrames >= 0 && previous) return `${leadIn}No gap before this lyric: the previous one ends at ${formatTime(previous.end)}.`;
    if (previous) return `${leadIn}Up to ${formatDuration(-bounds.minFrames / fps)} available after the previous lyric ends at ${formatTime(previous.end)}.`;
    return `${leadIn}The lyric stops at its neighbor; it will not overlap another line.`;
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

  const stretchVerseEdge = (sourceCue: CorrelationCue, edge: "start" | "end", requestedTime: number, requireExact = false) => {
    if (!draftTimeline || timingSaving) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === sourceCue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || content.words.length !== sourceCue.words.length || content.words.some((word, index) => word.id !== sourceCue.words[index]?.id)) {
      setTimingError("The lyric words no longer match the Timeline draft. Reload the lyric timing before stretching this line.");
      return;
    }
    const timedWords = sourceCue.words.filter(word => word.start !== null && word.end !== null && word.end > word.start);
    if (!timedWords.length) { setTimingError("This lyric has no timed words to stretch."); return; }
    const originalStartFrame = Math.round(sourceCue.start * timeline.fps);
    const originalEndFrame = Math.round(sourceCue.end * timeline.fps);
    const cueFrames = Math.max(1, originalEndFrame - originalStartFrame);
    const minScale = Math.max(...timedWords.map(word => .04 / (word.end! - word.start!)));
    const maxScale = Math.min(...timedWords.map(word => MAX_MANUAL_WORD_DURATION_SECONDS / (word.end! - word.start!)));
    const neighbors = timeline.clips.filter(item => item.componentId === "subtitles" && item.id !== clip.id).sort((a, b) => a.from - b.from);
    const previousClip = neighbors.filter(item => item.from < originalStartFrame).at(-1);
    const nextClip = neighbors.find(item => item.from >= originalEndFrame);
    const minimumFrames = Math.max(1, Math.ceil(cueFrames * minScale));
    const maximumFrames = Math.min(Math.floor(cueFrames * maxScale), timeline.durationInFrames);
    if (minimumFrames > maximumFrames) { setTimingError("This lyric cannot fit while keeping every word within its allowed duration."); return; }
    const lowerStartFrame = Math.max(0, previousClip ? previousClip.from + previousClip.durationInFrames : 0, originalEndFrame - maximumFrames);
    const upperEndFrame = Math.min(timeline.durationInFrames, nextClip ? nextClip.from : timeline.durationInFrames, originalStartFrame + maximumFrames);
    const newStartFrame = edge === "start"
      ? Math.max(lowerStartFrame, Math.min(originalEndFrame - minimumFrames, Math.round(requestedTime * timeline.fps)))
      : originalStartFrame;
    const newEndFrame = edge === "end"
      ? Math.max(originalStartFrame + minimumFrames, Math.min(upperEndFrame, Math.round(requestedTime * timeline.fps)))
      : originalEndFrame;
    const requestedFrame = Math.round(requestedTime * timeline.fps);
    if (requireExact && (edge === "start" ? newStartFrame : newEndFrame) !== requestedFrame) {
      setTimingError("The playhead cannot be used as this boundary without overlapping a neighboring lyric or making a word too short or too long.");
      return;
    }
    const nextDuration = newEndFrame - newStartFrame;
    if (nextDuration < minimumFrames || nextDuration > maximumFrames || nextDuration === clip.durationInFrames && newStartFrame === clip.from) return;
    const scale = nextDuration / cueFrames;
    const originalStart = originalStartFrame / timeline.fps;
    const clipStart = newStartFrame / timeline.fps;
    content.words = content.words.map((word, index) => {
      const source = sourceCue.words[index]!;
      if (source.start === null || source.end === null) return word;
      const start = clipStart + (source.start - originalStart) * scale;
      const end = clipStart + (source.end - originalStart) * scale;
      return { ...word, start: roundMs(start - clipStart), end: roundMs(end - clipStart) };
    });
    clip.content = content;
    clip.from = newStartFrame;
    clip.durationInFrames = nextDuration;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This stretched lyric would extend beyond the project duration."); return; }
    const words = sourceCue.words.map(word => word.start === null || word.end === null ? word : {
      ...word,
      start: roundMs(clipStart + (word.start - originalStart) * scale),
      end: roundMs(clipStart + (word.end - originalStart) * scale),
    });
    setDraftTimeline(adjusted);
    updateCueDraft({ ...sourceCue, start: roundMs(clipStart), end: roundMs(clipStart + nextDuration / timeline.fps), words });
    setTimingError("");
  };

  const setVerseEdgeAtPlayhead = (cue: CorrelationCue, edge: "start" | "end") => {
    stretchVerseEdge(cue, edge, playhead, true);
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection(null);
  };

  const addVerseEdgeTime = (cue: CorrelationCue, edge: "start" | "end") => {
    stretchVerseEdge(cue, edge, edge === "start" ? cue.start - .1 : cue.end + .1, true);
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection(null);
  };

  const trimCueGap = (cue: CorrelationCue, edge: "start" | "end") => {
    if (!draftTimeline || timingSaving) return;
    const timeline = structuredClone(draftTimeline);
    const clip = timeline.clips.find(item => item.id === cue.id && item.componentId === "subtitles");
    if (!clip) { setTimingError("This lyric line no longer points to a Timeline subtitle clip."); return; }
    const content = subtitleContentSchema.parse(clip.content);
    if (!content.words || content.words.length !== cue.words.length || content.words.some((word, index) => word.id !== cue.words[index]?.id)) {
      setTimingError("The lyric words no longer match the Timeline draft. Reload the lyric timing before trimming this gap.");
      return;
    }
    const firstWord = cue.words.find(word => word.start !== null && word.end !== null);
    const lastWord = [...cue.words].reverse().find(word => word.start !== null && word.end !== null);
    if (edge === "start") {
      if (firstWord?.start === null || firstWord?.start === undefined || firstWord.start <= cue.start) return;
      const originalFrom = clip.from;
      const originalEnd = clip.from + clip.durationInFrames;
      const newFrom = Math.min(originalEnd - 1, Math.max(originalFrom, Math.floor(firstWord.start * timeline.fps + 1e-6)));
      const deltaSeconds = (newFrom - originalFrom) / timeline.fps;
      if (newFrom <= clip.from) return;
      content.words = content.words.map(word => word.start === null || word.end === null
        ? word
        : { ...word, start: roundMs(word.start - deltaSeconds), end: roundMs(word.end - deltaSeconds) });
      clip.from = newFrom;
      clip.durationInFrames = originalEnd - newFrom;
    } else {
      if (lastWord?.end === null || lastWord?.end === undefined || lastWord.end >= cue.end) return;
      const newEnd = Math.max(clip.from + 1, Math.min(clip.from + clip.durationInFrames, Math.ceil(lastWord.end * timeline.fps - 1e-8)));
      if (newEnd >= clip.from + clip.durationInFrames) return;
      clip.durationInFrames = newEnd - clip.from;
    }
    clip.content = content;
    const adjusted = ensureSubtitleFits(timeline, clip);
    if (!adjusted) { setTimingError("This trim would cut off a timed word. No change was made."); return; }
    const clipStart = clip.from / timeline.fps;
    const clipEnd = (clip.from + clip.durationInFrames) / timeline.fps;
    setDraftTimeline(adjusted);
    updateCueDraft({ ...cue, start: roundMs(clipStart), end: roundMs(clipEnd) });
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection(null);
    setTimingMessage(edge === "start" ? "Leading blank time removed. Word timings on the song were preserved." : "Trailing blank time removed. Word timings on the song were preserved.");
    setTimingError("");
  };

  const selectRunwayCue = (cueId: string) => {
    setManuallySelectedCueId(cueId);
    setFocusedTimingWordSelection(null);
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

  const lyricInsertionSlot = (cueId: string, direction: "before" | "after") => {
    if (!draftTimeline) return null;
    const clips = draftTimeline.clips
      .filter(item => item.componentId === "subtitles")
      .sort((a, b) => a.from - b.from);
    const targetIndex = clips.findIndex(item => item.id === cueId);
    if (targetIndex < 0) return null;
    const target = clips[targetIndex]!;
    const targetEnd = target.from + target.durationInFrames;
    const previous = clips[targetIndex - 1];
    const next = clips[targetIndex + 1];
    const gapStart = direction === "before" ? (previous ? previous.from + previous.durationInFrames : 0) : targetEnd;
    const gapEnd = direction === "before" ? target.from : (next ? next.from : draftTimeline.durationInFrames);
    const gapFrames = gapEnd - gapStart;
    const minimumFrames = Math.max(1, Math.ceil(draftTimeline.fps * 0.4));
    if (gapFrames < minimumFrames) return null;
    const durationInFrames = Math.min(gapFrames, Math.max(minimumFrames, Math.round(draftTimeline.fps * 2)));
    return {
      trackId: target.trackId,
      from: direction === "before" ? gapEnd - durationInFrames : gapStart,
      durationInFrames,
    };
  };

  const openCueActions = (cue: CorrelationCue, x: number, y: number) => {
    setManuallySelectedCueId(cue.id);
    setFocusedTimingWordSelection(null);
    setNewCueTextDraft("");
    setCueContextMenu({ x, y, cueId: cue.id });
  };

  const deleteLyricCue = (cue: CorrelationCue) => {
    if (!draftTimeline || timingSaving) return;
    const timeline = structuredClone(draftTimeline);
    const clipIndex = timeline.clips.findIndex(item => item.id === cue.id && item.componentId === "subtitles");
    if (clipIndex < 0) { setTimingError("This lyric is no longer in the Timeline draft. Reload the lyrics before changing it."); return; }
    timeline.clips.splice(clipIndex, 1);
    const nextTimeline = parseEditTimeline(timeline);
    const wasAddedInDraft = Object.prototype.hasOwnProperty.call(addedCueDrafts, cue.id);
    setDraftTimeline(nextTimeline);
    setAddedCueDrafts(current => { const next = { ...current }; delete next[cue.id]; return next; });
    setRemovedCueIds(current => wasAddedInDraft ? current : [...new Set([...current, cue.id])]);
    setCueDrafts(current => { const next = { ...current }; delete next[cue.id]; return next; });
    setCueDirtyIds(current => current.filter(id => id !== cue.id));
    setTimingDraftDirty(!wasAddedInDraft || removedCueIds.length > 0 || Object.keys(addedCueDrafts).some(id => id !== cue.id) || cueDirtyIds.some(id => id !== cue.id));
    setCueContextMenu(null);
    const remaining = visibleCues.filter(item => item.id !== cue.id);
    const replacement = remaining[Math.min(visibleCues.findIndex(item => item.id === cue.id), remaining.length - 1)];
    setManuallySelectedCueId(replacement?.id ?? null);
    if (replacement) seekTo(replacement.start);
    setTimingMessage("Lyric deleted from the Timeline draft. Save to apply the change.");
    setTimingError("");
  };

  const addLyricCue = (cue: CorrelationCue, direction: "before" | "after") => {
    if (!draftTimeline || timingSaving) return;
    const text = newCueTextDraft.trim();
    if (!text) return;
    const slot = lyricInsertionSlot(cue.id, direction);
    if (!slot) {
      setTimingError(`There is not enough free Timeline space ${direction} this lyric. Shorten or move a neighboring lyric first.`);
      return;
    }
    const id = `subtitle-${crypto.randomUUID()}`;
    const clip = createSubtitleClip({
      id,
      trackId: slot.trackId,
      from: slot.from,
      durationInFrames: slot.durationInFrames,
      content: { text, status: "unverified", ...(cue.section ? { section: cue.section } : {}) },
    });
    const timeline = structuredClone(draftTimeline);
    timeline.clips.push(clip);
    timeline.clips.sort((a, b) => a.from - b.from);
    const start = slot.from / timeline.fps;
    const end = (slot.from + slot.durationInFrames) / timeline.fps;
    const addedCue: CorrelationCue = {
      id,
      text,
      start,
      end,
      alignment: { status: "unverified", timingStatus: "untimed" },
      section: cue.section,
      beatTimes: [],
      downbeatTimes: [],
      eventIds: [],
      energy: { mean: null, peak: null },
      words: [],
    };
    setDraftTimeline(parseEditTimeline(timeline));
    setAddedCueDrafts(current => ({ ...current, [id]: addedCue }));
    setTimingDraftDirty(true);
    setManuallySelectedCueId(id);
    setFocusedTimingWordSelection(null);
    setCueContextMenu(null);
    seekTo(start);
    setTimingMessage("Lyric added to the Timeline draft without word timing. Review it against the audio, then Save.");
    setTimingError("");
  };

  const discardTimingDraft = () => {
    if (!savedTimeline) return;
    setDraftTimeline(structuredClone(savedTimeline));
    setCueDrafts({});
    setAddedCueDrafts({});
    setRemovedCueIds([]);
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
      setAddedCueDrafts({});
      setRemovedCueIds([]);
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
  const cueAction = cueContextMenu ? visibleCues.find(cue => cue.id === cueContextMenu.cueId) ?? null : null;
  const beforeCueSlot = cueAction ? lyricInsertionSlot(cueAction.id, "before") : null;
  const afterCueSlot = cueAction ? lyricInsertionSlot(cueAction.id, "after") : null;
  const actionWord = actionCue && wordContextMenu ? actionCue.words.find(word => word.id === wordContextMenu.wordId) ?? null : null;
  const gapActionCue = gapContextMenu ? visibleCues.find(cue => cue.id === gapContextMenu.cueId) ?? null : null;
  const gapActionLeftWord = gapActionCue && gapContextMenu ? gapActionCue.words.find(word => word.id === gapContextMenu.leftWordId) ?? null : null;
  const gapActionRightWord = gapActionCue && gapContextMenu ? gapActionCue.words.find(word => word.id === gapContextMenu.rightWordId) ?? null : null;
  const nextCue = correlation?.cues.find(cue => cue.start > (timingCue?.start ?? playhead)) ?? null;
  const timingGapRows = visibleCues.map(cue => {
    const timedWords = cue.words.filter(word => word.start !== null && word.end !== null);
    if (!timedWords.length) return null;
    const firstWord = timedWords[0]!;
    const lastWord = timedWords[timedWords.length - 1]!;
    const leadIn = Math.max(0, firstWord.start! - cue.start);
    const tail = Math.max(0, cue.end - lastWord.end!);
    return leadIn >= .04 || tail >= .04 ? { cue, firstWord, lastWord, leadIn, tail } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return <div className="mlm-page">
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
            <div className="mlm-lyric-view-tabs" role="tablist" aria-label="Lyric display mode"><button role="tab" aria-selected={lyricView === "preview"} className={lyricView === "preview" ? "is-active" : ""} onClick={() => setLyricView("preview")}>Karaoke preview</button><button role="tab" aria-selected={lyricView === "word-timeline"} className={lyricView === "word-timeline" ? "is-active" : ""} onClick={() => setLyricView("word-timeline")}>Timed word layout</button><button role="tab" aria-selected={lyricView === "kinetic"} className={lyricView === "kinetic" ? "is-active" : ""} onClick={() => { setKineticTabOpened(true); setLyricView("kinetic"); }}>Kinetic direction</button>
              <details ref={displaySettingsRef} className="mlm-display-settings"><summary>Display settings</summary><div className="mlm-display-settings-menu">
                <button className="mlm-clean-view-action" onClick={() => { setWordBoxesVisible(false); setWordGuidesVisible(false); setAnalysisTimelineOpen(false); setDetailsOpen(false); }}>Clean text only</button>
                <label><input type="checkbox" checked={wordBoxesVisible} onChange={event => setWordBoxesVisible(event.currentTarget.checked)}/> Word backgrounds and borders</label>
                <label><input type="checkbox" checked={wordGuidesVisible} onChange={event => setWordGuidesVisible(event.currentTarget.checked)}/> Time ruler and playhead</label>
                <label><input type="checkbox" checked={verseBoundsVisible} onChange={event => setVerseBoundsVisible(event.currentTarget.checked)}/> Lyric range and stretch handles</label>
                <label title="Shows the duration-based curve from the experiment; it is not an emotion or acoustic measurement."><input type="checkbox" checked={wordGravityVisible} onChange={event => setWordGravityVisible(event.currentTarget.checked)}/> Word gravity curve</label>
              </div></details>
              <div className={`mlm-word-zoom${lyricView !== "word-timeline" ? " is-placeholder" : ""}`}><button aria-label="Zoom out words" title="Show more time" disabled={lyricView !== "word-timeline"} onClick={() => setWordZoom(1.5)}>−</button><span>{lyricView !== "word-timeline" ? "" : `${formatTime(visibleSpan)} view`}</span><button aria-label="Zoom in words" title="Show less time" disabled={lyricView !== "word-timeline"} onClick={() => setWordZoom(.67)}>+</button></div>
            </div>
            <div className="mlm-alignment-transport"><button className="mlm-transport-play" onClick={toggleAudioPlayback} disabled={!audioAvailable} aria-label={audioPlaying ? "Pause soundtrack" : "Play soundtrack"}>{audioPlaying ? "Ⅱ" : "▶"}</button><button className="mlm-seek-step" aria-label="Seek back one frame" title={`Back 1 frame (${(1000 / (draftTimeline?.fps ?? 30)).toFixed(0)} ms); hold to continue`} disabled={!duration || !audioAvailable} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginSeekHold(-1); }} onPointerUp={endSeekHold} onPointerCancel={endSeekHold} onLostPointerCapture={endSeekHold} onClick={event => { if (event.detail === 0) { seekByFrame(-1); previewSeekAudio(); } }}>←</button><time>{formatTime(playhead)} <span>/ {formatTime(duration)}</span></time><button className="mlm-seek-step" aria-label="Seek forward one frame" title={`Forward 1 frame (${(1000 / (draftTimeline?.fps ?? 30)).toFixed(0)} ms); hold to continue`} disabled={!duration || !audioAvailable} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginSeekHold(1); }} onPointerUp={endSeekHold} onPointerCancel={endSeekHold} onLostPointerCapture={endSeekHold} onClick={event => { if (event.detail === 0) { seekByFrame(1); previewSeekAudio(); } }}>→</button><input aria-label="Seek soundtrack" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(duration, playhead)} onChange={event => seekFromTimeline(Number(event.currentTarget.value))} disabled={!audioAvailable}/><button className="mlm-open-analysis" onClick={() => setAnalysisTimelineOpen(true)} aria-haspopup="dialog">Full analysis</button></div>
          </div>
          {correlation && kineticTabOpened && <div hidden={lyricView !== "kinetic"}><KineticDirectionTab projectId={projectId} width={props.projectWidth} height={props.projectHeight} correlation={correlation} report={report} playhead={playhead} seekTo={seekTo} stale={correlationStale}/></div>}
          {lyricView !== "kinetic" && <div className="mlm-lyric-stage">
            {lyricView === "preview" && <div className="mlm-lyric-status">{timingCue ? `${formatTime(timingCue.start)}–${formatTime(timingCue.end)} · ${(timingCue.alignment.wordTimingSource ?? "untimed").toUpperCase()} · ${timingCue.alignment.status.toUpperCase()}` : "INSTRUMENTAL / NO ACTIVE LYRIC"}</div>}
            {lyricView === "preview" ? <><div className="mlm-lyric-main" aria-live="polite">{timingCue?.words.length ? timingCue.words.map((word, index) => {
              const isSung = activeTimingWordIndex >= 0 ? index < activeTimingWordIndex : word.end !== null && playhead >= word.end;
              const isNow = activeTimingWordIndex >= 0 ? index === activeTimingWordIndex : word.start !== null && word.end !== null && playhead >= word.start && playhead < word.end;
              return <span key={word.id} className={`mlm-lyric-token${isSung ? " sung" : isNow ? " now" : " future"}`} onClick={() => { if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } }} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text} </span>;
            }) : timingCue ? <span>{timingCue.text}</span> : <span className="mlm-instrumental-mark">♪</span>}</div>
            <div className="mlm-lyric-next">{nextCue?.text ?? ""}</div></> : <>
              <TimedWordRunway cues={visibleCues} allCues={correlation.cues} selectedCueId={timingCue?.id ?? null} audioPlaying={audioPlaying} playhead={playhead} duration={duration} visibleSpan={visibleSpan} fps={draftTimeline?.fps ?? 30} correlationZoom={correlationZoom} wordBoxesVisible={wordBoxesVisible} wordGuidesVisible={wordGuidesVisible} verseBoundsVisible={verseBoundsVisible} wordGravityVisible={wordGravityVisible} seekTo={seekTo} seekFromTimeline={seekFromTimeline} beginAudioScrub={beginAudioScrub} endAudioScrub={endAudioScrub} selectWord={focusWord} selectCue={selectRunwayCue} stretchCueEdge={stretchVerseEdge} setCueEdgeAtPlayhead={setVerseEdgeAtPlayhead} addCueEdgeTime={addVerseEdgeTime} canEdit={!timingSaving && !audioPlaying}/>
            </>}
          </div>}
          {lyricView === "word-timeline" && timingGapRows.length > 0 && <details className="mlm-timing-gaps"><summary>Timing gaps to review · {timingGapRows.length} lyrics</summary><p>The outline is the subtitle clip; the filled bar is the timed words. Trim only the blank clip area to keep the word times fixed.</p><div>{timingGapRows.map(({ cue, firstWord, lastWord, leadIn, tail }) => <article key={`gap-${cue.id}`}><button className="mlm-timing-gap-select" onClick={() => focusCue(cue)}><strong>{cue.text}</strong><small>{cue.alignment.wordTimingSource ?? "No word timing"} · {cue.alignment.status}</small></button>{leadIn >= .04 && <div className="mlm-timing-gap-action"><span>Before “{firstWord.text}” · {formatDuration(leadIn)}</span><button disabled={timingSaving} onClick={() => trimCueGap(cue, "start")}>Trim lead-in</button></div>}{tail >= .04 && <div className="mlm-timing-gap-action"><span>After “{lastWord.text}” · {formatDuration(tail)}</span><button disabled={timingSaving} onClick={() => trimCueGap(cue, "end")}>Trim tail</button></div>}</article>)}</div></details>}
          {lyricView !== "kinetic" && <div className={`mlm-word-timing-panel${timingCue ? "" : " is-empty"}`}>
            {timingCue && <>
            <div className="mlm-timing-panel-title"><strong>Adjust word timing · {timingCue.text}</strong><span>Click a word to seek · Shift + / − for 10 ms</span></div>
            <div className="mlm-timing-word-controls">{timingCue.words.map((word, index) => {
              const isAtWord = selectedTimingWordId === word.id;
              const timingState = word.start === null || word.end === null ? "untimed" : activeTimingWordIndex >= 0 ? index < activeTimingWordIndex ? "sung" : index === activeTimingWordIndex ? "now" : "upcoming" : word.end <= playhead ? "sung" : word.start <= playhead ? "now" : "upcoming";
              const nextTimedWord = timingCue.words[index + 1];
              const pauseAfter = word.end !== null && nextTimedWord?.start !== null && nextTimedWord?.start !== undefined ? Math.max(0, nextTimedWord.start - word.end) : 0;
              return <Fragment key={`${timingCue.id}:${word.id}`}><div className={`mlm-timing-word ${timingState}${isAtWord ? " is-selected" : ""}`} onClick={event => { if ((event.target as HTMLElement).closest("button:not(.mlm-timing-word-select)")) return; if (word.start !== null) { focusWord(timingCue.id, word.id); seekTo(word.start); } }} onContextMenu={event => { event.preventDefault(); openWordActions(timingCue, word, event.clientX, event.clientY); }}><button className="mlm-timing-word-select" disabled={word.start === null} title={word.start === null ? "No word time available" : `Seek to ${word.text} at ${formatTime(word.start)}`}>{word.text}</button><small>{word.start === null || word.end === null ? "Untimed" : `${formatTime(word.start)} · ${formatDuration(word.end - word.start)}`}</small><div className="mlm-timing-word-actions"><button disabled={word.start === null || !draftTimeline || timingSaving} aria-label={`Set ${word.text} start at timeline center`} title={`Set start at center · ${formatTime(playhead)}`} onClick={event => { event.stopPropagation(); setWordStartHere(timingCue.id, word.id, playhead); }}>←</button><button disabled={word.end === null || !draftTimeline || timingSaving} aria-label={`Set ${word.text} end at timeline center`} title={`Set end at center · ${formatTime(playhead)}`} onClick={event => { event.stopPropagation(); setWordEndHere(timingCue.id, word.id, playhead); }}>→</button><button aria-label={`More actions for ${word.text}`} title="Word actions" onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); openWordActions(timingCue, word, rect.left, rect.bottom); }}>…</button></div></div>{pauseAfter >= .04 && nextTimedWord?.start !== null && nextTimedWord?.start !== undefined && word.end !== null && <button type="button" className="mlm-timing-gap" style={{ "--gap-seconds": pauseAfter } as CSSProperties} title={`Pause · ${formatDuration(pauseAfter)} · click to edit`} aria-label={`Edit ${formatDuration(pauseAfter)} pause after ${word.text}`} aria-haspopup="menu" aria-expanded={gapContextMenu?.cueId === timingCue.id && gapContextMenu.leftWordId === word.id} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); openGapActions(timingCue, word.id, nextTimedWord.id, rect.left, rect.top - 220); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openGapActions(timingCue, word.id, nextTimedWord.id, event.clientX, event.clientY); }}><span>{formatDuration(pauseAfter)}</span></button>}</Fragment>;
            })}</div>
            {wordContextMenu && actionCue && actionWord && <div className="mlm-word-context-menu" role="menu" style={{ left: Math.max(8, Math.min(wordContextMenu.x, window.innerWidth - 316)), top: Math.max(8, Math.min(wordContextMenu.y, window.innerHeight - 410)) }} onContextMenu={event => event.preventDefault()}><strong>Word actions · “{actionWord.text}”</strong><span>Arrow buttons set its start or end at the playhead fixed at the timeline center.</span><label>Correct this word<input value={wordTextDraft} onChange={event => setWordTextDraft(event.currentTarget.value)} /></label><button role="menuitem" disabled={!draftTimeline || timingSaving || !wordTextDraft.trim() || wordTextDraft.trim() === actionWord.text} onClick={() => { if (correctWordText(actionCue, actionWord.id, wordTextDraft)) setWordContextMenu(null); }}>Save word text</button><div className="mlm-word-time-adjust"><strong>Add / remove time to word</strong><div><button disabled={!draftTimeline || timingSaving || actionWord.start === null} aria-label={`Remove time from ${actionWord.text}`} title="Remove 100 ms (Shift: 10 ms)" onClick={event => editWord(actionCue, actionWord.id, event.shiftKey ? -.01 : -.1)}>−</button><button disabled={!draftTimeline || timingSaving || actionWord.end === null} aria-label={`Add time to ${actionWord.text}`} title="Add 100 ms (Shift: 10 ms)" onClick={event => editWord(actionCue, actionWord.id, event.shiftKey ? .01 : .1)}>+</button></div></div><button role="menuitem" disabled={!draftTimeline || timingSaving || actionWord.start === null || !actionCue.words[actionCue.words.findIndex(word => word.id === actionWord.id) + 1]} onClick={() => { addSpaceAfterWord(actionCue, actionWord.id, .1); setWordContextMenu(null); }}>Add space after</button><label>Add a missing word after<input value={newWordTextDraft} onChange={event => setNewWordTextDraft(event.currentTarget.value)} placeholder="Type the missing word" /></label><button role="menuitem" disabled={!draftTimeline || timingSaving || !newWordTextDraft.trim()} onClick={() => addWordAfter(actionCue, actionWord.id, newWordTextDraft)}>Add word after</button><button className="is-danger" role="menuitem" disabled={!draftTimeline || timingSaving || actionCue.words.length <= 1} onClick={() => deleteWord(actionCue, actionWord.id)}>Delete this word</button></div>}
            {gapContextMenu && gapActionCue && gapActionLeftWord && gapActionRightWord && <div className="mlm-word-context-menu mlm-gap-context-menu" role="menu" style={{ left: gapContextMenu.x, top: gapContextMenu.y }} onContextMenu={event => event.preventDefault()}><strong>Pause after “{gapActionLeftWord.text}”</strong><span>{formatDuration(Math.max(0, (gapActionRightWord.start ?? 0) - (gapActionLeftWord.end ?? 0)))} before “{gapActionRightWord.text}”. Set either edge at the centered playhead.</span><button role="menuitem" disabled={!draftTimeline || timingSaving} onClick={() => setGapEdgeAtPlayhead(gapActionCue, gapActionLeftWord.id, gapActionRightWord.id, "start")}>← Set pause start here</button><button role="menuitem" disabled={!draftTimeline || timingSaving} onClick={() => setGapEdgeAtPlayhead(gapActionCue, gapActionLeftWord.id, gapActionRightWord.id, "end")}>Set pause end here →</button><div className="mlm-word-time-adjust"><strong>Add / remove time to pause</strong><div><button disabled={!draftTimeline || timingSaving || (gapActionRightWord.start ?? 0) - (gapActionLeftWord.end ?? 0) < .04} aria-label="Remove 100 ms from pause" title="Remove 100 ms from this pause" onClick={() => addSpaceAfterWord(gapActionCue, gapActionLeftWord.id, -.1)}>−</button><button disabled={!draftTimeline || timingSaving} aria-label="Add 100 ms to pause" title="Add 100 ms to this pause" onClick={() => addSpaceAfterWord(gapActionCue, gapActionLeftWord.id, .1)}>+</button></div></div><button className="is-danger" role="menuitem" disabled={!draftTimeline || timingSaving || (gapActionRightWord.start ?? 0) <= (gapActionLeftWord.end ?? 0)} onClick={() => closeGapAndShare(gapActionCue, gapActionLeftWord.id, gapActionRightWord.id)}>Delete pause · share time between words</button><button role="menuitem" onClick={() => setGapContextMenu(null)}>Close</button></div>}
            <div className="mlm-verse-timing-controls"><span>Shift “{timingCue.text}”, keeping word lengths</span><button disabled={!draftTimeline || timingSaving || verseShiftLimits(timingCue).minFrames >= 0} title={`Move earlier; Shift: one frame (${((1 / (draftTimeline?.fps ?? 30)) * 1000).toFixed(0)} ms)`} onClick={event => shiftVerse(timingCue, event.shiftKey ? -1 / (draftTimeline?.fps ?? 30) : -.1)}>←</button><time>{formatTime(timingCue.start)}</time><button disabled={!draftTimeline || timingSaving || verseShiftLimits(timingCue).maxFrames <= 0} title={verseShiftHint(timingCue)} onClick={event => shiftVerse(timingCue, event.shiftKey ? 1 / (draftTimeline?.fps ?? 30) : .1)}>→</button></div><small className="mlm-verse-shift-hint">{verseShiftHint(timingCue)}</small>
            <div className="mlm-timing-actions"><button onClick={() => resetVerse(timingCue)} disabled={!cueDirtyIds.includes(timingCue.id) || timingSaving}>Reset this lyric</button>{timingDraftDirty && <><button onClick={discardTimingDraft} disabled={timingSaving}>Discard draft</button><button className="ma-primary" onClick={() => void saveTimingDraft()} disabled={timingSaving}>{timingSaving ? "Saving…" : "Save timing to Timeline"}</button></>}</div>
            {(timingError || timingMessage) && <div className={`mlm-timing-message${timingError ? " is-error" : ""}`} role={timingError ? "alert" : "status"}>{timingError || timingMessage}</div>}
            </>}
          </div>}
          <div className="mlm-sync-warning">Lyric timing comes from the FloxBow Timeline. Some word timings are estimated and lyric lines may be unverified. Compare the preview with the recording; timing edits are saved to the Timeline when you choose Save.</div>
        </div>
        <div className="mlm-lyrics-list-column"><div className="mlm-list-caption">Click a lyric to seek · Right-click for lyric actions</div><div className="mlm-lyrics-list" ref={lyricsListRef}>{visibleCues.map((cue, index) => {
          const state = cue.end <= playhead ? "is-sung" : cue.start <= playhead && playhead < cue.end ? "is-current" : "is-upcoming";
          const selected = timingCue?.id === cue.id;
          return <button key={cue.id} className={`${state}${selected ? " is-selected" : ""}`} aria-current={state === "is-current" ? "true" : undefined} onClick={() => focusCue(cue)} onContextMenu={event => { event.preventDefault(); openCueActions(cue, event.clientX, event.clientY); }}><time>{formatTime(cue.start)}</time><span>{cue.text}</span><small>{cue.alignment.wordTimingSource ?? (cue.words.length ? "No word timing" : "Untimed")} · {cue.alignment.status}</small><em>{String(index + 1).padStart(2, "0")}</em></button>;
        })}</div>
          {cueContextMenu && cueAction && <div className="mlm-word-context-menu mlm-cue-context-menu" role="menu" aria-label={`Actions for lyric ${cueAction.text}`} style={{ left: Math.max(8, Math.min(cueContextMenu.x, window.innerWidth - 316)), top: Math.max(8, Math.min(cueContextMenu.y, window.innerHeight - 260)) }} onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
            <strong>Lyric actions · “{cueAction.text}”</strong>
            {!cueContextMenu.direction ? <>
              <button role="menuitem" disabled={!draftTimeline || timingSaving || !beforeCueSlot} title={!beforeCueSlot ? "No free Timeline space before this lyric" : undefined} onClick={() => { setNewCueTextDraft(""); setCueContextMenu(current => current ? { ...current, direction: "before" } : current); }}>Add lyric before</button>
              <button role="menuitem" disabled={!draftTimeline || timingSaving || !afterCueSlot} title={!afterCueSlot ? "No free Timeline space after this lyric" : undefined} onClick={() => { setNewCueTextDraft(""); setCueContextMenu(current => current ? { ...current, direction: "after" } : current); }}>Add lyric after</button>
              <button className="is-danger" role="menuitem" disabled={!draftTimeline || timingSaving} onClick={() => deleteLyricCue(cueAction)}>Delete entire lyric</button>
              {draftTimeline && (!beforeCueSlot || !afterCueSlot) && <span>New lyrics use free Timeline space and never push other captions.</span>}
            </> : <>
              <span>{cueContextMenu.direction === "before" ? "This lyric will use free time immediately before the selected line." : "This lyric will use free time immediately after the selected line."} Its word timing remains empty until you align it.</span>
              <label>New lyric text<textarea autoFocus rows={3} value={newCueTextDraft} onChange={event => setNewCueTextDraft(event.currentTarget.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addLyricCue(cueAction, cueContextMenu.direction!); }} placeholder="Type the missing lyric" /></label>
              <button role="menuitem" disabled={!draftTimeline || timingSaving || !newCueTextDraft.trim() || !(cueContextMenu.direction === "before" ? beforeCueSlot : afterCueSlot)} onClick={() => addLyricCue(cueAction, cueContextMenu.direction!)}>Add lyric to Timeline draft</button>
              <button role="menuitem" onClick={() => setCueContextMenu(current => current ? { x: current.x, y: current.y, cueId: current.cueId } : current)}>Back</button>
            </>}
          </div>}
        </div>
      </div>}
    </section>

    {analysisTimelineOpen && <div className="mlm-analysis-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setAnalysisTimelineOpen(false); setDetailsOpen(false); } }}><section className="mlm-analysis-dialog" role="dialog" aria-modal="true" aria-label="Full music analysis timeline"><header><div><span className="mlm-kicker">FULL SONG ANALYSIS</span><h2>Music, lyrics &amp; events</h2></div><button aria-label="Close full analysis" onClick={() => { setAnalysisTimelineOpen(false); setDetailsOpen(false); }}>×</button></header><section className={`mlm-panel mlm-map-panel${eventLanesVisible ? " has-event-lanes" : " is-compact"}`}>
      <div className="mlm-dock-header"><div className="mlm-panel-heading compact"><div><span className="mlm-kicker">03 / DETECTION TIMELINE</span><h2>{eventLanesVisible ? "Sound events, by category" : "Structure and waveform"}</h2><p>{lyricView === "word-timeline" ? "Playhead stays centered; the song moves beneath it." : "Click the timeline to seek. Scroll the time window below."}</p></div><div className="mlm-detection-actions">{lyricView === "preview" && <><label>Zoom <input aria-label="Timeline zoom" type="range" min="1" max={Math.max(1, Math.ceil(duration))} step="0.1" value={Math.min(Math.max(1, Math.ceil(duration)), correlationZoom)} onChange={event => { const next = Number(event.currentTarget.value); setCorrelationZoom(next); setTimelineStart(Math.max(0, Math.min(Math.max(0, duration - Math.min(duration, next)), playhead - next / 2))); }}/><span>{formatTime(visibleSpan)} window</span></label><button onClick={() => { setCorrelationZoom(duration || 40); setTimelineStart(0); }}>Entire song</button></>}<button className="mlm-hide-timeline" onClick={() => setEventLanesVisible(value => !value)} aria-expanded={eventLanesVisible}>{eventLanesVisible ? "Hide event lanes" : "Show event lanes"}</button></div></div>
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
  allCues: CorrelationCue[];
  selectedCueId: string | null;
  audioPlaying: boolean;
  playhead: number;
  duration: number;
  visibleSpan: number;
  fps: number;
  correlationZoom: number;
  wordBoxesVisible: boolean;
  wordGuidesVisible: boolean;
  verseBoundsVisible: boolean;
  wordGravityVisible: boolean;
  seekTo: (time: number) => void;
  seekFromTimeline: (time: number) => void;
  beginAudioScrub: () => void;
  endAudioScrub: () => void;
  selectWord: (cueId: string, wordId: string) => void;
  selectCue: (cueId: string) => void;
  stretchCueEdge: (cue: CorrelationCue, edge: "start" | "end", time: number) => void;
  setCueEdgeAtPlayhead: (cue: CorrelationCue, edge: "start" | "end") => void;
  addCueEdgeTime: (cue: CorrelationCue, edge: "start" | "end") => void;
  canEdit: boolean;
};

function TimedWordRunway({ cues, allCues, selectedCueId, audioPlaying, playhead, duration, visibleSpan, fps, correlationZoom, wordBoxesVisible, wordGuidesVisible, verseBoundsVisible, wordGravityVisible, seekTo, seekFromTimeline, beginAudioScrub, endAudioScrub, selectWord, selectCue, stretchCueEdge, setCueEdgeAtPlayhead, addCueEdgeTime, canEdit }: TimedWordRunwayProps) {
  const [displayTime, setDisplayTime] = useState(playhead);
  const [isPanning, setIsPanning] = useState(false);
  const [rangeCueId, setRangeCueId] = useState(selectedCueId);
  const runwaySvgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; time: number } | null>(null);
  const stretchDragRef = useRef<{ pointerId: number; x: number; secondsPerPixel: number; cue: CorrelationCue; edge: "start" | "end" } | null>(null);
  const audioStartTimerRef = useRef<number | null>(null);
  useEffect(() => setDisplayTime(playhead), [playhead]);
  useEffect(() => {
    // While paused, follow an explicit lyric selection. During playback keep
    // the editing target steady instead of making its controls jump per lyric.
    if (!audioPlaying && selectedCueId) setRangeCueId(selectedCueId);
  }, [audioPlaying, selectedCueId]);
  const safeSpan = Math.max(.001, visibleSpan);
  const visibleStart = displayTime - safeSpan / 2;
  const visibleEnd = visibleStart + safeSpan;
  const xAt = (time: number) => PLOT_LEFT + ((time - visibleStart) / safeSpan) * PLOT_WIDTH;
  const gravityAnchors = useMemo(() => {
    if (!wordGravityVisible) return [];
    return buildWordGravityCurve(allCues.flatMap(cue => cue.words), duration);
  }, [allCues, duration, wordGravityVisible]);
  const gravityAt = (time: number) => getWordGravityAtTime(gravityAnchors, time);
  const gravityY = (score: number) => 94 - score / 2.4 * 42;
  const gravityPath = (from: number, to: number) => {
    if (to <= from) return `M ${xAt(from)} ${gravityY(gravityAt(from))}`;
    const samples = Math.max(2, Math.ceil(PLOT_WIDTH / 8));
    return Array.from({ length: samples + 1 }, (_, index) => {
      const time = from + (to - from) * index / samples;
      return `${index ? "L" : "M"} ${xAt(time).toFixed(2)} ${gravityY(gravityAt(time)).toFixed(2)}`;
    }).join(" ");
  };
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
  const selectedCue = rangeCueId ? cues.find(cue => cue.id === rangeCueId) ?? null : null;
  const cueRanges = cues.filter(cue => cue.end > visibleStart && cue.start < visibleEnd && cue.words.some(word => word.start !== null && word.end !== null));
  const startStretch = (event: ReactPointerEvent<HTMLButtonElement>, cue: CorrelationCue, edge: "start" | "end") => {
    if (!canEdit || audioPlaying) return;
    event.preventDefault(); event.stopPropagation();
    const svg = runwaySvgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect) return;
    const plotWidthInPixels = rect.width * PLOT_WIDTH / SVG_WIDTH;
    stretchDragRef.current = { pointerId: event.pointerId, x: event.clientX, secondsPerPixel: safeSpan / Math.max(1, plotWidthInPixels), cue, edge };
    selectCue(cue.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveStretch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = stretchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const originalTime = drag.edge === "start" ? drag.cue.start : drag.cue.end;
    const requestedTime = originalTime + (event.clientX - drag.x) * drag.secondsPerPixel;
    stretchCueEdge(drag.cue, drag.edge, clampTime(requestedTime, duration));
  };
  const finishStretch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (stretchDragRef.current?.pointerId !== event.pointerId) return;
    stretchDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  // Keep the selected cue in the same time-to-x space as the old range bar and
  // the lyric words. Let the runway viewport clip offscreen edges naturally;
  // clamping them here made the bar shrink and its handles stick to the edges.
  const rangeStartX = selectedCue ? xAt(selectedCue.start) : PLOT_LEFT;
  const rangeEndX = selectedCue ? xAt(selectedCue.end) : PLOT_LEFT + PLOT_WIDTH;
  const rangeStartPercent = (rangeStartX - PLOT_LEFT) / PLOT_WIDTH * 100;
  const rangeEndPercent = (rangeEndX - PLOT_LEFT) / PLOT_WIDTH * 100;
  const rangeControlsDisabled = !selectedCue || !canEdit || audioPlaying;
  const setBoundary = (edge: "start" | "end") => { if (selectedCue && !rangeControlsDisabled) setCueEdgeAtPlayhead(selectedCue, edge); };
  const addBoundaryTime = (edge: "start" | "end") => { if (selectedCue && !rangeControlsDisabled) addCueEdgeTime(selectedCue, edge); };

  return <div className="mlm-word-runway-wrap">
    <svg ref={runwaySvgRef} className={`mlm-word-runway${wordBoxesVisible ? " has-word-boxes" : " is-clean"}${audioPlaying ? " is-playing" : ""}${isPanning ? " is-panning" : ""}`} viewBox={`0 0 ${SVG_WIDTH} 168`} preserveAspectRatio="none" role="group" tabIndex={0} aria-label="Timed lyric words. Click a lyric band to select it; drag either range endpoint to stretch or compress the complete line. Use the arrow keys to seek; hold the mouse wheel and drag to scroll." onClick={handleClick} onKeyDown={handleRunwayKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopPointerDrag} onPointerCancel={stopPointerDrag} onLostPointerCapture={() => { if (audioStartTimerRef.current !== null) window.clearTimeout(audioStartTimerRef.current); audioStartTimerRef.current = null; endAudioScrub(); dragRef.current = null; setIsPanning(false); }}>
    <rect className="mlm-word-runway-bg" x="0" y="0" width={SVG_WIDTH} height="168"/>
    {wordGuidesVisible && makeTicks(visibleStart, visibleEnd, duration, correlationZoom).map(tick => <g key={`lyric-tick-${tick}`}><line className="mlm-word-runway-tick" x1={xAt(tick)} x2={xAt(tick)} y1="34" y2="145"/><text className="mlm-word-runway-time" x={xAt(tick) + 3} y="29">{formatTime(tick)}</text></g>)}
    {wordGravityVisible && <g className="mlm-word-gravity-curve" aria-label="Word duration curve, logarithmic duration score relative to 0.45 seconds">
      <text className="mlm-word-gravity-title" x={PLOT_LEFT} y="18">WORD DURATION · log₂(duration / 0.45s)</text>
      <line className="mlm-word-gravity-baseline" x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={gravityY(0)} y2={gravityY(0)}/>
      <path className="mlm-word-gravity-path" d={gravityPath(visibleStart, visibleEnd)}/>
      <path className="mlm-word-gravity-progress" d={gravityPath(visibleStart, Math.max(visibleStart, Math.min(displayTime, visibleEnd)))}/>
      <line className="mlm-word-gravity-center" x1={PLOT_LEFT + PLOT_WIDTH / 2} x2={PLOT_LEFT + PLOT_WIDTH / 2} y1="34" y2="145"/>
      <circle className="mlm-word-gravity-ball" cx={PLOT_LEFT + PLOT_WIDTH / 2} cy={gravityY(gravityAt(displayTime))} r="8"/>
      <circle className="mlm-word-gravity-ball-core" cx={PLOT_LEFT + PLOT_WIDTH / 2} cy={gravityY(gravityAt(displayTime))} r="2.5"/>
    </g>}
    {!wordGravityVisible && verseBoundsVisible && cueRanges.map(cue => {
      const selected = cue.id === selectedCue?.id;
      return <g key={`runway-cue-range-${cue.id}`} className={`mlm-word-runway-cue-range${selected ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={`Select lyric range: ${cue.text}`} onClick={event => { event.stopPropagation(); setRangeCueId(cue.id); selectCue(cue.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setRangeCueId(cue.id); selectCue(cue.id); } }}>
        <line className="mlm-word-runway-cue-hit-area" x1={xAt(cue.start)} x2={xAt(cue.end)} y1="34" y2="34"/><line className="mlm-word-runway-cue-visible" x1={xAt(cue.start)} x2={xAt(cue.end)} y1="34" y2="34"/><line className="mlm-word-runway-cue-cap" x1={xAt(cue.start)} x2={xAt(cue.start)} y1="29" y2="39"/><line className="mlm-word-runway-cue-cap" x1={xAt(cue.end)} x2={xAt(cue.end)} y1="29" y2="39"/><title>{`${cue.text} · ${formatTime(cue.start)}–${formatTime(cue.end)} · click to edit range`}</title>
      </g>;
    })}
    {!wordGravityVisible && words.map(({ cueId, word, x, width, textWidth, state }) => <g key={`runway-${cueId}-${word.id}`} className={`mlm-word-runway-word ${state}${wordBoxesVisible ? "" : " no-box"}`} role="button" tabIndex={0} aria-label={`${word.text}, ${formatTime(word.start!)} to ${formatTime(word.end!)}`} onClick={click => { click.stopPropagation(); setRangeCueId(cueId); selectCue(cueId); selectWord(cueId, word.id); seekTo(word.start!); }} onKeyDown={key => { if (key.key === "Enter") { key.preventDefault(); setRangeCueId(cueId); selectCue(cueId); selectWord(cueId, word.id); seekTo(word.start!); } }}><rect x={x} y="48" width={width} height="76" rx="5"/><text x={x + (wordBoxesVisible ? 6 : 2)} y="99" textLength={textWidth} lengthAdjust="spacingAndGlyphs">{word.text}</text><title>{`${word.text} · ${formatTime(word.start!)}–${formatTime(word.end!)}`}</title></g>)}
    {wordGuidesVisible && <line className="mlm-word-runway-playhead" x1={PLOT_LEFT + PLOT_WIDTH / 2} x2={PLOT_LEFT + PLOT_WIDTH / 2} y1="34" y2="145"/>}
    </svg>
    {!wordGravityVisible && verseBoundsVisible && <div className={`mlm-runway-range-controls${rangeControlsDisabled ? " is-disabled" : ""}`} aria-label={selectedCue ? `Timing controls for ${selectedCue.text}` : "Lyric range controls; select a lyric to edit"}>
      <div className={`mlm-runway-range-line${selectedCue ? " is-selected" : ""}`} style={{ left: `${rangeStartPercent}%`, width: `${Math.max(0, rangeEndPercent - rangeStartPercent)}%` }}/>
      <span className="mlm-runway-range-cap is-start" style={{ left: `${rangeStartPercent}%` }} aria-hidden="true"/>
      <span className="mlm-runway-range-cap is-end" style={{ left: `${rangeEndPercent}%` }} aria-hidden="true"/>
      <button className="mlm-runway-stretch-handle is-start" style={{ left: `${rangeStartPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Stretch ${selectedCue?.text ?? "lyric"} start`} title="Drag to stretch or compress from the start" onPointerDown={event => selectedCue && startStretch(event, selectedCue, "start")} onPointerMove={moveStretch} onPointerUp={finishStretch} onPointerCancel={finishStretch} onLostPointerCapture={() => { stretchDragRef.current = null; }} onKeyDown={event => { if (!selectedCue || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return; event.preventDefault(); event.stopPropagation(); stretchCueEdge(selectedCue, "start", selectedCue.start + (event.key === "ArrowLeft" ? -1 : 1) / fps); }}/>
      <button className="mlm-runway-range-action is-set-start" style={{ left: `${rangeStartPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Set ${selectedCue?.text ?? "lyric"} start at timeline center`} title={`Set start at center · ${formatTime(playhead)}`} onClick={event => { event.stopPropagation(); setBoundary("start"); }}><RunwayControlIcon kind="left"/></button>
      <button className="mlm-runway-range-action is-add-start" style={{ left: `${rangeStartPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Add time before ${selectedCue?.text ?? "lyric"}`} title="Add 100 ms before this lyric" onClick={event => { event.stopPropagation(); addBoundaryTime("start"); }}><RunwayControlIcon kind="plus"/></button>
      <button className="mlm-runway-range-action is-add-end" style={{ left: `${rangeEndPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Add time after ${selectedCue?.text ?? "lyric"}`} title="Add 100 ms after this lyric" onClick={event => { event.stopPropagation(); addBoundaryTime("end"); }}><RunwayControlIcon kind="plus"/></button>
      <button className="mlm-runway-range-action is-set-end" style={{ left: `${rangeEndPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Set ${selectedCue?.text ?? "lyric"} end at timeline center`} title={`Set end at center · ${formatTime(playhead)}`} onClick={event => { event.stopPropagation(); setBoundary("end"); }}><RunwayControlIcon kind="right"/></button>
      <button className="mlm-runway-stretch-handle is-end" style={{ left: `${rangeEndPercent}%` }} disabled={rangeControlsDisabled} aria-label={`Stretch ${selectedCue?.text ?? "lyric"} end`} title="Drag to stretch or compress to the end" onPointerDown={event => selectedCue && startStretch(event, selectedCue, "end")} onPointerMove={moveStretch} onPointerUp={finishStretch} onPointerCancel={finishStretch} onLostPointerCapture={() => { stretchDragRef.current = null; }} onKeyDown={event => { if (!selectedCue || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return; event.preventDefault(); event.stopPropagation(); stretchCueEdge(selectedCue, "end", selectedCue.end + (event.key === "ArrowLeft" ? -1 : 1) / fps); }}/>
    </div>}
  </div>;
}

function RunwayControlIcon({ kind }: { kind: "left" | "right" | "plus" }) {
  if (kind === "plus") return <svg className="mlm-runway-control-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>;
  return <svg className="mlm-runway-control-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={kind === "left" ? "M10.5 3.5 6 8l4.5 4.5M6.5 8H13" : "M5.5 3.5 10 8l-4.5 4.5M3 8h6.5"}/></svg>;
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
