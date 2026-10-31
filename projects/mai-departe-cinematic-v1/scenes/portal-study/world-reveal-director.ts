import cues from './film-cue-sheet.json';
import {filmState} from './film-state';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};

/** ONE controller for every landscape. Absolute frame -> deterministic world
 * appearance, lens composition and reveal emphasis. No mutable animation state.
 * All phases come from the existing cue-sheet; transition geometry is untouched.
 */
export function worldRevealDirector(frame:number){
 const s=filmState(frame);
 const world=cues.worlds[s.index];
 const entryEnd=world.entry[1],returnStart=world.exit[0];
 const time=s.time;
 const age=Math.max(0,time-world.entry[0]);
 const settle=ease((time-entryEnd)/1.8);
 const enter=ease(s.entry);
 const returnProgress=ease(s.returning);
 const revealEnergy=(1-enter)*.65+Math.sin(Math.PI*enter)*.55
   +Math.sin(Math.PI*returnProgress)*.43;
 // Exposure/lens are continuous through the end of the overlay:
 // no step at 10.8s when RestoredFilmHub is removed.
 const exposure=.065+.07*Math.sin(age*.22)+.12*revealEnergy;
 const shimmer=.55+.45*Math.sin(time*.65+s.index*2.3);
 const forward=age*.0018+Math.sin(time*.27+s.index)*.004;
 const driftX=Math.sin(time*.19+s.index*1.7)*.008;
 const driftY=Math.cos(time*.13+s.index*.7)*.004;
 // Recenter towards composition center as the full plate takes over;
 // stay subtle because existing plane has only one depth layer.
 const centerX=(1-settle)*.045*Math.sin(s.index+1)+settle*.008*Math.sin(time*.13+s.index);
 const centerY=(1-settle)*.02;
 const visible=1-returnProgress;
 return {
  entry:enter,settle,returnProgress,visible,
  exposure,shimmer,forward,driftX,driftY,centerX,centerY,
  edgeEnergy:clamp(revealEnergy),life:age,
  fullReveal:time>=entryEnd&&time<returnStart,
 };
}
