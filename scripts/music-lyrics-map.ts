import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getSubtitleCues } from "@motion/lyrics-sync/subtitles";
import type { EditTimeline } from "@motion/sdk/timeline";
import { musicAnalysisReportSchema } from "./music-analysis-report";

const alignmentSchema = z.object({ status: z.enum(["demo", "unverified", "reviewed"]), wordTimingSource: z.enum(["whisper", "estimated"]).optional(), timingStatus: z.enum(["absent", "matches-text", "text-mismatch"]) }).strict();
const cueSchema = z.object({ id: z.string(), text: z.string(), start: z.number().nonnegative(), end: z.number().positive(), repeatOf: z.string().optional(), alignment: alignmentSchema, section: z.string().nullable(), beatTimes: z.array(z.number()), downbeatTimes: z.array(z.number()), eventIds: z.array(z.string()), energy: z.object({ mean: z.number().nullable(), peak: z.number().nullable() }).strict(), words: z.array(z.object({ id: z.string(), text: z.string(), start: z.number().nullable(), end: z.number().nullable(), beatOffsetSeconds: z.number().nullable(), eventIds: z.array(z.string()), preWordCueIds: z.array(z.string()), vocalActivityOverlap: z.boolean().nullable() }).strict()) }).strict();
const phraseSchema = z.object({ id: z.string(), cueIds: z.array(z.string()).min(1), start: z.number(), end: z.number(), text: z.string(), sectionLabels: z.array(z.string()), eventIds: z.array(z.string()) }).strict();
const compositeSchema = z.object({ id: z.string(), time: z.number(), eventIds: z.array(z.string()).min(2), sources: z.array(z.string()).min(2), label: z.string() }).strict();
const indexedEventSchema = z.object({ id: z.string(), time: z.number().finite().nonnegative(), endTime: z.number().finite().nonnegative().optional(), category: z.string(), source: z.string(), intensity: z.number().finite().nonnegative().optional(), method: z.string(), sourceRef: z.string() }).strict();
const directorBriefDataSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal("floxBow-director-brief"), mapRevision: z.string().regex(/^[a-f0-9]{64}$/), durationSeconds: z.number().positive(), phrases: z.array(z.object({ id: z.string(), start: z.number(), end: z.number(), text: z.string(), sectionLabels: z.array(z.string()), energyMean: z.number().nullable(), dominantEvents: z.array(z.object({ time: z.number(), source: z.string(), category: z.string(), eventId: z.string() }).strict()), beatAnchors: z.array(z.number()), detailRef: z.string() }).strict()) }).strict();
export const musicLyricsMapSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("floxBow-music-lyrics-map"), projectId: z.string(), processorVersion: z.string(), createdAt: z.string().datetime(), durationSeconds: z.number().positive(),
  sources: z.object({ musicAnalysis: z.object({ file: z.literal("music-analysis.json"), schemaVersion: z.number(), assetId: z.string(), assetSha256: z.string(), reportRevision: z.string() }).strict(), lyrics: z.object({ file: z.literal("edit-timeline.json"), revision: z.string(), fps: z.number(), timelineOffsetSeconds: z.number(), timedCueCount: z.number().int().nonnegative(), untimedWordCount: z.number().int().nonnegative() }).strict() }).strict(),
  status: z.enum(["complete", "partial"]), unavailable: z.array(z.string()), sections: z.array(z.object({ start: z.number(), end: z.number(), label: z.string() }).strict()), events: z.array(indexedEventSchema), phrases: z.array(phraseSchema), cues: z.array(cueSchema), compositeCues: z.array(compositeSchema),
}).strict().superRefine((map, ctx) => {
  const ids = new Set<string>();
  for (const [i, event] of map.events.entries()) {
    if (ids.has(event.id)) ctx.addIssue({ code: "custom", path: ["events", i, "id"], message: "Normalized event IDs must be unique." });
    ids.add(event.id);
  }
  const checkRefs = (refs: string[], path: (string | number)[]) => refs.forEach((id, i) => { if (!ids.has(id)) ctx.addIssue({ code: "custom", path: [...path, i], message: `Unknown event reference: ${id}` }); });
  map.cues.forEach((cue, i) => { checkRefs(cue.eventIds, ["cues", i, "eventIds"]); cue.words.forEach((word, j) => { checkRefs(word.eventIds, ["cues", i, "words", j, "eventIds"]); checkRefs(word.preWordCueIds, ["cues", i, "words", j, "preWordCueIds"]); }); });
  map.phrases.forEach((phrase, i) => checkRefs(phrase.eventIds, ["phrases", i, "eventIds"]));
  map.compositeCues.forEach((cue, i) => checkRefs(cue.eventIds, ["compositeCues", i, "eventIds"]));
});
export type MusicLyricsMap = z.infer<typeof musicLyricsMapSchema>;
export type DirectorBrief = { schemaVersion: 1; kind: "floxBow-director-brief"; mapRevision: string; durationSeconds: number; phrases: Array<{ id: string; start: number; end: number; text: string; sectionLabels: string[]; energyMean: number | null; dominantEvents: Array<{ time: number; source: string; category: string; eventId: string }>; beatAnchors: number[]; detailRef: string }> };

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export function getLyricsSourceRevision(timeline: EditTimeline) {
  const cues = getSubtitleCues(timeline), soundtrack = timeline.clips.filter(clip => clip.componentId === "soundtrack").map(clip => ({ assetId: clip.content.assetId ?? null, from: clip.from, durationInFrames: clip.durationInFrames }));
  return digest(JSON.stringify({ version: 1, fps: timeline.fps, soundtrack, cues: cues.map(cue => ({ id: cue.id, text: cue.text, start: cue.start, end: cue.end, repeatOf: cue.repeatOf ?? null, status: cue.status, wordTimingSource: cue.wordTimingSource ?? null, presentation: cue.presentation, consumerIds: cue.consumerIds ?? null, words: cue.words ?? null, wordTimingStatus: cue.wordTimingStatus })) }));
}
export function getMusicAnalysisSourceRevision(music: unknown) { return digest(JSON.stringify(musicAnalysisReportSchema.parse(music))); }
const idFor = (prefix: string, value: string) => `${prefix}-${digest(value).slice(0, 20)}`;
const lowerBound = (values: readonly number[], target: number) => { let lo = 0, hi = values.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; } return lo; };
type TimedEvent = { id: string; time: number; endTime?: number; category: string; source: string; intensity?: number; method: string };
type Index<T> = { items: T[]; times: number[]; prefixEnd: number[] };
function makeIndex<T extends { time: number; endTime?: number }>(items: T[]): Index<T> {
  const sorted = [...items].sort((a, b) => a.time - b.time); let maxEnd = -Infinity;
  return { items: sorted, times: sorted.map(item => item.time), prefixEnd: sorted.map(item => { maxEnd = Math.max(maxEnd, item.endTime ?? item.time); return maxEnd; }) };
}
function query(index: Index<TimedEvent>, start: number, end: number): TimedEvent[] {
  const stop = lowerBound(index.times, end), result: TimedEvent[] = [];
  for (let i = stop - 1; i >= 0; i--) {
    if (index.prefixEnd[i] < start) break;
    const event = index.items[i];
    if (event.endTime === undefined ? event.time >= start && event.time < end : Math.min(event.endTime, end) > Math.max(event.time, start)) result.push(event);
  }
  return result;
}
function nearest(values: number[], time: number): number | null {
  if (!values.length) return null;
  const i = lowerBound(values, time), a = values[Math.max(0, i - 1)], b = values[Math.min(values.length - 1, i)];
  return Math.abs(time - a) <= Math.abs(time - b) ? a : b;
}
function makeEnergyIndex(points: Array<{ time: number; value: number }>) {
  const sorted = [...points].sort((a, b) => a.time - b.time), times = sorted.map(point => point.time), sums = [0];
  for (const point of sorted) sums.push(sums.at(-1)! + point.value);
  return { sorted, times, sums };
}
function avgRange(index: ReturnType<typeof makeEnergyIndex>, a: number, b: number) {
  const start = lowerBound(index.times, a), end = lowerBound(index.times, b), count = end - start;
  return { mean: count ? (index.sums[end]! - index.sums[start]!) / count : null, peak: count ? Math.max(...index.sorted.slice(start, end).map(point => point.value)) : null };
}
function intervalSection(sections: Array<{ start: number; end: number; label: string }>, start: number, end: number) {
  return sections.find(section => start >= section.start && start < section.end)?.label ?? sections.find(section => Math.min(end, section.end) > Math.max(start, section.start))?.label ?? null;
}
function vocalOverlap(vocal: TimedEvent[], vocalTimes: number[], start: number, end: number): boolean | null {
  if (!vocal.length) return null;
  const before = vocal[lowerBound(vocalTimes, start + Number.EPSILON) - 1];
  let active = before ? before.category === "vocal_activity_start" : null;
  for (let i = lowerBound(vocalTimes, start); i < vocal.length && vocal[i]!.time < end; i++) {
    const event = vocal[i]!;
    if (event.category === "vocal_activity_start") active = true;
    else active = false;
  }
  return active;
}
function makePhrases(cues: MusicLyricsMap["cues"], sections: MusicLyricsMap["sections"]): MusicLyricsMap["phrases"] {
  const groups: Array<typeof cues> = [];
  for (const cue of cues) {
    const last = groups.at(-1);
    if (last && cue.start - last.at(-1)!.end <= 0.8) last.push(cue); else groups.push([cue]);
  }
  return groups.map(group => {
    const start = group[0]!.start, end = group.at(-1)!.end;
    return { id: idFor("phrase", group.map(cue => cue.id).join("|")), cueIds: group.map(cue => cue.id), start, end, text: group.map(cue => cue.text).join(" "), sectionLabels: [...new Set(sections.filter(s => Math.min(end, s.end) > Math.max(start, s.start)).map(s => s.label))], eventIds: [...new Set(group.flatMap(cue => cue.eventIds))] };
  });
}
function makeCompositeCues(events: TimedEvent[]): MusicLyricsMap["compositeCues"] {
  const eligible = events.filter(event => ["drums", "bass", "vocals", "other"].includes(event.source) && event.category !== "vocal_pause").sort((a, b) => a.time - b.time);
  const bySource = new Map<string, { events: TimedEvent[]; times: number[] }>();
  for (const source of ["drums", "bass", "vocals", "other"]) {
    const sourceEvents = eligible.filter(event => event.source === source);
    bySource.set(source, { events: sourceEvents, times: sourceEvents.map(event => event.time) });
  }
  const found = new Map<string, MusicLyricsMap["compositeCues"][number]>();
  for (const anchor of eligible) {
    const selected = new Map<string, TimedEvent>([[anchor.source, anchor]]);
    for (const [source, index] of bySource) {
      if (source === anchor.source || !index.events.length) continue;
      const at = lowerBound(index.times, anchor.time), before = index.events[at - 1], after = index.events[at];
      const nearest = [before, after].filter((candidate): candidate is TimedEvent => !!candidate && Math.abs(candidate.time - anchor.time) <= 0.09).sort((a, b) => Math.abs(a.time - anchor.time) - Math.abs(b.time - anchor.time))[0];
      if (nearest) selected.set(source, nearest);
    }
    if (selected.size < 2) continue;
    const components = [...selected.values()].sort((a, b) => a.time - b.time), eventIds = components.map(e => e.id), key = eventIds.join("|");
    found.set(key, { id: idFor("composite", key), time: anchor.time, eventIds, sources: [...selected.keys()].sort(), label: [...selected.keys()].sort().join(" + ") });
  }
  return [...found.values()].sort((a, b) => a.time - b.time);
}

export function buildMusicLyricsMap(input: { projectId: string; music: unknown; timeline: EditTimeline; timelineOffsetSeconds?: number; processorVersion?: string; createdAt?: Date }): { map: MusicLyricsMap; brief: DirectorBrief } {
  const music = musicAnalysisReportSchema.parse(input.music), cues = getSubtitleCues(input.timeline);
  if (music.projectId !== input.projectId) throw new Error("The music report belongs to a different project.");
  if (music.durationSeconds <= 0 || music.assetId.length === 0) throw new Error("The music report has no valid audio source.");
  const soundtrackClips = input.timeline.clips.filter(clip => clip.componentId === "soundtrack");
  const timelineAudioIds = soundtrackClips.map(clip => clip.content.assetId).filter((assetId): assetId is string => typeof assetId === "string");
  if (timelineAudioIds.some(assetId => assetId !== music.assetId)) throw new Error("The Timeline soundtrack and Music Analysis report refer to different audio assets. Select and analyze the Timeline soundtrack before correlating lyrics.");
  const soundtrackOffsets = soundtrackClips.map(clip => clip.from / input.timeline.fps);
  if (new Set(soundtrackOffsets).size > 1) throw new Error("The Timeline contains soundtrack clips with different start offsets; this version requires one shared audio origin.");
  if (cues.length && !soundtrackClips.length && input.timelineOffsetSeconds === undefined) throw new Error("The lyric and music time origins are unknown. Add the analyzed soundtrack to the Timeline at its intended start, or provide an explicit timeline offset.");
  const offset = input.timelineOffsetSeconds ?? soundtrackOffsets[0] ?? 0;
  const sourceEvents: TimedEvent[] = [
    ...(music.musicalEvents?.events ?? []).map(event => ({ ...event, sourceRef: `music-analysis.json#/musicalEvents/events/${encodeURIComponent(event.id)}` })),
    ...music.structure.beats.map((time, i) => ({ id: `structure-beat-${i + 1}`, time, category: "beat", source: "structure", method: "All-In-One-Infer", sourceRef: `music-analysis.json#/structure/beats/${i}` })),
    ...music.structure.downbeats.map((time, i) => ({ id: `structure-downbeat-${i + 1}`, time, category: "downbeat", source: "structure", method: "All-In-One-Infer", sourceRef: `music-analysis.json#/structure/downbeats/${i}` })),
    ...music.dsp.accents.map((event, i) => ({ id: `mix-accent-${i + 1}`, time: event.time, category: "mix_accent", source: "mix", intensity: event.strength, method: "librosa onset strength", sourceRef: `music-analysis.json#/dsp/accents/${i}` })),
    ...music.dsp.energy.map((point, i, points) => ({ id: `mix-energy-${i + 1}`, time: point.time, endTime: points[i + 1]?.time ?? music.durationSeconds, category: "energy_sample", source: "mix", intensity: point.value, method: "RMS", sourceRef: `music-analysis.json#/dsp/energy/${i}` })),
    ...music.structure.sections.map((section, i) => ({ id: `structure-section-${i + 1}`, time: section.start, endTime: section.end, category: "section", source: "structure", method: "All-In-One-Infer", sourceRef: `music-analysis.json#/structure/sections/${i}` })),
  ].sort((a, b) => a.time - b.time);
  const eventIndex = makeIndex(sourceEvents), beats = music.structure.beats, downbeats = music.structure.downbeats, energy = makeEnergyIndex(music.dsp.energy);
  const vocalEvents = eventIndex.items.filter(event => event.source === "vocals" && ["vocal_activity_start", "vocal_activity_end", "vocal_pause"].includes(event.category));
  const vocalTimes = vocalEvents.map(event => event.time);
  const lines = cues.map(cue => {
    const start = cue.start + offset, end = cue.end + offset, lineEvents = query(eventIndex, start, end), wordRows = cue.words ?? [];
      const sourceWords = wordRows.length ? wordRows : cue.text.trim().split(/\s+/).filter(Boolean).map((text, i) => ({ id: idFor("untimed-word", `${cue.id}:${i}:${text}`), text, start: null as number | null, end: null as number | null }));
      const words = sourceWords.map(word => {
        if (word.start === null || word.end === null) return { id: word.id, text: word.text, start: null, end: null, beatOffsetSeconds: null, eventIds: [], preWordCueIds: [], vocalActivityOverlap: null };
      const wordStart = word.start + offset, wordEnd = word.end + offset, wordEvents = query(eventIndex, wordStart, wordEnd), near = nearest(beats, wordStart);
      const pres = query(eventIndex, Math.max(0, wordStart - 0.15), wordStart).filter(event => event.category !== "vocal_pause");
        return { id: word.id, text: word.text, start: wordStart, end: wordEnd, beatOffsetSeconds: near === null ? null : wordStart - near, eventIds: wordEvents.map(event => event.id), preWordCueIds: pres.map(event => event.id), vocalActivityOverlap: vocalOverlap(vocalEvents, vocalTimes, wordStart, wordEnd) };
    });
      const energies = avgRange(energy, start, end);
    return { id: cue.id, text: cue.text, start, end, ...(cue.repeatOf ? { repeatOf: cue.repeatOf } : {}), alignment: { status: cue.status, ...(cue.wordTimingSource ? { wordTimingSource: cue.wordTimingSource } : {}), timingStatus: cue.wordTimingStatus }, section: intervalSection(music.structure.sections, start, end), beatTimes: beats.slice(lowerBound(beats, start), lowerBound(beats, end)), downbeatTimes: downbeats.slice(lowerBound(downbeats, start), lowerBound(downbeats, end)), eventIds: lineEvents.map(event => event.id), energy: energies, words };
  });
  const untimedWordCount = lines.reduce((sum, cue) => sum + cue.words.filter(word => word.start === null).length, 0);
  const textMismatchCount = cues.filter(cue => cue.wordTimingStatus === "text-mismatch").length;
  const unavailable: string[] = [];
  if (!cues.length) unavailable.push("No saved subtitle cues were found in the Timeline. Music analysis is available; lyric correlation will remain empty until subtitles are saved.");
  const outOfAudioCues = lines.filter(cue => cue.start >= music.durationSeconds || cue.end > music.durationSeconds).length;
  if (outOfAudioCues) unavailable.push(`${outOfAudioCues} subtitle cues fall partly or fully outside the analyzed audio duration. Their original Timeline times are preserved.`);
  if (music.provenance.structure.status !== "available") unavailable.push(`Music structure unavailable: ${music.provenance.structure.reason ?? "no reason supplied"}`);
  if (!music.musicalEvents || music.musicalEvents.status !== "available") unavailable.push(music.musicalEvents?.reason ?? "Stem event detection is unavailable or partial.");
  if (untimedWordCount) unavailable.push(`${untimedWordCount} lyric words have no word-level timing and were not aligned to audio events.`);
  if (textMismatchCount) unavailable.push(`${textMismatchCount} subtitle cues have text that does not match their saved timed words. Original word timings are preserved and labeled; review before using them for word-synchronized animation.`);
  const map = musicLyricsMapSchema.parse({ schemaVersion: 1, kind: "floxBow-music-lyrics-map", projectId: input.projectId, processorVersion: input.processorVersion ?? "music-lyrics-correlation/1.0.0", createdAt: (input.createdAt ?? new Date()).toISOString(), durationSeconds: music.durationSeconds,
    sources: { musicAnalysis: { file: "music-analysis.json", schemaVersion: music.schemaVersion, assetId: music.assetId, assetSha256: music.asset.sha256, reportRevision: getMusicAnalysisSourceRevision(music) }, lyrics: { file: "edit-timeline.json", revision: getLyricsSourceRevision(input.timeline), fps: input.timeline.fps, timelineOffsetSeconds: offset, timedCueCount: cues.filter(c => c.words?.length).length, untimedWordCount } }, status: unavailable.length ? "partial" : "complete", unavailable, sections: music.structure.sections, events: sourceEvents, phrases: [], cues: lines, compositeCues: makeCompositeCues(sourceEvents) });
  const completed = musicLyricsMapSchema.parse({ ...map, phrases: makePhrases(lines, music.structure.sections) });
  const revision = musicLyricsMapRevision(completed);
  const brief: DirectorBrief = { schemaVersion: 1, kind: "floxBow-director-brief", mapRevision: revision, durationSeconds: completed.durationSeconds, phrases: completed.phrases.map(phrase => {
    const events = sourceEvents.filter(event => phrase.eventIds.includes(event.id)).sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0)).slice(0, 6);
    const phraseCues = completed.cues.filter(cue => phrase.cueIds.includes(cue.id));
    const energyValues = phraseCues.map(cue => cue.energy.mean).filter((value): value is number => value !== null);
    return { id: phrase.id, start: phrase.start, end: phrase.end, text: phrase.text, sectionLabels: phrase.sectionLabels, energyMean: energyValues.length ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : null, dominantEvents: events.map(event => ({ time: event.time, source: event.source, category: event.category, eventId: event.id })), beatAnchors: [...new Set(phraseCues.flatMap(cue => cue.beatTimes))], detailRef: `music-lyrics-map.json#phrase=${phrase.id}` };
  }) };
  return { map: completed, brief };
}
export function directorBriefSchema(value: unknown): DirectorBrief {
  return directorBriefDataSchema.parse(value);
}
export async function readMusicLyricsArtifacts(projectRoot: string) {
  const root = await realpath(projectRoot), read = async (name: string) => { const file = path.join(root, name); try { const info = await lstat(file); if (info.isSymbolicLink() || !info.isFile() || info.size > 64_000_000) throw new Error(`Invalid project artifact: ${name}`); if (path.dirname(await realpath(file)) !== root) throw new Error(`Unsafe project artifact: ${name}`); return JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  const [map, brief] = await Promise.all([read("music-lyrics-map.json"), read("director-brief.json")]);
  return { map: map ? musicLyricsMapSchema.parse(map) : null, brief: brief ? directorBriefSchema(brief) : null };
}
export async function saveMusicLyricsArtifacts(projectRoot: string, mapInput: unknown, briefInput: unknown) {
  const map = musicLyricsMapSchema.parse(mapInput), brief = directorBriefSchema(briefInput), root = await realpath(projectRoot);
  for (const [name, value] of [["music-lyrics-map.json", map], ["director-brief.json", brief]] as const) {
    const file = path.join(root, name), temporary = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); await rename(temporary, file); } finally { await unlink(temporary).catch(() => {}); }
  }
  return { map, brief };
}
export function musicLyricsMapRevision(map: MusicLyricsMap) { return digest(JSON.stringify({ reportRevision: map.sources.musicAnalysis.reportRevision, lyricsRevision: map.sources.lyrics.revision, processorVersion: map.processorVersion })); }
