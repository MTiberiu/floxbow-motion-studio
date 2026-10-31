import cues from './film-cue-sheet.json';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
const lerp=(a:number,b:number,p:number)=>a+(b-a)*p;

/** Shared audio-directed 3D camera. Never random at render time.
 * Seed gives each world a different demonstration pan/dolly; saved music cues
 * provide exact arrival, exploration and accent instants.
 * Supports prewarming the NEXT world during the outgoing world's return.
 */
export function worldCameraAt(absoluteFrame:number,index:number){
 const world=cues.worlds[index];
 const time=absoluteFrame/30;
 const local=Math.max(world.start,time);
 const entry=smooth((local-world.entry[0])/(world.entry[1]-world.entry[0]));
 const explore=smooth((local-world.explore[0])/(world.explore[1]-world.explore[0]));
 const exit=smooth((local-world.exit[0])/(world.exit[1]-world.exit[0]));
 const seed=world.cameraSeed;
 const previous=index>0?cues.worlds[index-1]:null;
 const preStart=previous?.exit[0]??world.start;
 const preparing=time<world.start&&!!previous;
 const prelude=preparing?smooth((time-preStart)/Math.max(.001,world.start-preStart)):1;
 const direction=Math.sin(seed)>0?1:-1;
 // The view starts nearer the scene and retreats continuously until reveal
 // completion; afterwards a slow, deterministic pan and forward dolly.
 const z=lerp(34,42,entry)-3.5*explore+(preparing?1.3*(1-prelude):0);
 const x=direction*(.85*(1-entry)+1.45*explore)+(preparing?direction*1.35*(1-prelude):0);
 const y=.32*(1-entry)+.46*Math.sin(seed*.17)*explore+(preparing?-.26*(1-prelude):0);
 let beat=0;
 for(const accent of cues.accents){
  const age=local-accent.time;
  if(age>=0&&age<.8) beat+=accent.strength*Math.sin(Math.PI*age/.8)*Math.exp(-age*5);
 }
 // Keep beat response small, continuous, and bounded (not a random zoom).
 const boundedBeat=Math.max(-1,Math.min(1,beat));
 const distance=z-.12*boundedBeat*Math.sin(Math.PI*explore);
 return {position:[x,y,distance] as [number,number,number],
  target:[x*.16,y*.12,0] as [number,number,number],
  entry,explore,exit,worldId:world.id};
}
