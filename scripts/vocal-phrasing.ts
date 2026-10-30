import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FACTORY_PHRASING_SETTINGS,
  analyzeVocalPhrasing,
  phrasingAnalysisSchema,
  phrasingSettingsSchema,
  planVisualPhrases,
  visualPhrasePlanSchema,
  type PhrasingAlgorithm,
  type PhrasingInput,
  type PhrasingSettings,
} from "@motion/lyrics-sync/phrasing";
import type { MusicLyricsMap } from "./music-lyrics-map";

function toInput(map: MusicLyricsMap, vocalProfile?: PhrasingInput["vocalProfile"]): PhrasingInput {
  return {
    projectId: map.projectId,
    durationSeconds: map.durationSeconds,
    lyricsRevision: map.sources.lyrics.revision,
    musicRevision: map.sources.musicAnalysis.reportRevision,
    audioOffsetSeconds: map.sources.lyrics.timelineOffsetSeconds,
    ...(vocalProfile ? { vocalProfile } : {}),
    cues: map.cues.map(cue => ({
      id: cue.id, text: cue.text, start: cue.start, end: cue.end,
      alignment: { status: cue.alignment.status, ...(cue.alignment.wordTimingSource ? { wordTimingSource: cue.alignment.wordTimingSource } : {}) },
      energy: cue.energy, beatTimes: cue.beatTimes,
      words: cue.words.map(word => ({ id: word.id, text: word.text, start: word.start, end: word.end, eventIds: word.eventIds, vocalActivityOverlap: word.vocalActivityOverlap })),
    })),
    sections: map.sections,
    events: map.events,
  };
}

export function buildVocalPhrasingArtifacts(map: MusicLyricsMap, algorithmInput: unknown, settingsInput: unknown = FACTORY_PHRASING_SETTINGS, vocalProfile?: PhrasingInput["vocalProfile"]) {
  const algorithm = (algorithmInput === "stretch" || algorithmInput === "phrase-optimization" || algorithmInput === "hybrid") ? algorithmInput : "hybrid" satisfies PhrasingAlgorithm;
  const settings = phrasingSettingsSchema.parse(settingsInput);
  const input = toInput(map, vocalProfile);
  const analysis = analyzeVocalPhrasing(input, settings);
  const plan = planVisualPhrases(input, analysis, algorithm, settings);
  return { analysis, plan };
}

export async function readVocalPhrasingArtifacts(projectRoot: string) {
  const root = await realpath(projectRoot);
  const read = async (name: string) => {
    const file = path.join(root, name);
    try {
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 32_000_000) throw new Error(`Invalid project artifact: ${name}`);
      if (path.dirname(await realpath(file)) !== root) throw new Error(`Unsafe project artifact: ${name}`);
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const [analysisInput, planInput] = await Promise.all([read("vocal-phrasing-analysis.json"), read("visual-phrase-plan.json")]);
  const compatiblePlanInput = planInput && typeof planInput === "object" && !Array.isArray(planInput)
    ? { ...planInput, settings: phrasingSettingsSchema.parse({ ...FACTORY_PHRASING_SETTINGS, ...((planInput as { settings?: unknown }).settings as object ?? {}) }) }
    : planInput;
  return {
    analysis: analysisInput ? phrasingAnalysisSchema.parse(analysisInput) : null,
    plan: compatiblePlanInput ? visualPhrasePlanSchema.parse(compatiblePlanInput) : null,
  };
}

export async function saveVocalPhrasingArtifacts(projectRoot: string, map: MusicLyricsMap, algorithm: PhrasingAlgorithm, settings: PhrasingSettings, vocalProfile?: PhrasingInput["vocalProfile"]) {
  const { analysis, plan } = buildVocalPhrasingArtifacts(map, algorithm, settings, vocalProfile);
  const root = await realpath(projectRoot);
  for (const [name, value] of [["vocal-phrasing-analysis.json", analysis], ["visual-phrase-plan.json", plan]] as const) {
    const file = path.join(root, name);
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
      await rename(temporary, file);
    } finally { await unlink(temporary).catch(() => {}); }
  }
  return { analysis, plan };
}
