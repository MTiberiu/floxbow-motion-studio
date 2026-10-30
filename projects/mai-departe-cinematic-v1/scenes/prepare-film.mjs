import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const write = async (name, value) => writeFile(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const timeline = await read("edit-timeline.json");
const music = await read("music-analysis.json");
const manifest = await read("project.json");
const fps = timeline.fps;
const duration = timeline.durationInFrames;
const frameAt = (seconds) => Math.max(0, Math.min(duration, Math.round(seconds * fps)));
const lyricClips = timeline.clips.filter((clip) => clip.componentId === "subtitles").sort((a, b) => a.from - b.from);
const cue = (text, occurrence = 0) => {
  const matches = lyricClips.filter((clip) => clip.content.text.includes(text));
  const match = matches[occurrence];
  if (!match) throw new Error(`Could not find source lyric cue ${JSON.stringify(text)} occurrence ${occurrence}.`);
  return match;
};
const at = (text, occurrence = 0) => cue(text, occurrence).from / fps;
const sceneSpecs = [
  { id: "s01-instrumental-open", name: "The weight before the first line", start: 0, end: at("Am tot zis"), background: "white", tone: "cool" },
  { id: "s02-the-burden", name: "The loop, the work, the bills", start: at("Am tot zis"), end: at("Nu-mi trece frica", 0), background: "white", tone: "cool" },
  { id: "s03-the-decision", name: "Fear gives way to a decision", start: at("Nu-mi trece frica", 0), end: at("Mi-au spus"), background: "white", tone: "neutral" },
  { id: "s04-rejection-and-return", name: "Rejection, then he begins again", start: at("Mi-au spus"), end: at("Nu rămân aici, nu mă las", 2), background: "white", tone: "neutral" },
  { id: "s05-keeps-going", name: "Forward, with what remains", start: at("Nu rămân aici, nu mă las", 2), end: at("Poate mâine"), background: "white", tone: "warm" },
  { id: "s06-bridge", name: "Tomorrow may still be hard", start: at("Poate mâine"), end: at("Nu rămân aici, nu mă las", 4), background: "white", tone: "cool" },
  { id: "s07-final-chorus", name: "He has not stopped", start: at("Nu rămân aici, nu mă las", 4), end: at("Nu e totul rezolvat"), background: "white", tone: "warm" },
  { id: "s08-outro", name: "Not solved; still at peace", start: at("Nu e totul rezolvat"), end: duration / fps, background: "white", tone: "quiet" },
];
const lyricShotSpecs = [
  { id: "s02-hesitates", cueText: "Am tot zis", pose: "seated", x: 34, width: 37, height: 82, motion: "word-gravity", tone: "cool" },
  { id: "s02-one-step", cueText: "Azi îmi spun", pose: "standing", x: 35, width: 34, height: 82, motion: "phrase-emotional", tone: "neutral" },
  { id: "s03-the-promise", cueText: "Mi-am promis", pose: "seated", x: 32, width: 36, height: 84, motion: "word-gravity", tone: "cool" },
  { id: "s03-bills-fall", cueText: "Strâng facturile", pose: "seated", x: 31, width: 36, height: 84, motion: "phrase-emotional", tone: "cool", paperFall: true },
  { id: "s03-cannot-call", cueText: "N-am curaj", pose: "close", x: 31, width: 46, height: 91, motion: "vocal-prosody", tone: "cool" },
  { id: "s03-phone-rings", cueText: "Când mă sună", pose: "close", x: 31, width: 46, height: 91, motion: "vocal-prosody", tone: "cool", visual: "phone-pulse" },
  { id: "s03-pretends", cueText: "Spun că-s bine", pose: "close", x: 32, width: 44, height: 90, motion: "vocal-prosody", tone: "cool" },
  { id: "s03-says-yes", cueText: "Am zis", pose: "standing", x: 35, width: 35, height: 84, motion: "phrase-emotional", tone: "neutral" },
  { id: "s03-lost-time", cueText: "Timpul meu", pose: "close", x: 32, width: 46, height: 91, motion: "word-gravity", tone: "cool" },
  { id: "s04-fear", cueText: "Nu-mi trece frica", pose: "close", x: 32, width: 45, height: 90, motion: "vocal-prosody", tone: "cool" },
  { id: "s04-knows-no", cueText: "Știu măcar", pose: "standing", x: 35, width: 37, height: 86, motion: "phrase-emotional", tone: "neutral" },
  { id: "s04-no-answers", cueText: "N-am răspunsuri", pose: "standing", x: 34, width: 39, height: 87, motion: "phrase-emotional", tone: "neutral" },
  { id: "s04-does-what-he-can", cueText: "Dar fac astăzi", pose: "walking", x: 36, width: 38, height: 88, motion: "word-gravity", tone: "warm" },
  { id: "s05-chooses-to-leave", cueText: "Nu rămân aici", occurrence: 0, pose: "standing", x: 35, width: 37, height: 88, motion: "phrase-emotional", tone: "warm" },
  { id: "s05-step-after-step", cueText: "Mai departe", occurrence: 0, pose: "walking", x: 37, width: 39, height: 90, motion: "word-gravity", tone: "warm" },
  { id: "s05-even-when-hard", cueText: "Nu rămân aici, chiar", occurrence: 0, pose: "close", x: 32, width: 47, height: 93, motion: "vocal-prosody", tone: "warm" },
  { id: "s05-time-back", cueText: "Îmi iau înapoi", occurrence: 0, pose: "walking", x: 37, width: 39, height: 90, motion: "combined", tone: "warm" },
  { id: "s05-refrain-again", cueText: "Nu rămân aici", occurrence: 1, pose: "standing", x: 34, width: 39, height: 89, motion: "phrase-emotional", tone: "warm" },
  { id: "s05-what-remains", cueText: "Merg cu tot", occurrence: 0, pose: "walking", x: 38, width: 40, height: 90, motion: "combined", tone: "warm" },
  { id: "s05-leaves-for-road", cueText: "Nu rămân aici, plec", occurrence: 0, pose: "walking", x: 39, width: 42, height: 91, motion: "word-gravity", tone: "warm" },
  { id: "s05-now", cueText: "Fac ce pot", occurrence: 0, pose: "standing", x: 37, width: 40, height: 89, motion: "combined", tone: "warm" },
  { id: "s06-no", cueText: "Mi-au spus", pose: "close", x: 32, width: 49, height: 95, motion: "vocal-prosody", tone: "cool", visual: "rejection" },
  { id: "s07-tries-again", cueText: "Mai încerc", pose: "standing", x: 35, width: 38, height: 88, motion: "phrase-emotional", tone: "neutral" },
  { id: "s07-makes-time", cueText: "Îmi fac timp", pose: "seated", x: 32, width: 37, height: 87, motion: "phrase-emotional", tone: "neutral" },
  { id: "s07-learns", cueText: "Să învăț", pose: "seated", x: 33, width: 38, height: 87, motion: "word-gravity", tone: "neutral" },
  { id: "s07-cant-anymore", cueText: "Și când simt", pose: "close", x: 32, width: 46, height: 91, motion: "vocal-prosody", tone: "cool" },
  { id: "s07-family-calls", cueText: "Sună a mei", pose: "seated", x: 33, width: 37, height: 87, motion: "vocal-prosody", tone: "cool", visual: "phone-pulse" },
  { id: "s07-mistakes", cueText: "Mai greșesc", pose: "standing", x: 35, width: 38, height: 87, motion: "phrase-emotional", tone: "neutral" },
  { id: "s07-changes", cueText: "Schimb ce pot", pose: "walking", x: 37, width: 39, height: 89, motion: "word-gravity", tone: "warm" },
  { id: "s08-fear-again", cueText: "Nu-mi trece frica", occurrence: 1, pose: "close", x: 32, width: 45, height: 90, motion: "vocal-prosody", tone: "cool" },
  { id: "s08-no-answers-again", cueText: "N-am răspunsuri", occurrence: 1, pose: "standing", x: 35, width: 38, height: 87, motion: "phrase-emotional", tone: "neutral" },
  { id: "s09-keeps-moving", cueText: "Nu rămân aici", occurrence: 2, pose: "standing", x: 35, width: 39, height: 89, motion: "phrase-emotional", tone: "warm" },
  { id: "s09-further", cueText: "Mai departe", occurrence: 1, pose: "walking", x: 37, width: 40, height: 90, motion: "word-gravity", tone: "warm" },
  { id: "s09-even-hard-again", cueText: "Nu rămân aici, chiar", occurrence: 1, pose: "close", x: 32, width: 47, height: 93, motion: "vocal-prosody", tone: "warm" },
  { id: "s09-takes-back-time", cueText: "Îmi iau înapoi", occurrence: 1, pose: "walking", x: 38, width: 41, height: 92, motion: "combined", tone: "warm" },
  { id: "s09-refrain", cueText: "Nu rămân aici", occurrence: 3, pose: "standing", x: 35, width: 39, height: 89, motion: "phrase-emotional", tone: "warm" },
  { id: "s09-with-what-remains", cueText: "Merg cu tot", occurrence: 1, pose: "walking", x: 38, width: 40, height: 90, motion: "combined", tone: "warm" },
  { id: "s09-leaves-again", cueText: "Nu rămân aici, plec", occurrence: 1, pose: "walking", x: 39, width: 42, height: 91, motion: "word-gravity", tone: "warm" },
  { id: "s09-can-now", cueText: "Fac ce pot", occurrence: 1, pose: "standing", x: 37, width: 40, height: 89, motion: "combined", tone: "warm" },
  { id: "s10-tomorrow", cueText: "Poate mâine", pose: "close", x: 32, width: 47, height: 92, motion: "vocal-prosody", tone: "cool" },
  { id: "s10-holds-plan", cueText: "Dar mă țin", pose: "close", x: 33, width: 45, height: 91, motion: "phrase-emotional", tone: "neutral" },
  { id: "s10-not-all-yet", cueText: "Azi n-am tot", pose: "seated", x: 33, width: 38, height: 88, motion: "word-gravity", tone: "cool" },
  { id: "s10-has-not-stopped", cueText: "Dar măcar", pose: "standing", x: 36, width: 39, height: 89, motion: "phrase-emotional", tone: "warm" },
  { id: "s11-keeps-going", cueText: "Nu rămân aici", occurrence: 4, pose: "standing", x: 35, width: 40, height: 90, motion: "phrase-emotional", tone: "warm" },
  { id: "s11-further", cueText: "Mai departe", occurrence: 2, pose: "walking", x: 38, width: 41, height: 92, motion: "word-gravity", tone: "warm" },
  { id: "s11-even-hard", cueText: "Nu rămân aici, chiar", occurrence: 2, pose: "close", x: 32, width: 49, height: 95, motion: "vocal-prosody", tone: "warm" },
  { id: "s11-time-back", cueText: "Îmi iau înapoi", occurrence: 2, pose: "walking", x: 38, width: 42, height: 93, motion: "combined", tone: "warm" },
  { id: "s11-refrain", cueText: "Nu rămân aici", occurrence: 5, pose: "standing", x: 35, width: 40, height: 90, motion: "phrase-emotional", tone: "warm" },
  { id: "s11-with-what-remains", cueText: "Merg cu tot", occurrence: 2, pose: "walking", x: 38, width: 42, height: 93, motion: "combined", tone: "warm" },
  { id: "s11-leaves-road", cueText: "Nu rămân aici, plec", occurrence: 2, pose: "walking", x: 39, width: 43, height: 94, motion: "word-gravity", tone: "warm" },
  { id: "s11-now", cueText: "Fac ce pot", occurrence: 2, pose: "standing", x: 37, width: 41, height: 91, motion: "combined", tone: "warm" },
  { id: "s12-not-solved", cueText: "Nu e totul rezolvat", pose: "close", x: 32, width: 46, height: 91, motion: "vocal-prosody", tone: "cool" },
  { id: "s12-peace", cueText: "Dar am sufletul", pose: "standing", x: 36, width: 38, height: 87, motion: "phrase-emotional", tone: "quiet" },
].map((shot) => ({ ...shot, cueId: cue(shot.cueText, shot.occurrence ?? 0).id, start: at(shot.cueText, shot.occurrence ?? 0) }));
const introDownbeats = music.structure.downbeats.filter((time) => time < at("Am tot zis")).slice(0, 4);
if (introDownbeats.length < 4) throw new Error("The analyzed intro does not contain four saved downbeats for its opening shots.");
const introShots = introDownbeats.map((start, index) => ({ id: `s01-instrumental-${index + 1}`, start, cueId: null, pose: null, width: 0, height: 0, x: 0, motion: "phrase-emotional", tone: "cool" }));
const outroMusicCuts = music.structure.downbeats.filter((time) => time >= 224.8 && time < duration / fps).slice(0, 2);
const outroShots = outroMusicCuts.map((start, index) => ({ id: `s08-outro-music-${index + 1}`, start, cueId: null, pose: "standing", x: 38, width: 39, height: 88, motion: "phrase-emotional", tone: "quiet" }));
const shotSpecs = [...introShots, ...lyricShotSpecs, ...outroShots].sort((a, b) => a.start - b.start);
const scenes = sceneSpecs.map((scene, index) => {
  const from = index === 0 ? 0 : frameAt(scene.start);
  const next = index === sceneSpecs.length - 1 ? duration : frameAt(scene.end);
  return { ...scene, from, durationInFrames: Math.max(1, next - from) };
});
const transitionEvents = music.musicalEvents.events
  .filter((event) => event.category === "section_change" || ((event.category === "mix_impact" || event.category === "drum_hit" || event.category === "kick_like" || event.category === "snare_like") && (event.intensity ?? 0) >= 0.45))
  .map((event) => ({ time: event.time, intensity: event.intensity ?? 0, category: event.category, source: event.source }));
const tracks = [
  { id: "captions", name: "Lyrics", kind: "visual" },
  { id: "director-actors", name: "Protagonist", kind: "visual" },
  { id: "director-effects", name: "Vocal curves & music accents", kind: "visual" },
  { id: "director-objects", name: "Story objects", kind: "visual" },
  { id: "director-plates", name: "White stage", kind: "visual" },
  ...timeline.tracks.filter((track) => !["captions", "audio", "director-actors", "director-effects", "director-objects", "director-plates"].includes(track.id)),
  ...timeline.tracks.filter((track) => track.id === "audio"),
];
const clips = timeline.clips.filter((clip) => !clip.id.startsWith("director-"));
for (const scene of scenes) {
  const end = scene.from + scene.durationInFrames;
  const localAccents = transitionEvents.filter((event) => event.time >= scene.from / fps && event.time < end / fps);
  const common = { from: scene.from, durationInFrames: scene.durationInFrames, sceneId: scene.id };
  clips.push({
    id: `director-stage-${scene.id}`, trackId: "director-plates", componentId: "director-plate", label: `${scene.name} · ${scene.background} stage`, ...common,
    content: { sceneName: scene.name },
    props: { background: scene.background },
  });
}
const sortedShots = [...shotSpecs].sort((a, b) => a.start - b.start);
for (let index = 0; index < sortedShots.length; index += 1) {
  const shot = sortedShots[index];
  const scene = sceneSpecs.find((item) => shot.start >= item.start && shot.start < item.end);
  if (!scene) throw new Error(`Shot ${shot.id} does not belong to a narrative scene.`);
  const from = frameAt(shot.start);
  const nextShotFrom = index + 1 < sortedShots.length ? frameAt(sortedShots[index + 1].start) : duration;
  const durationInFrames = Math.max(1, Math.min(frameAt(scene.end) - from, duration - from, nextShotFrom - from));
  const shotEvents = transitionEvents.filter((event) => event.time >= shot.start && event.time < (from + durationInFrames) / fps);
  const shotCommon = { from, durationInFrames, sceneId: scene.id };
  const close = shot.pose === "close";
  if (shot.pose) clips.push({
    id: `director-shot-${shot.id}`, trackId: "director-actors", componentId: "director-actor", label: `Shot · ${shot.id}`, ...shotCommon,
    content: { pose: shot.pose, shotType: close ? "close" : shot.width < 38 ? "wide" : "medium", sourceCueId: shot.cueId },
    props: { pose: shot.pose, x: shot.x, y: 99, width: shot.width, height: shot.height, rotation: 0, anchor: "bottom-center", opacity: 1, motion: shot.motion, motionGain: close ? 0.42 : 0.3 },
  });
  clips.push({
    id: `director-curve-${shot.id}`, trackId: "director-effects", componentId: "director-accent", label: `Sound contour · ${shot.id}`, ...shotCommon,
    content: { sourceCueId: shot.cueId, tone: shot.tone },
    props: { movement: shot.motion, tone: shot.tone, strength: shot.tone === "warm" ? 0.42 : shot.tone === "cool" ? 0.28 : 0.24, backgroundMode: scene.background, accentEvents: shotEvents },
  });
}
const billsShot = shotSpecs.find((shot) => shot.paperFall);
if (billsShot) {
  const billsScene = sceneSpecs.find((scene) => billsShot.start >= scene.start && billsShot.start < scene.end);
  const paperEvents = music.musicalEvents.events
    .filter((event) => event.time >= billsShot.start && event.time < billsShot.start + 3.6 && ["drum_hit", "kick_like", "snare_like", "other_transient", "mix_impact"].includes(event.category))
    .sort((a, b) => a.time - b.time)
    .slice(0, 9)
    .map((event) => ({ time: event.time, intensity: event.intensity ?? 0, category: event.category, source: event.source }));
  const from = frameAt(billsShot.start);
  const end = frameAt(billsScene.end);
  clips.push({
    id: "director-object-bills-fall", trackId: "director-objects", componentId: "director-paper-fall", label: "Bills fall and gather · drum accents", from, durationInFrames: Math.max(1, end - from), sceneId: billsScene.id,
    content: { visual: "falling-bills", sourceCueId: billsShot.cueId },
    props: { count: paperEvents.length || 7, landingY: 680, fallDuration: 0.9, musicEvents: paperEvents, vocalCurve: "phrase-emotional" },
  });
}
timeline.trackOrder = "top-down";
timeline.tracks = tracks;
timeline.scenes = scenes.map(({ id, name, from, durationInFrames }) => ({ id, name, from, durationInFrames }));
for (const [id,phase] of [['s03-cannot-call','hesitate'],['s03-phone-rings','answer'],['s03-pretends','release']]) {
 const actor=clips.find(c=>c.id==='director-shot-'+id);
 if(actor){actor.componentId='director-phone-performance';actor.props={phase};}
}
const burdenActions=['hesitation','step','promise','bills','cannot-call','answer','silence','consent','lost-time'];
const burdenActors=clips.filter(c=>c.sceneId==='s02-the-burden'&&c.id.startsWith('director-shot-')).sort((a,b)=>a.from-b.from);
for(const [i,actor] of burdenActors.entries()){
 const source=lyricClips.find(c=>c.id===actor.content.sourceCueId);
 const words=source?.content.words??[];
 const wordMarks=Object.fromEntries(words.filter(w=>typeof w.start==='number').map(w=>[w.text.replace(/[^\p{L}]/gu,'').toLowerCase(),w.start]));
 actor.componentId='director-burden-scene';actor.label='Burden · '+burdenActions[i];
 actor.props={action:burdenActions[i],lightStrength:.16,wordMarks,silenceAt:Math.max(0,...words.map(w=>typeof w.end==='number'?w.end:0)),paperEvents:music.musicalEvents.events.filter(e=>e.time>=actor.from/fps&&e.time<(actor.from+actor.durationInFrames)/fps&&['drum_hit','kick_like','snare_like'].includes(e.category)).slice(0,7).map(e=>e.time-actor.from/fps)};
}
// Dedicated action shots own their objects; remove old overlapping scenery only here.
timeline.clips = clips.filter(c=>c.sceneId!=='s02-the-burden'||!c.id.startsWith('director-curve-')&&c.id!=='director-object-bills-fall');
manifest.durationInFrames = duration;
manifest.name = "Mai Departe — White Stage / Emotional Motion Experiment";
manifest.type = "lyrics";
manifest.width = 1920;
manifest.height = 1080;
manifest.fps = fps;
manifest.editTimeline = "edit-timeline.json";
manifest.timeline = "timing/lyrics.json";
// Preserve the existing manifest; this pass only prepares director layers.
await write("edit-timeline.json", timeline);
await write("director-shot-plan.json", {
  schemaVersion: 1,
  kind: "floxBow-director-shot-plan",
  artDirection: "A clean white stage is the visual ground, never a photo or blurred image fill. Scenes and shots follow the lyric narrative. The bills in Strâng facturile pe masă fall as paper leaves on real musical accents and remain as a growing stack. The rejection remains on white, with cooler light; warmth returns as he tries again. Full-body poses keep the entire figure and his support visible; close emotion uses a separately generated mid-thigh portrait without cropping it in the composition. Thin sound contours respond to the saved Word Gravity, Phrase Emotional, Vocal Prosody/RMS and sourced music events; they are authored motion cues, not emotion classifiers.",
  sourceProjectId: music.projectId,
  durationSeconds: music.durationSeconds,
  scenes: sceneSpecs.map(({ id, name, start, end, background, tone }) => ({ id, name, start, end, background, tone })),
  shots: sortedShots.map((shot, index) => {
    const next = sortedShots[index + 1];
    const sourceCue = shot.cueId ? lyricClips.find((item) => item.id === shot.cueId) : undefined;
    const scene = sceneSpecs.find((item) => shot.start >= item.start && shot.start < item.end);
    return { id: shot.id, sceneId: scene.id, start: shot.start, end: next?.start ?? duration / fps, sourceCueId: sourceCue?.id ?? null, lyric: sourceCue?.content.text ?? null, action: scene.id==='s02-the-burden'?burdenActions[burdenActors.findIndex(c=>c.content.sourceCueId===shot.cueId)]:null, pose: shot.pose, framing: shot.pose ? shot.pose === "close" ? "close" : shot.width < 38 ? "wide" : "medium" : "music-only", motion: shot.motion, tone: shot.tone };
  }),
  audioTransitions: transitionEvents,
});
console.log(`Prepared ${scenes.length} narrative scenes, ${sortedShots.length} lyric-driven shots, ${clips.length} timeline clips, ${transitionEvents.length} sourced transition/accent events.`);
