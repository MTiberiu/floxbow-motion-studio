import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const timedValueSchema = z.object({ time: z.number().finite().nonnegative(), value: z.number().finite().nonnegative() }).strict();
const sectionSchema = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), label: z.string().min(1).max(80) }).strict();
const accentSchema = z.object({ time: z.number().finite().nonnegative(), strength: z.number().finite().min(0).max(1) }).strict();
const musicalEventSchema = z.object({
  id: z.string().min(1).max(180),
  time: z.number().finite().nonnegative(),
  endTime: z.number().finite().nonnegative().optional(),
  category: z.enum(["drum_hit", "kick_like", "snare_like", "hi_hat_like", "bass_attack", "vocal_activity_start", "vocal_activity_end", "vocal_pause", "vocal_accent", "other_transient", "mix_impact", "energy_rise", "section_change"]),
  source: z.enum(["drums", "bass", "vocals", "other", "mix"]),
  intensity: z.number().finite().min(0).max(1).optional(),
  method: z.string().min(1).max(120),
}).strict();
const eventGroupSchema = z.object({
  id: z.string().min(1).max(180),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
  source: z.enum(["drums", "bass", "other"]),
  count: z.number().int().min(2).max(4),
  eventIds: z.array(z.string().min(1).max(180)).min(2).max(4),
  pattern: z.string().min(1).max(120),
}).strict();
const musicalEventsSchema = z.object({
  status: z.enum(["available", "partial", "unavailable"]),
  method: z.string().min(1).max(160),
  stemsReused: z.boolean(),
  sources: z.object({ drums: z.enum(["available", "unavailable"]), bass: z.enum(["available", "unavailable"]), vocals: z.enum(["available", "unavailable"]), other: z.enum(["available", "unavailable"]) }).strict(),
  events: z.array(musicalEventSchema).max(50000),
  groups: z.array(eventGroupSchema).max(20000),
  counts: z.object({ drums: z.number().int().nonnegative(), bass: z.number().int().nonnegative(), vocals: z.number().int().nonnegative(), other: z.number().int().nonnegative(), mix: z.number().int().nonnegative() }).strict(),
  instrumentRecognition: z.object({ drumLabels: z.string().min(1).max(180), otherInstruments: z.string().min(1).max(180) }).strict(),
  reason: z.string().max(500).optional(),
}).strict();

const musicAnalysisReportBaseSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  assetId: z.string().min(1).max(160),
  asset: z.object({ displayName: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive(), modifiedAt: z.string().datetime() }).strict(),
  analyzedAt: z.string().datetime(),
  durationSeconds: z.number().finite().positive(),
  status: z.enum(["complete", "partial"]),
  provenance: z.object({
    structure: z.object({ status: z.enum(["available", "unavailable"]), engine: z.string().optional(), version: z.string().optional(), device: z.enum(["cpu", "cuda"]).optional(), reason: z.string().optional() }).strict(),
    dsp: z.object({ status: z.enum(["available", "partial"]), engine: z.string(), reason: z.string().optional() }).strict(),
  }).strict(),
  structure: z.object({ bpm: z.number().finite().positive().nullable(), beats: z.array(z.number().finite().nonnegative()), downbeats: z.array(z.number().finite().nonnegative()), beatPositions: z.array(z.number().int().positive()), sections: z.array(sectionSchema) }).strict(),
  dsp: z.object({ sampleRate: z.number().int().positive(), channels: z.number().int().positive(), waveform: z.array(z.number().finite().min(0).max(1)).max(2000), energy: z.array(timedValueSchema).max(20000), accents: z.array(accentSchema).max(100000) }).strict(),
  musicalEvents: musicalEventsSchema.optional(),
  performance: z.object({ wallSeconds: z.number().finite().nonnegative(), peakWorkingSetMB: z.number().finite().positive().nullable() }).strict().optional(),
}).strict();

export const musicAnalysisReportSchema = musicAnalysisReportBaseSchema.superRefine((report, context) => {
  const musicalEvents = report.musicalEvents;
  if (!musicalEvents) return;
  const byId = new Map<string, (typeof musicalEvents.events)[number]>();
  for (const [index, event] of musicalEvents.events.entries()) {
    if (byId.has(event.id)) context.addIssue({ code: "custom", path: ["musicalEvents", "events", index, "id"], message: "Event IDs must be unique." });
    byId.set(event.id, event);
    if (event.time > report.durationSeconds || (event.endTime !== undefined && (event.endTime > report.durationSeconds || event.endTime < event.time)))
      context.addIssue({ code: "custom", path: ["musicalEvents", "events", index], message: "Event times must fall within the audio duration." });
  }
  for (const source of ["drums", "bass", "vocals", "other", "mix"] as const) {
    const actual = musicalEvents.events.filter(event => event.source === source).length;
    if (musicalEvents.counts[source] !== actual)
      context.addIssue({ code: "custom", path: ["musicalEvents", "counts", source], message: "Event count must match the events in this source." });
  }
  for (const [index, group] of musicalEvents.groups.entries()) {
    if (group.count !== group.eventIds.length || group.start > group.end || group.end > report.durationSeconds)
      context.addIssue({ code: "custom", path: ["musicalEvents", "groups", index], message: "Event group timing and count must be consistent." });
    for (const eventId of group.eventIds) {
      const event = byId.get(eventId);
      if (!event || event.source !== group.source)
        context.addIssue({ code: "custom", path: ["musicalEvents", "groups", index, "eventIds"], message: "Groups must reference existing events from the same source." });
    }
  }
});

export type MusicAnalysisReport = z.infer<typeof musicAnalysisReportSchema>;

export function createMusicAnalysisReport(input: {
  projectId: string;
  assetId: string;
  displayName: string;
  fileSha256: string;
  sizeBytes: number;
  modifiedAt: Date;
  worker: Record<string, unknown>;
}) {
  const worker = input.worker;
  const engine = worker.engine && typeof worker.engine === "object" ? worker.engine as Record<string, unknown> : {};
  const engineAvailable = engine.status === "available";
  const dspError = typeof worker.dspError === "string" ? worker.dspError : undefined;
  const waveform = Array.isArray(worker.waveform) ? worker.waveform : [];
  const energy = Array.isArray(worker.energy) ? worker.energy : [];
  const accents = Array.isArray(worker.accents) ? worker.accents : [];
  const musicalEvents = worker.musicalEvents && typeof worker.musicalEvents === "object" ? worker.musicalEvents : undefined;
  const eventStatus = musicalEvents && typeof musicalEvents === "object" ? (musicalEvents as Record<string, unknown>).status : "unavailable";
  return musicAnalysisReportSchema.parse({
    schemaVersion: 2,
    projectId: input.projectId,
    assetId: input.assetId,
    asset: { displayName: input.displayName, sha256: input.fileSha256, sizeBytes: input.sizeBytes, modifiedAt: input.modifiedAt.toISOString() },
    analyzedAt: new Date().toISOString(),
    durationSeconds: worker.durationSeconds,
    status: engineAvailable && !dspError && eventStatus === "available" ? "complete" : "partial",
    provenance: {
      structure: engineAvailable
        ? { status: "available", engine: String(engine.name ?? "All-In-One-Infer"), version: String(engine.version ?? "unknown"), device: engine.device === "cuda" ? "cuda" : "cpu" }
        : { status: "unavailable", reason: String(engine.reason ?? "Music structure analysis did not return a result.") },
      dsp: dspError
        ? { status: "partial", engine: "soundfile + librosa", reason: dspError }
        : { status: "available", engine: "soundfile + librosa" },
    },
    structure: {
      bpm: engineAvailable && typeof engine.bpm === "number" ? engine.bpm : null,
      beats: engineAvailable && Array.isArray(engine.beats) ? engine.beats : [],
      downbeats: engineAvailable && Array.isArray(engine.downbeats) ? engine.downbeats : [],
      beatPositions: engineAvailable && Array.isArray(engine.beatPositions) ? engine.beatPositions : [],
      sections: engineAvailable && Array.isArray(engine.sections) ? engine.sections : [],
    },
    dsp: { sampleRate: worker.sampleRate, channels: worker.channels, waveform, energy, accents },
    ...(musicalEvents ? { musicalEvents } : {}),
    ...(worker.performance && typeof worker.performance === "object" ? { performance: worker.performance } : {}),
  });
}

export async function readMusicAnalysisReport(projectRoot: string) {
  const root = await realpath(projectRoot);
  const file = path.join(root, "music-analysis.json");
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 32_000_000)
      throw new Error("The Music Analysis report is not a valid project file.");
    const resolved = await realpath(file);
    if (path.dirname(resolved) !== root)
      throw new Error("The Music Analysis report path is unsafe.");
    return musicAnalysisReportSchema.parse(JSON.parse(await readFile(resolved, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveMusicAnalysisReport(projectRoot: string, input: unknown) {
  const report = musicAnalysisReportSchema.parse(input);
  const root = await realpath(projectRoot);
  const file = path.join(root, "music-analysis.json");
  try {
    const existing = await lstat(file);
    if (existing.isSymbolicLink() || !existing.isFile())
      throw new Error("The Music Analysis report target is not a regular project file.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(root, `.music-analysis-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return report;
}
