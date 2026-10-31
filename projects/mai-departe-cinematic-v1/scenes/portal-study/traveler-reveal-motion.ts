import cues from './film-cue-sheet.json';
import {filmState} from './film-state';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

/**
 * The photographed world MOVES behind the travelers' fixed developing front.
 * This is film-space motion, not a second zoom animation on the Three.js world.
 * Same continuous source image framing through return -> next world's hub.
 */
export function travelerRevealMotion(frame:number,mode:'entry'|'return'='entry'){
 const state=filmState(frame);
 const world=cues.worlds[state.index];
 const progress=clamp(mode==='return'?state.returning:state.entry);
 const duration=mode==='return'
  ?Math.max(.1,world.exit[1]-world.exit[0])
  :Math.max(.1,world.entry[1]-world.entry[0]);
 const elapsed=mode==='return'
  ?clamp((state.time-world.exit[0])/duration)
  :clamp((state.time-world.entry[0])/duration);
 return {
  progress,
  // Translate the view within a fixed overscanned plate, never a series of
  // zoom levels. The new world starts from the same neutral scale every time.
  x:-2.8+5.6*elapsed,
  y:.5*Math.sin(Math.PI*elapsed),
  scale:1.09,
  grade:1,
  haze:0,
 };
}
