import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) => JSON.parse(await readFile(path.join(projectRoot, name), "utf8"));
const [timeline, analysis, phrasing, map] = await Promise.all([
  readJson("edit-timeline.json"),
  readJson("music-analysis.json"),
  readJson("vocal-phrasing-analysis.json"),
  readJson("music-lyrics-map.json"),
]);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, u) => a + (b - a) * u;
const smoothstep = (a, b, x) => {
  const u = clamp((x - a) / Math.max(1e-9, b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const dt = 1 / timeline.fps;
const duration = analysis.durationSeconds;
const count = Math.ceil(duration / dt) + 2;
const cues = timeline.clips
  .filter((clip) => clip.componentId === "subtitles" && clip.content?.presentation !== "hidden")
  .map((clip) => {
    const start = clip.from / timeline.fps;
    const words = (clip.content.words ?? [])
      .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
      .map((word) => ({
        id: word.id,
        text: word.text,
        start: start + word.start,
        end: start + word.end,
        syllables: Math.max(1, (String(word.text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[aeiouy]+/g) ?? []).length),
      }))
      .sort((a, b) => a.start - b.start);
    return { id: clip.id, text: clip.content.text ?? "", start, end: (clip.from + clip.durationInFrames) / timeline.fps, source: clip.content.wordTimingSource ?? "unknown", status: clip.content.status ?? "unverified", words };
  })
  .filter((cue) => cue.words.length)
  .sort((a, b) => a.start - b.start);
const words = cues.flatMap((cue) => cue.words.map((word) => ({ ...word, cueId: cue.id, cueStart: cue.start, cueEnd: cue.end })));
const wordFeatureById = new Map(phrasing.wordFeatures.map((feature) => [`${feature.cueId}:${feature.wordId}`, feature]));
const phraseMetrics = cues.map((cue) => {
  const activeSeconds = cue.words.reduce((sum, word) => sum + Math.max(0.025, word.end - word.start), 0);
  const totalSyllables = cue.words.reduce((sum, word) => sum + word.syllables, 0);
  const normalPhrase = cue.words.reduce((sum, word) => sum + Math.max(0.14, word.syllables * 0.195), 0);
  const pace = clamp(Math.log2(Math.max(0.1, totalSyllables / Math.max(0.001, activeSeconds)) / 3.6), -1.5, 1.5);
  const phraseRatio = activeSeconds / Math.max(0.001, normalPhrase);
  const contrasts = cue.words.map((word) => {
    const actual = Math.max(0.025, word.end - word.start);
    const normal = Math.max(0.14, word.syllables * 0.195);
    const value = Math.log2((actual / normal) / phraseRatio);
    const existing = wordFeatureById.get(`${cue.id}:${word.id}`);
    return { cueId: cue.id, wordId: word.id, text: word.text, start: word.start, end: word.end, syllableEstimate: word.syllables, phraseContrastP: value, orangeDurationScore: clamp(Math.log2(Math.max(0.035, word.end - word.start) / 0.45), -2.4, 2.4), source: cue.source, alignmentStatus: cue.status, existingFeatureSource: existing?.alignmentSource ?? null };
  });
  return { cue, pace, activeSeconds, totalSyllables, contrasts };
});

const vocal = analysis.vocalProfile;
const rms = vocal.rms;
const f0 = vocal.f0;
const energy = analysis.dsp.energy;
const sortedEnergy = energy.map((item) => item.value).sort((a, b) => a - b);
const e10 = sortedEnergy[Math.floor(sortedEnergy.length * 0.1)] ?? 0;
const e90 = sortedEnergy[Math.floor(sortedEnergy.length * 0.9)] ?? 1;
const normEnergy = (time) => clamp((Math.sqrt(Math.max(0, sample(energy, time, "value"))) - Math.sqrt(e10)) / (Math.sqrt(e90) - Math.sqrt(e10) || 1), 0, 1);
function sample(series, time, valueKey = "value") {
  if (!series.length) return 0;
  if (time <= series[0].time) return series[0][valueKey] ?? 0;
  if (time >= series.at(-1).time) return series.at(-1)[valueKey] ?? 0;
  let low = 0, high = series.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (series[middle].time <= time) low = middle; else high = middle;
  }
  const a = series[low], b = series[high];
  const av = a[valueKey] ?? 0, bv = b[valueKey] ?? av;
  return mix(av, bv, (time - a.time) / Math.max(1e-9, b.time - a.time));
}
function nearestBeat(time) {
  const beats = analysis.structure.beats;
  let low = 0, high = beats.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (beats[middle] < time) low = middle + 1; else high = middle;
  }
  return Math.min(Math.abs((beats[low] ?? 0) - time), Math.abs((beats[Math.max(0, low - 1)] ?? 0) - time));
}
const events = analysis.musicalEvents.events.map((event) => ({ t: event.time, s: event.source, v: Number(event.intensity) || 0, c: event.category }));
const impulse = new Float32Array(count);
for (const event of events) {
  const index = Math.round(event.t / dt);
  if (index >= 0 && index < count) {
    const scale = event.s === "vocals" ? 1.2 : event.s === "drums" ? 1.1 : 0.65;
    impulse[index] += clamp(event.v, 0, 1) * scale;
  }
}
const maxImpulse = Math.max(0.1, ...impulse);
for (let i = 0; i < count; i++) impulse[i] = Math.min(1, impulse[i] / maxImpulse * 1.5);

// This follows Experiment 18's old music/emotional base curve before its phrase pass.
const baseEmotional = new Float32Array(count);
const orangeRaw = new Float32Array(count);
const stretchRaw = new Float32Array(count);
let velocity = 0, position = 0, lastEnergy = normEnergy(0), pulse = 0, vocalHold = 0, orange = 0, stretch = 0;
let cueIndex = 0, wordIndex = 0;
for (let i = 0; i < count; i++) {
  const time = i * dt;
  while (cueIndex < cues.length - 1 && cues[cueIndex].end < time) { cueIndex++; wordIndex = 0; }
  const cue = cues[cueIndex];
  while (cue && wordIndex < cue.words.length - 1 && cue.words[wordIndex].end <= time) wordIndex++;
  const word = cue && time >= cue.start && time <= cue.end ? cue.words[wordIndex] : null;
  const currentEnergy = normEnergy(time);
  const change = currentEnergy - lastEnergy;
  lastEnergy = currentEnergy;
  const wordDuration = word ? word.end - word.start : 0;
  const syllables = word?.syllables ?? 1;
  const durationScore = word ? clamp(Math.log2(Math.max(0.04, wordDuration) / 0.45), -2.4, 3.8) : 0;
  const stretchScore = word ? clamp(Math.log2(Math.max(0.04, wordDuration) / Math.max(0.14, syllables * 0.195)), -2.6, 3.8) : 0;
  const phase = word ? clamp((time - word.start) / Math.max(0.001, wordDuration), 0, 1) : 0;
  const wordStart = word ? Math.exp(-phase * 12) : 0;
  const sustained = word ? Math.tanh(stretchScore * 0.5) : 0;
  const raw = impulse[i];
  pulse = pulse * 0.77 + raw;
  vocalHold = mix(vocalHold, sustained, word ? 0.09 : 0.04);
  const beat = nearestBeat(time) < 0.055 ? 1 : 0;
  const force = 0.75 * vocalHold + 1.25 * (currentEnergy - 0.45) + 1.65 * clamp(change * 6, -0.8, 0.8) + 1.5 * clamp(pulse, 0, 1.6) * (raw > 0.04 ? 1 : 0) + 0.22 * beat + 0.28 * wordStart * Math.tanh(stretchScore / 2);
  velocity += dt * (force * 1.15 - 1.13 * velocity - 0.105 * position);
  velocity = clamp(velocity, -2, 2);
  position = clamp(position + velocity * dt, -4.4, 4.4);
  baseEmotional[i] = position;
  orange += clamp(durationScore - orange, -0.06, 0.06);
  stretch += clamp(stretchScore - stretch, -0.055, 0.055);
  orangeRaw[i] = orange;
  stretchRaw[i] = stretch;
}

// Phrase Emotional: Experiment 18's phrase-relative contrast, sample filters and inertial path.
const phraseWordProfile = new Float32Array(count);
const phrasePace = new Float32Array(count);
let phraseIndex = 0;
for (let i = 0; i < count; i++) {
  const time = i * dt;
  while (phraseIndex < phraseMetrics.length - 1 && phraseMetrics[phraseIndex].cue.end < time) phraseIndex++;
  const metric = phraseMetrics[phraseIndex];
  const cue = metric?.cue;
  if (!cue || time < cue.start || time > cue.end || !cue.words.length) continue;
  phrasePace[i] = metric.pace;
  let index = cue.words.findIndex((word) => time >= word.start && time < word.end);
  if (index < 0) index = time < cue.words[0].start ? 0 : cue.words.length - 1;
  const word = cue.words[index];
  const half = (word.start + word.end) * 0.5;
  const left = index > 0 ? (cue.words[index - 1].start + cue.words[index - 1].end) * 0.5 : cue.start;
  const right = index < cue.words.length - 1 ? (cue.words[index + 1].start + cue.words[index + 1].end) * 0.5 : cue.end;
  let value = metric.contrasts[index].phraseContrastP;
  if (time < half && index > 0) value = mix(metric.contrasts[index - 1].phraseContrastP, value, smoothstep(left, half, time));
  if (time > half && index < cue.words.length - 1) value = mix(value, metric.contrasts[index + 1].phraseContrastP, smoothstep(half, right, time));
  const fade = smoothstep(cue.start, cue.start + 0.17, time) * (1 - smoothstep(cue.end - 0.19, cue.end, time));
  phraseWordProfile[i] = clamp(value, -2.5, 2.5) * fade;
}
const phraseEmotional = new Float32Array(count);
let localSmooth = 0, paceSmooth = 0, previousContrast = 0, phraseVelocity = 0, phrasePosition = 0;
for (let i = 0; i < count; i++) {
  localSmooth += 0.072 * (phraseWordProfile[i] - localSmooth);
  paceSmooth += 0.026 * (phrasePace[i] - paceSmooth);
  const contrastChange = clamp((localSmooth - previousContrast) * 4, -0.36, 0.36);
  previousContrast = localSmooth;
  const base = baseEmotional[i];
  const basePrevious = i ? baseEmotional[i - 1] : base;
  const gesture = 0.82 * localSmooth + 0.36 * contrastChange + 0.28 * paceSmooth;
  const driving = 1.35 * gesture + 0.13 * clamp((base - basePrevious) / dt, -1, 1);
  phraseVelocity = clamp(phraseVelocity + dt * (driving - 1.05 * phraseVelocity - 0.28 * phrasePosition), -1.9, 1.9);
  phrasePosition = clamp(phrasePosition + phraseVelocity * dt, -3.2, 3.2);
  phraseEmotional[i] = clamp(base * 0.75 + phrasePosition * 1.45, -5.2, 5.2);
}
function detrend(array) {
  const trend = new Float32Array(count);
  let smooth = 0;
  for (let i = 0; i < count; i++) { smooth += 0.0016 * (array[i] - smooth); trend[i] = smooth; }
  for (let i = 0; i < count; i++) array[i] = clamp((array[i] - trend[i] * 0.66) * 1.9, -5, 5);
}
detrend(baseEmotional);
detrend(phraseEmotional);

// Vocal Prosody REAL: RMS + valid, confidence-weighted F0 from the saved Demucs profile.
const sortedRms = rms.map((point) => point.value).sort((a, b) => a - b);
const rmsPeak = sortedRms[Math.floor(sortedRms.length * 0.94)] || 0.1;
const rmsSignal = new Float32Array(count);
const pitchSignal = new Float32Array(count);
const pitchQuality = new Float32Array(count);
let lastPitch = null, pitchSmooth = 0, rmsSmooth = 0;
for (let i = 0; i < count; i++) {
  const time = i * dt;
  const r = rms[Math.min(rms.length - 1, Math.floor(time / vocal.rmsHopSeconds))] ?? rms.at(-1);
  const f = f0[Math.min(f0.length - 1, Math.floor(time / vocal.f0HopSeconds))] ?? f0.at(-1);
  const normalizedRms = r?.active ? clamp(Math.log1p(r.value * 40) / Math.log1p(rmsPeak * 40), 0, 1.5) : 0;
  rmsSmooth += 0.22 * (normalizedRms - rmsSmooth);
  rmsSignal[i] = rmsSmooth;
  const valid = Boolean(f?.valid && !f?.octaveOutlierRejected && f?.f0Hz != null && f.f0Hz > 45 && f.f0Hz < 1500);
  const quality = valid ? clamp(((f.voicedProbability ?? 0) - 0.05) / 0.65, 0, 1) : 0;
  if (valid) {
    const logHz = Math.log2(f.f0Hz);
    if (lastPitch === null) lastPitch = logHz;
    lastPitch += 0.008 * clamp(logHz - lastPitch, -0.6, 0.6);
    const deviation = clamp((logHz - lastPitch) * 2.3, -1.2, 1.2);
    pitchSmooth += 0.16 * (deviation - pitchSmooth);
  } else pitchSmooth *= 0.965;
  pitchSignal[i] = pitchSmooth * quality;
  pitchQuality[i] = quality;
}
function buildVocalProsody(usePitch) {
  const response = 1.9;
  const result = new Float32Array(count);
  let position = 0, velocity = 0, previousRms = 0, phraseBias = 0;
  for (let i = 0; i < count; i++) {
    const r = rmsSignal[i];
    const delta = clamp((r - previousRms) * 8, -1, 1);
    previousRms = r;
    phraseBias += Math.min(0.24, 0.045 * response) * (phraseWordProfile[i] - phraseBias);
    const time = i * dt;
    const rmsPoint = rms[Math.min(rms.length - 1, Math.round(time / vocal.rmsHopSeconds))];
    const pitch = usePitch ? pitchSignal[i] : 0;
    const drive = rmsPoint?.active ? (0.95 * (r - 0.35) + 0.85 * delta + 0.68 * phraseBias + 0.55 * pitch) : (-0.32 * position);
    velocity = clamp(velocity + dt * (drive * response - (1.15 / Math.sqrt(response)) * velocity - 0.25 * position), -2.9, 2.9);
    position = clamp(position + velocity * dt, -3.4, 3.4);
    result[i] = position;
  }
  let trend = 0;
  for (let i = 0; i < count; i++) { trend += 0.0018 * (result[i] - trend); result[i] = clamp((result[i] - 0.6 * trend) * 1.9, -4.5, 4.5); }
  return result;
}
const prosodyWithPitch = buildVocalProsody(true);
const prosodyWithoutPitch = buildVocalProsody(false);

// Word Gravity stays the exact developer-demo curve: midpoint anchors, +/-2.4 clamp, smoothstep.
const anchors = [{ time: 0, value: 0, wordIds: [] }];
for (const word of words) {
  const value = clamp(Math.log2(Math.max(0.035, word.end - word.start) / 0.45), -2.4, 2.4);
  const time = clamp((word.start + word.end) / 2, 0, duration);
  const previous = anchors.at(-1);
  if (previous && Math.abs(previous.time - time) <= 0.001) {
    const members = Math.max(1, previous.wordIds.length);
    previous.value = (previous.value * members + value) / (members + 1);
    previous.wordIds.push(word.id);
  } else if (!previous || time > previous.time) anchors.push({ time, value, wordIds: [word.id] });
}
if (duration - anchors.at(-1).time <= 0.001) { anchors.at(-1).time = duration; anchors.at(-1).value = 0; anchors.at(-1).wordIds = []; }
else anchors.push({ time: duration, value: 0, wordIds: [] });
function sampleAnchors(time) {
  if (time <= anchors[0].time) return anchors[0].value;
  if (time >= anchors.at(-1).time) return anchors.at(-1).value;
  let low = 0, high = anchors.length - 1;
  while (high - low > 1) { const middle = (low + high) >>> 1; if (anchors[middle].time < time) low = middle; else high = middle; }
  const a = anchors[low], b = anchors[high];
  const u = clamp((time - a.time) / Math.max(0.001, b.time - a.time), 0, 1);
  return mix(a.value, b.value, u * u * (3 - 2 * u));
}
const transitionEvents = events
  .filter((event) => ["section_change", "mix_impact", "drum_hit", "kick_like", "snare_like"].includes(event.c) && (event.c === "section_change" || event.v >= 0.45))
  .map((event) => ({ time: event.t, category: event.c, source: event.s, intensity: event.v }));
const round = (value) => Math.round(value * 10000) / 10000;
const guide = {
  schemaVersion: 1,
  kind: "floxBow-emotional-motion-guides",
  durationSeconds: duration,
  fps: timeline.fps,
  sampleStepSeconds: dt,
  sourceProjectId: analysis.projectId,
  sources: {
    timelineCueCount: cues.length,
    wordCount: words.length,
    musicAnalysisAssetId: analysis.assetId,
    musicAnalysisRevision: analysis.asset.sha256,
    musicAnalysisProcessor: analysis.provenance?.structure?.engine ?? "unknown",
    vocalAnalysisProcessor: phrasing.processorVersion,
    lyricsMapRevision: map.sources?.lyricsRevision ?? null,
    note: "Derived from saved Timeline words and cached music/vocal analyses. Existing source documents are unchanged; word timing confidence is preserved per cue.",
  },
  formulas: {
    wordGravity: "log2(max(0.035, wordDurationSeconds) / 0.45), clamped [-2.4, 2.4], anchors at word midpoints, smoothstep interpolation.",
    phraseContrast: "P_i = log2((T_word / max(0.14, syllables*0.195)) / (T_phrase / sum(T_normal_word))); syllable count is a spelling estimate.",
    phraseEmotional: "Experiment 18 sample filters (.072/.026), contrast derivative clamp, gesture (.82/.36/.28), spring/damper, base Emotional Motion blend (.75/1.45), detrend.",
    vocalProsody: "Experiment 18 RMS smoothing .22, confidence-weighted valid F0 deviation, response 1.9, spring/damper, detrend. No interpolation across invalid F0 points.",
  },
  phraseContrasts: phraseMetrics.flatMap((metric) => metric.contrasts.map((item) => ({ ...item, phrasePace: round(metric.pace) }))),
  wordGravityAnchors: anchors.map((anchor) => ({ time: round(anchor.time), value: round(anchor.value), wordIds: anchor.wordIds })),
  samples: Array.from({ length: count }, (_, index) => ({
    time: round(index * dt),
    wordGravity: round(sampleAnchors(index * dt)),
    phraseEmotional: round(phraseEmotional[index]),
    vocalProsody: round(prosodyWithPitch[index]),
    vocalProsodyWithoutPitch: round(prosodyWithoutPitch[index]),
    vocalRms: round(rmsSignal[index]),
    f0Quality: round(pitchQuality[index]),
  })),
  transitionEvents,
};
await writeFile(path.join(projectRoot, "motion-guides.json"), `${JSON.stringify(guide)}\n`, "utf8");
console.log(`Wrote motion-guides.json: ${guide.samples.length} samples, ${guide.phraseContrasts.length} timed words, ${transitionEvents.length} musical transition accents.`);
