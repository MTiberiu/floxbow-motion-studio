import {filmState} from './film-state';

/** Reusable motion only while an image is being discovered by the three
 * travelers on the film. NOT the camera animation inside a full 3D world.
 * Evaluated from absolute frame time, seek-safe and applied to all six worlds.
 */
export function travelerRevealMotion(frame:number){
 const state=filmState(frame);
 const p=Math.max(0,Math.min(1,state.entry));
 // Exposure of a landscape increases behind the three travelers. At the
 // first frame of the full 3D view it is already in its settled framing.
 const focus=p*p*(3-2*p);
 const phase=state.time*.49+state.index*1.8;
 return {
  progress:p,
  // Readable slow optical travel in film space; never animate the clipping
  // edge separately from travelers and the existing emulsion field.
  x:(1-focus)*(-2.8+Math.sin(phase)*.5),
  y:(1-focus)*(.7+Math.cos(phase*.77)*.35),
  scale:1.085-.085*focus,
  grade:1+.08*(1-focus),
  haze:.20*(1-focus),
 };
}
