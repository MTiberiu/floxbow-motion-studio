import cues from './film-cue-sheet.json';

/** Absolute-time film strip transport: travels in HUB/entry/return; parked
 * during full-world exploration. No mutable clock, deterministic when seeking.
 * Only sprocket motion is frozen: music and travelers remain globally timed.
 */
export function transportSeconds(time:number){
 let stopped=0;
 for(const world of cues.worlds){
  const pauseStart=world.entry[1];
  const pauseEnd=world.exit[0];
  stopped+=Math.max(0,Math.min(time,pauseEnd)-pauseStart);
 }
 return Math.max(0,time-stopped);
}
export function filmIsExploring(time:number){
 return cues.worlds.some(w=>time>=w.entry[1]&&time<w.exit[0]);
}
