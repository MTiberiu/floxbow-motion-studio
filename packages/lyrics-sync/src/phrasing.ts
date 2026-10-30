import { z } from "zod";

export const VOCAL_PHRASING_VERSION = "vocal-phrasing/2.0.0";
export const VISUAL_PHRASE_PLANNER_VERSION = "visual-phrase-planner/1.0.0";

export const phrasingSettingsSchema = z.object({
  stretchThreshold: z.number().min(1.2).max(6),
  minimumSustainSeconds: z.number().min(0.2).max(4),
  syllableSeconds: z.number().min(0.08).max(0.5),
  minimumWordBaselineSeconds: z.number().min(0.05).max(0.5),
  pauseSplitSeconds: z.number().min(0.05).max(2),
  targetGroupSeconds: z.number().min(0.3).max(6),
  maxGroupWords: z.number().int().min(1).max(12),
  targetWordsPerGroup: z.number().min(1).max(8),
  musicInfluence: z.number().min(0).max(1),
  eventDensityWeight: z.number().min(0).max(1),
  energyWeight: z.number().min(0).max(1),
  punctuationInfluence: z.number().min(0).max(1),
  punctuationBoundaryStrength: z.number().min(0).max(1),
  durationBalanceWeight: z.number().min(0).max(2),
  wordCountWeight: z.number().min(0).max(1),
  pauseBoundaryStrength: z.number().min(0).max(2),
  shortGroupThreshold: z.number().min(0.1).max(2),
  shortGroupPenalty: z.number().min(0).max(2),
}).strict();
export type PhrasingSettings = z.infer<typeof phrasingSettingsSchema>;

export const FACTORY_PHRASING_SETTINGS: Readonly<PhrasingSettings> = Object.freeze({
  stretchThreshold: 2.8,
  minimumSustainSeconds: 0.85,
  syllableSeconds: 0.19,
  minimumWordBaselineSeconds: 0.13,
  pauseSplitSeconds: 0.38,
  targetGroupSeconds: 1.8,
  maxGroupWords: 5,
  targetWordsPerGroup: 3,
  musicInfluence: 0.35,
  eventDensityWeight: 0.025,
  energyWeight: 0.15,
  punctuationInfluence: 0.65,
  punctuationBoundaryStrength: 0.28,
  durationBalanceWeight: 0.7,
  wordCountWeight: 0.12,
  pauseBoundaryStrength: 0.9,
  shortGroupThreshold: 0.35,
  shortGroupPenalty: 0.7,
});

export type PhrasingAlgorithm = "stretch" | "phrase-optimization" | "hybrid";
export type PhrasingInput = {
  projectId: string;
  durationSeconds: number;
  lyricsRevision: string;
  musicRevision: string;
  audioOffsetSeconds?: number;
  vocalProfile?: {
    status: "available" | "partial" | "unavailable";
    stemEngine: string;
    stemEngineVersion: string | null;
    librosaVersion: string | null;
    rmsHopSeconds: number;
    rms: Array<{ time: number; value: number; active: boolean }>;
    f0: Array<{ time: number; f0Hz: number | null; valid: boolean; voicedProbability: number | null; octaveOutlierRejected: boolean }>;
    method: string;
    f0Method: string;
    reason: string | null;
  };
  cues: Array<{
    id: string; text: string; start: number; end: number;
    alignment: { status: string; wordTimingSource?: string };
    energy: { mean: number | null; peak: number | null };
    beatTimes: number[];
    words: Array<{ id: string; text: string; start: number | null; end: number | null; eventIds: string[]; vocalActivityOverlap: boolean | null }>;
  }>;
  sections: Array<{ start: number; end: number; label: string }>;
  events: Array<{ id: string; time: number; endTime?: number; category: string; source: string; intensity?: number; method?: string }>;
};

export type WordFeature = {
  cueId: string;
  wordId: string;
  text: string;
  start: number | null;
  end: number | null;
  alignedDurationSeconds: number | null;
  syllableEstimate: number;
  estimatedNormalDurationSeconds: number | null;
  stretchRatio: number | null;
  wordsPerSecond: number | null;
  alignmentSource: string;
  alignmentStatus: string;
  vocalActivityOverlap: boolean | null;
  nearbyEventCount: number;
  sectionLabel: string | null;
  sustainedCandidate: boolean;
  sustainEvidence: "whisper-timed-candidate" | "estimated-timing-candidate" | "not-candidate" | "untimed";
  verseId?: string | null;
  verseSecondsPerSyllable?: number | null;
  relativeDurationToVerse?: number | null;
};

export type VerseFeature = {
  cueId: string;
  text: string;
  start: number;
  end: number;
  syllableEstimate: number;
  timedWordCount: number;
  performedDurationSeconds: number | null;
  performedDurationSource: "vocal-rms" | "word-timing" | "unavailable";
  articulatedDurationSeconds: number | null;
  pauseDurationSeconds: number | null;
  pauseCount: number | null;
  syllablesPerSecond: number | null;
  articulationRateSyllablesPerSecond: number | null;
  wordsPerSecond: number | null;
  estimatedNormalDurationSeconds: number | null;
  performedToNormalDurationRatio: number | null;
  wordDurationVariabilityIndex: number | null;
  timingQuality: "whisper" | "estimated" | "mixed" | "unavailable";
  reviewStatus: string;
  acousticActivityAvailable: boolean;
};

export type WordGravityAnchor = { time: number; orangeDurationScore: number; wordIds: string[] };
export const WORD_GRAVITY_REFERENCE_SECONDS = 0.45;

/** Historical orange duration curve: log2(word duration / 0.45s), clamped to +/-2.4. */
export function getOrangeDurationScore(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return Math.max(-2.4, Math.min(2.4, Math.log2(Math.max(0.035, durationSeconds) / WORD_GRAVITY_REFERENCE_SECONDS)));
}

/** Syllable-adjusted duration score; syllableEstimate is a spelling heuristic, not measured phonetics. */
export function getVocalStretchScore(durationSeconds: number, syllableEstimate: number, settings: Pick<PhrasingSettings, "syllableSeconds" | "minimumWordBaselineSeconds"> = FACTORY_PHRASING_SETTINGS) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(syllableEstimate) || syllableEstimate <= 0) return null;
  const expectedDuration = Math.max(settings.minimumWordBaselineSeconds, syllableEstimate * settings.syllableSeconds);
  return Math.max(-2.4, Math.min(2.4, Math.log2(durationSeconds / expectedDuration)));
}

/** Builds a time-indexed curve without changing or inferring saved lyric timing. */
export function buildWordGravityCurve(words: Array<{ id: string; start: number | null; end: number | null }>, durationSeconds: number): WordGravityAnchor[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const anchors: WordGravityAnchor[] = [{ time: 0, orangeDurationScore: 0, wordIds: [] }];
  const timedWords = words.filter((word): word is typeof word & { start: number; end: number } => word.start !== null && word.end !== null && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start).sort((a, b) => (a.start + a.end) - (b.start + b.end));
  for (const word of timedWords) {
    const score = getOrangeDurationScore(word.end - word.start);
    if (score === null) continue;
    const time = Math.max(0, Math.min(durationSeconds, (word.start + word.end) / 2));
    const previous = anchors.at(-1);
    if (previous && Math.abs(previous.time - time) <= 0.001) {
      const count = Math.max(1, previous.wordIds.length);
      previous.orangeDurationScore = (previous.orangeDurationScore * count + score) / (count + 1);
      previous.wordIds.push(word.id);
    } else if (!previous || time > previous.time) anchors.push({ time, orangeDurationScore: score, wordIds: [word.id] });
  }
  const last = anchors.at(-1)!;
  if (durationSeconds - last.time <= 0.001) {
    if (last.wordIds.length) last.orangeDurationScore = (last.orangeDurationScore * last.wordIds.length) / (last.wordIds.length + 1);
    last.wordIds = [];
    last.time = durationSeconds;
  } else anchors.push({ time: durationSeconds, orangeDurationScore: 0, wordIds: [] });
  return anchors;
}

/** Smoothstep interpolation matches the original experiment between word anchors. */
export function getWordGravityAtTime(curve: WordGravityAnchor[], time: number) {
  if (!curve.length) return 0;
  if (time <= curve[0]!.time) return curve[0]!.orangeDurationScore;
  const last = curve.at(-1)!;
  if (time >= last.time) return last.orangeDurationScore;
  let low = 0, high = curve.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (curve[middle]!.time < time) low = middle; else high = middle;
  }
  const from = curve[low]!;
  const to = curve[high]!;
  const progress = Math.max(0, Math.min(1, (time - from.time) / Math.max(0.001, to.time - from.time)));
  const eased = progress * progress * (3 - 2 * progress);
  return from.orangeDurationScore + (to.orangeDurationScore - from.orangeDurationScore) * eased;
}

export type PhraseGroup = {
  id: string;
  cueId: string;
  wordIds: string[];
  start: number;
  end: number;
  text: string;
  reasons: string[];
  sustainedWordIds: string[];
  confidence: "timed" | "estimated" | "mixed";
};

export type PhrasingAnalysis = {
  schemaVersion: 1 | 2;
  kind: "floxBow-vocal-phrasing-analysis";
  processorVersion: string;
  projectId: string;
  durationSeconds: number;
  sources: { musicRevision: string; lyricsRevision: string };
  status: "complete" | "partial";
  unavailable: string[];
  wordFeatures: WordFeature[];
  verseFeatures?: VerseFeature[];
  audioProvenance?: {
    status: "available" | "partial" | "unavailable";
    stemEngine: string;
    stemEngineVersion: string | null;
    librosaVersion: string | null;
    rmsMethod: string;
    f0Method: string;
    reason: string | null;
  };
};

export type VisualPhrasePlan = {
  schemaVersion: 1;
  kind: "floxBow-visual-phrase-plan";
  plannerVersion: string;
  projectId: string;
  durationSeconds: number;
  sources: { musicRevision: string; lyricsRevision: string };
  algorithm: PhrasingAlgorithm;
  settings: PhrasingSettings;
  groups: PhraseGroup[];
  metrics: { groupCount: number; medianGroupSeconds: number; singleWordGroups: number; transitionsPerMinute: number; sustainedWordsSeparated: number; groupsCrossingVocalPauses: number; shortTransitions: number; estimatedGroups: number };
};

export const phrasingAnalysisSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]), kind: z.literal("floxBow-vocal-phrasing-analysis"), processorVersion: z.string(), projectId: z.string(), durationSeconds: z.number().positive(),
  sources: z.object({ musicRevision: z.string(), lyricsRevision: z.string() }).strict(), status: z.enum(["complete", "partial"]), unavailable: z.array(z.string()),
  wordFeatures: z.array(z.object({ cueId: z.string(), wordId: z.string(), text: z.string(), start: z.number().nullable(), end: z.number().nullable(), alignedDurationSeconds: z.number().nullable(), syllableEstimate: z.number().int().nonnegative(), estimatedNormalDurationSeconds: z.number().nullable(), stretchRatio: z.number().nullable(), wordsPerSecond: z.number().nullable(), alignmentSource: z.string(), alignmentStatus: z.string(), vocalActivityOverlap: z.boolean().nullable(), nearbyEventCount: z.number().int().nonnegative(), sectionLabel: z.string().nullable(), sustainedCandidate: z.boolean(), sustainEvidence: z.enum(["whisper-timed-candidate", "estimated-timing-candidate", "not-candidate", "untimed"]), verseId: z.string().nullable().optional(), verseSecondsPerSyllable: z.number().nullable().optional(), relativeDurationToVerse: z.number().nullable().optional() }).strict()),
  verseFeatures: z.array(z.object({ cueId: z.string(), text: z.string(), start: z.number(), end: z.number(), syllableEstimate: z.number().int().nonnegative(), timedWordCount: z.number().int().nonnegative(), performedDurationSeconds: z.number().nullable(), performedDurationSource: z.enum(["vocal-rms", "word-timing", "unavailable"]), articulatedDurationSeconds: z.number().nullable(), pauseDurationSeconds: z.number().nullable(), pauseCount: z.number().int().nullable(), syllablesPerSecond: z.number().nullable(), articulationRateSyllablesPerSecond: z.number().nullable(), wordsPerSecond: z.number().nullable(), estimatedNormalDurationSeconds: z.number().nullable(), performedToNormalDurationRatio: z.number().nullable(), wordDurationVariabilityIndex: z.number().nullable(), timingQuality: z.enum(["whisper", "estimated", "mixed", "unavailable"]), reviewStatus: z.string(), acousticActivityAvailable: z.boolean() }).strict()).optional(),
  audioProvenance: z.object({ status: z.enum(["available", "partial", "unavailable"]), stemEngine: z.string(), stemEngineVersion: z.string().nullable(), librosaVersion: z.string().nullable(), rmsMethod: z.string(), f0Method: z.string(), reason: z.string().nullable() }).strict().optional(),
}).strict();
export const visualPhrasePlanSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("floxBow-visual-phrase-plan"), plannerVersion: z.string(), projectId: z.string(), durationSeconds: z.number().positive(),
  sources: z.object({ musicRevision: z.string(), lyricsRevision: z.string() }).strict(), algorithm: z.enum(["stretch", "phrase-optimization", "hybrid"]), settings: phrasingSettingsSchema,
  groups: z.array(z.object({ id: z.string(), cueId: z.string(), wordIds: z.array(z.string()).min(1), start: z.number(), end: z.number(), text: z.string(), reasons: z.array(z.string()), sustainedWordIds: z.array(z.string()), confidence: z.enum(["timed", "estimated", "mixed"]) }).strict()),
  metrics: z.object({ groupCount: z.number().int().nonnegative(), medianGroupSeconds: z.number().nonnegative(), singleWordGroups: z.number().int().nonnegative(), transitionsPerMinute: z.number().nonnegative(), sustainedWordsSeparated: z.number().int().nonnegative(), groupsCrossingVocalPauses: z.number().int().nonnegative(), shortTransitions: z.number().int().nonnegative(), estimatedGroups: z.number().int().nonnegative() }).strict(),
}).strict();

function countSyllables(text: string) {
  const groups = text.toLocaleLowerCase().match(/[aeiouyăâîáéíóúýæœ]+/giu)?.length ?? 0;
  return Math.max(1, groups);
}
function stableId(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
function sectionAt(input: PhrasingInput, time: number) { return input.sections.find(section => time >= section.start && time < section.end)?.label ?? null; }
function makeEventQuery(input: PhrasingInput) {
  const events = [...input.events].sort((a, b) => a.time - b.time);
  return (start: number, end: number) => {
    let lo = 0, hi = events.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid]!.time < start) lo = mid + 1; else hi = mid; }
    const result = [] as typeof events;
    for (let index = lo; index < events.length && events[index]!.time < end; index++) result.push(events[index]!);
    return result;
  };
}
function isSentenceEnd(text: string, influence: number) { return influence > 0 && /[,;.!?…:]$/.test(text.trim()); }

function activityRuns(profile: NonNullable<PhrasingInput["vocalProfile"]>, offset: number) {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const point of profile.rms) {
    if (!point.active) continue;
    const start = point.time + offset, end = start + profile.rmsHopSeconds;
    const last = ranges.at(-1);
    if (last && Math.abs(last.end - start) < profile.rmsHopSeconds * 1.2) last.end = end;
    else ranges.push({ start, end });
  }
  return ranges;
}
function intervalStats(ranges: Array<{ start: number; end: number }>, start: number, end: number) {
  const clipped = ranges.map(range => ({ start: Math.max(start, range.start), end: Math.min(end, range.end) })).filter(range => range.end > range.start);
  const activeSeconds = clipped.reduce((sum, range) => sum + range.end - range.start, 0);
  return { clipped, activeSeconds };
}

export function analyzeVocalPhrasing(input: PhrasingInput, settingsInput: PhrasingSettings = FACTORY_PHRASING_SETTINGS): PhrasingAnalysis {
  const settings = phrasingSettingsSchema.parse(settingsInput);
  const wordFeatures: WordFeature[] = [];
  const unavailable: string[] = [];
  const eventsFor = makeEventQuery(input);
  const activeRanges = input.vocalProfile ? activityRuns(input.vocalProfile, input.audioOffsetSeconds ?? 0) : [];
  const verseFeatures: VerseFeature[] = [];
  for (const cue of input.cues) {
    if (!cue.words.length) { unavailable.push(`Lyric “${cue.text}” has no word-level timing.`); continue; }
    const syllableEstimate = cue.words.reduce((sum, word) => sum + countSyllables(word.text), 0);
    const timedWords = cue.words.filter(word => word.start !== null && word.end !== null && word.end > word.start);
    const wordStart = timedWords.length ? Math.min(...timedWords.map(word => word.start!)) : null;
    const wordEnd = timedWords.length ? Math.max(...timedWords.map(word => word.end!)) : null;
    const wordTimedDuration = wordStart !== null && wordEnd !== null ? wordEnd - wordStart : null;
    const activity = input.vocalProfile ? intervalStats(activeRanges, cue.start, cue.end) : { clipped: [], activeSeconds: 0 };
    const hasAcousticActivity = input.vocalProfile !== undefined && activity.activeSeconds > 0 && activity.clipped.length > 0;
    const articulatedDuration = hasAcousticActivity ? activity.activeSeconds : null;
    const performedDuration = hasAcousticActivity
      ? activity.clipped.at(-1)!.end - activity.clipped[0]!.start
      : wordTimedDuration;
    const performedDurationSource = hasAcousticActivity ? "vocal-rms" : wordTimedDuration !== null ? "word-timing" : "unavailable";
    const pauseDuration = hasAcousticActivity && performedDuration !== null ? Math.max(0, performedDuration - activity.activeSeconds) : null;
    const estimatedNormal = syllableEstimate > 0 ? Math.max(settings.minimumWordBaselineSeconds, syllableEstimate * settings.syllableSeconds) : null;
    const qualitySources = new Set(timedWords.map(() => cue.alignment.wordTimingSource === "whisper" ? "whisper" : "estimated"));
    const timingQuality = !timedWords.length ? "unavailable" : qualitySources.size > 1 ? "mixed" : [...qualitySources][0] as "whisper" | "estimated";
    const phraseDuration = articulatedDuration !== null ? articulatedDuration + (pauseDuration ?? 0) : performedDuration;
    const secPerSyllable = articulatedDuration !== null && syllableEstimate > 0 ? articulatedDuration / syllableEstimate : null;
    const normalizedWordDurations = timedWords.map(word => (word.end! - word.start!) / countSyllables(word.text));
    let wordDurationVariabilityIndex: number | null = null;
    if (normalizedWordDurations.length >= 2) {
      const differences = normalizedWordDurations.slice(1).map((value, i) => 100 * Math.abs(value - normalizedWordDurations[i]!) / Math.max(1e-6, (value + normalizedWordDurations[i]!) / 2));
      wordDurationVariabilityIndex = differences.reduce((sum, value) => sum + value, 0) / differences.length;
    }
    verseFeatures.push({
      cueId: cue.id, text: cue.text, start: cue.start, end: cue.end, syllableEstimate, timedWordCount: timedWords.length,
      performedDurationSeconds: performedDuration, performedDurationSource, articulatedDurationSeconds: articulatedDuration, pauseDurationSeconds: pauseDuration,
      pauseCount: !hasAcousticActivity ? null : Math.max(0, activity.clipped.length - 1),
      syllablesPerSecond: phraseDuration && phraseDuration > 0 ? syllableEstimate / phraseDuration : null,
      articulationRateSyllablesPerSecond: articulatedDuration && articulatedDuration > 0 ? syllableEstimate / articulatedDuration : null,
      wordsPerSecond: phraseDuration && phraseDuration > 0 ? timedWords.length / phraseDuration : null,
      estimatedNormalDurationSeconds: estimatedNormal,
      performedToNormalDurationRatio: phraseDuration !== null && estimatedNormal ? phraseDuration / estimatedNormal : null,
      wordDurationVariabilityIndex, timingQuality, reviewStatus: cue.alignment.status, acousticActivityAvailable: articulatedDuration !== null,
    });
    for (const word of cue.words) {
      const syllableEstimate = countSyllables(word.text);
      const duration = word.start !== null && word.end !== null && word.end > word.start ? word.end - word.start : null;
      const estimatedNormalDurationSeconds = duration === null ? null : Math.max(settings.minimumWordBaselineSeconds, syllableEstimate * settings.syllableSeconds);
      const stretchRatio = duration !== null && estimatedNormalDurationSeconds ? duration / estimatedNormalDurationSeconds : null;
      const localEvents = duration === null ? [] : eventsFor(word.start!, word.end!);
      const sustainedCandidate = duration !== null && stretchRatio !== null && duration >= settings.minimumSustainSeconds && stretchRatio >= settings.stretchThreshold && word.vocalActivityOverlap !== false;
      const alignmentSource = cue.alignment.wordTimingSource ?? "unknown";
      const feature: WordFeature = {
        cueId: cue.id, wordId: word.id, text: word.text, start: word.start, end: word.end, alignedDurationSeconds: duration,
        syllableEstimate, estimatedNormalDurationSeconds, stretchRatio, wordsPerSecond: duration ? 1 / duration : null,
        alignmentSource, alignmentStatus: cue.alignment.status, vocalActivityOverlap: word.vocalActivityOverlap,
        nearbyEventCount: localEvents.length, sectionLabel: duration ? sectionAt(input, word.start!) : null,
        sustainedCandidate,
        sustainEvidence: duration === null ? "untimed" : sustainedCandidate ? alignmentSource === "whisper" ? "whisper-timed-candidate" : "estimated-timing-candidate" : "not-candidate",
        verseId: cue.id,
        verseSecondsPerSyllable: secPerSyllable,
        relativeDurationToVerse: duration !== null && secPerSyllable && secPerSyllable > 0 ? ((duration / syllableEstimateForWord(word.text)) / secPerSyllable) : null,
      };
      wordFeatures.push(feature);
    }
  }
  if (!input.cues.length) unavailable.push("No saved lyric cues are available.");
  if (!input.vocalProfile || input.vocalProfile.status === "unavailable" || !input.vocalProfile.rms.length) unavailable.push("Vocal RMS/F0 profile is unavailable; acoustic articulation and pitch series cannot be used.");
  else if (input.vocalProfile.status === "partial") unavailable.push(input.vocalProfile.reason ?? "Vocal F0 profile is partial.");
  if (input.cues.some(cue => cue.words.length && cue.alignment.wordTimingSource !== "whisper")) unavailable.push("Some word timings are estimated or have no declared acoustic source; sustain candidates from those cues are hypotheses only.");
  return phrasingAnalysisSchema.parse({ schemaVersion: 2, kind: "floxBow-vocal-phrasing-analysis", processorVersion: VOCAL_PHRASING_VERSION, projectId: input.projectId, durationSeconds: input.durationSeconds, sources: { musicRevision: input.musicRevision, lyricsRevision: input.lyricsRevision }, status: unavailable.length ? "partial" : "complete", unavailable, wordFeatures, verseFeatures,
    ...(input.vocalProfile ? { audioProvenance: { status: input.vocalProfile.status, stemEngine: input.vocalProfile.stemEngine, stemEngineVersion: input.vocalProfile.stemEngineVersion, librosaVersion: input.vocalProfile.librosaVersion, rmsMethod: input.vocalProfile.method, f0Method: input.vocalProfile.f0Method, reason: input.vocalProfile.reason } } : {}) });
}

function syllableEstimateForWord(text: string) { return countSyllables(text); }

type PlanningWord = PhrasingInput["cues"][number]["words"][number];
type GroupRange = { first: number; last: number; reasons: string[] };

function stretchGroups(words: PlanningWord[], features: WordFeature[], settings: PhrasingSettings): GroupRange[] {
  const groups: GroupRange[] = [];
  let first = 0;
  for (let index = 0; index < words.length; index++) {
    const feature = features[index];
    const previous = words[index - 1];
    const currentStart = words[index]!.start;
    const pause = previous && previous.end !== null && currentStart !== null ? currentStart - previous.end : 0;
    if (index > first && (pause >= settings.pauseSplitSeconds || index - first >= settings.maxGroupWords || (previous !== undefined && isSentenceEnd(previous.text, settings.punctuationInfluence)))) {
      groups.push({ first, last: index - 1, reasons: [pause >= settings.pauseSplitSeconds ? "vocal gap" : index - first >= settings.maxGroupWords ? "maximum group size" : "punctuation"] }); first = index;
    }
    if (feature?.sustainedCandidate) {
      if (index > first) groups.push({ first, last: index - 1, reasons: ["phrase before sustained-word candidate"] });
      groups.push({ first: index, last: index, reasons: ["sustained-word candidate"] }); first = index + 1;
    }
  }
  if (first < words.length) groups.push({ first, last: words.length - 1, reasons: ["continuous phrase"] });
  return groups;
}

function optimizeGroups(words: PlanningWord[], input: PhrasingInput, settings: PhrasingSettings): GroupRange[] {
  const n = words.length;
  const eventsFor = makeEventQuery(input);
  const cost = Array(n + 1).fill(Number.POSITIVE_INFINITY) as number[];
  const previous = Array(n + 1).fill(-1) as number[];
  const reasons = Array(n + 1).fill("") as string[];
  cost[0] = 0;
  for (let end = 1; end <= n; end++) {
    for (let size = 1; size <= Math.min(settings.maxGroupWords, end); size++) {
      const start = end - size;
      const slice = words.slice(start, end);
      const timed = slice.filter(word => word.start !== null && word.end !== null);
      const seconds = timed.length ? Math.max(0.05, timed.at(-1)!.end! - timed[0]!.start!) : 0;
      const prev = words[start - 1];
      const pause = prev?.end !== null && prev?.end !== undefined && slice[0]?.start !== null ? Math.max(0, slice[0].start! - prev.end) : 0;
      const cue = input.cues.find(item => item.words.some(word => word.id === slice[0]?.id));
      const localEvents = seconds && timed.length ? eventsFor(timed[0]!.start!, timed.at(-1)!.end!) : [];
      const energy = cue?.energy.mean ?? 0;
      const punctuation = isSentenceEnd(slice.at(-1)?.text ?? "", settings.punctuationInfluence) ? -settings.punctuationBoundaryStrength * settings.punctuationInfluence : 0;
      const pausePenalty = pause >= settings.pauseSplitSeconds ? -settings.pauseBoundaryStrength : 0;
      const targetDurationCost = Math.abs(seconds - settings.targetGroupSeconds) / Math.max(0.3, settings.targetGroupSeconds) * settings.durationBalanceWeight;
      const wordCountCost = Math.abs(size - Math.min(settings.targetWordsPerGroup, settings.maxGroupWords)) * settings.wordCountWeight;
      const musicPenalty = settings.musicInfluence * (localEvents.length * settings.eventDensityWeight + energy * settings.energyWeight);
      const tooShortCost = seconds > 0 && seconds < settings.shortGroupThreshold ? settings.shortGroupPenalty : 0;
      const score = cost[start]! + targetDurationCost + wordCountCost + musicPenalty + tooShortCost + pausePenalty + punctuation;
      if (score < cost[end]!) { cost[end] = score; previous[end] = start; reasons[end] = pausePenalty ? "pause boundary" : punctuation ? "punctuation boundary" : musicPenalty > 0 ? "musical context influenced grouping" : "phrase duration and readability"; }
    }
  }
  const groups: GroupRange[] = [];
  let end = n;
  while (end > 0 && previous[end] >= 0) { const start = previous[end]!; groups.unshift({ first: start, last: end - 1, reasons: [reasons[end] || "phrase optimization"] }); end = start; }
  return groups.length ? groups : words.map((_, index) => ({ first: index, last: index, reasons: ["insufficient timing data"] }));
}
function hybridGroups(words: PlanningWord[], features: WordFeature[], input: PhrasingInput, settings: PhrasingSettings): GroupRange[] {
  const groups: GroupRange[] = [];
  let first = 0;
  const appendOptimized = (start: number, end: number) => {
    if (end <= start) return;
    for (const group of optimizeGroups(words.slice(start, end), input, settings)) groups.push({ first: group.first + start, last: group.last + start, reasons: group.reasons });
  };
  for (let index = 0; index < words.length; index++) {
    if (!features[index]?.sustainedCandidate) continue;
    appendOptimized(first, index);
    groups.push({ first: index, last: index, reasons: ["sustained-word candidate"] });
    first = index + 1;
  }
  appendOptimized(first, words.length);
  return groups;
}

function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2; }

export function planVisualPhrases(input: PhrasingInput, analysis: PhrasingAnalysis, algorithm: PhrasingAlgorithm, settingsInput: PhrasingSettings = FACTORY_PHRASING_SETTINGS): VisualPhrasePlan {
  const settings = phrasingSettingsSchema.parse(settingsInput);
  const featureIndex = new Map(analysis.wordFeatures.map(feature => [`${feature.cueId}:${feature.wordId}`, feature]));
  const groups: PhraseGroup[] = [];
  for (const cue of input.cues) {
    const words = cue.words;
    if (!words.length) continue;
    const features = words.map(word => featureIndex.get(`${cue.id}:${word.id}`)).filter((feature): feature is WordFeature => Boolean(feature));
    const ranges = algorithm === "stretch" ? stretchGroups(words, features, settings) : algorithm === "hybrid" ? hybridGroups(words, features, input, settings) : optimizeGroups(words, input, settings);
    for (const range of ranges) {
      const members = words.slice(range.first, range.last + 1);
      const timed = members.filter(word => word.start !== null && word.end !== null);
      if (!timed.length) continue;
      const start = timed[0]!.start!, end = timed.at(-1)!.end!;
      const memberFeatures = members.map(word => featureIndex.get(`${cue.id}:${word.id}`)).filter((feature): feature is WordFeature => Boolean(feature));
      const sustainedWordIds = memberFeatures.filter(feature => feature.sustainedCandidate).map(feature => feature.wordId);
      const hasPause = members.some((word, index) => index > 0 && members[index - 1]!.end !== null && word.start !== null && word.start - members[index - 1]!.end! >= settings.pauseSplitSeconds);
      const wordIds = members.map(word => word.id);
      groups.push({
        id: `phrase-${stableId(`${cue.id}:${wordIds.join(":")}`)}`, cueId: cue.id, wordIds,
        start, end, text: members.map(word => word.text).join(" "),
        reasons: [...new Set([...range.reasons, ...(sustainedWordIds.length ? ["contains sustained-word candidate"] : []), ...(hasPause ? ["crosses a vocal timing gap"] : [])])],
        sustainedWordIds,
        confidence: cue.alignment.wordTimingSource === "whisper" && cue.alignment.status === "reviewed" ? "timed" : cue.alignment.wordTimingSource === "whisper" ? "mixed" : "estimated",
      });
    }
  }
  const durations = groups.map(group => group.end - group.start);
  const sustainedWordsSeparated = groups.filter(group => group.wordIds.length === 1 && group.sustainedWordIds.length > 0).length;
  const vocalPauseEvents = input.events.filter(event => /pause|activity_end/i.test(event.category));
  const groupsCrossingVocalPauses = groups.filter(group => vocalPauseEvents.some(event => event.time > group.start && event.time < group.end)).length;
  const transitionsPerMinute = input.durationSeconds ? groups.length / input.durationSeconds * 60 : 0;
  const plan = {
    schemaVersion: 1 as const, kind: "floxBow-visual-phrase-plan" as const, plannerVersion: VISUAL_PHRASE_PLANNER_VERSION,
    projectId: input.projectId, durationSeconds: input.durationSeconds, sources: { musicRevision: input.musicRevision, lyricsRevision: input.lyricsRevision },
    algorithm, settings, groups,
    metrics: { groupCount: groups.length, medianGroupSeconds: median(durations), singleWordGroups: groups.filter(group => group.wordIds.length === 1).length, transitionsPerMinute, sustainedWordsSeparated, groupsCrossingVocalPauses, shortTransitions: groups.filter(group => group.end - group.start < settings.shortGroupThreshold).length, estimatedGroups: groups.filter(group => group.confidence !== "timed").length },
  };
  return visualPhrasePlanSchema.parse(plan);
}

export function comparePhrasing(input: PhrasingInput, settings: PhrasingSettings = FACTORY_PHRASING_SETTINGS) {
  const analysis = analyzeVocalPhrasing(input, settings);
  return { analysis, plans: (['stretch', 'phrase-optimization', 'hybrid'] as const).map(algorithm => planVisualPhrases(input, analysis, algorithm, settings)) };
}
