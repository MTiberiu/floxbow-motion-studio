/** Proposed music-led cut v1: 4 worlds, 2D narrative has its own time.
 * All boundaries follow the saved 30fps director/lyric phrase plan. 
 * Each world runs REVEAL -> EXPLORE -> CLOSE, without overlapping 3D stages.
 */
export const journeyCut=[
 {id:'valley',worldIndex:0,enter:12.8,full:20.1333333333,close:51.8666666667,end:55.2},
 {id:'harbor',worldIndex:1,enter:62.2666666667,full:69.9333333333,close:94.2666666667,end:97.8666666667},
 {id:'forest',worldIndex:3,enter:108.3,full:118.4666666667,close:163.2666666667,end:167.7333333333},
 {id:'cloud',worldIndex:5,enter:177.2333333333,full:186.9,close:207.0333333333,end:211.4666666667},
] as const;
export const journeyDuration=239.9666666667;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
/** One passage begins when the PREVIOUS world starts closing and persists
 * through HUB, next REVEAL and next EXPLORE. No phase-dependent reset.
 * X is a function ONLY of absolute song time + the saved music cut.
 */
export function travelerPassage(time:number){
 const nextIndex=journeyCut.findIndex(w=>time<w.close);
 if(nextIndex>=0){
  const next=journeyCut[nextIndex];
  const start=nextIndex===0?0:journeyCut[nextIndex-1].close;
  const speed=1152/(next.enter-start);
  return {start,speed,nextWorld:next.id};
 }
 const final=journeyCut[journeyCut.length-1];
 return {start:final.close,speed:1920/(journeyDuration-final.close),nextWorld:null};
}
export function travelerXAt(time:number){
 const passage=travelerPassage(time);
 return (time-passage.start)*passage.speed;
}
export function journeyAt(frame:number){
 const t=frame/30;
 const i=journeyCut.findIndex(w=>t>=w.enter&&t<w.end);
 if(i<0){
  const next=journeyCut.find(w=>w.enter>t);
  const passage=travelerPassage(t);
  const a=passage.start,b=next?.enter??journeyDuration;
  const progress=clamp((t-a)/Math.max(.01,b-a));
  const travelerX=travelerXAt(t);
  return {time:t,phase:'hub' as const,worldIndex:-1,worldId:null,
   travelerX,progress,mask:0,phaseProgress:progress,worldMount:false};
 }
 const w=journeyCut[i];
 const phase=t<w.full?'reveal':t<w.close?'explore':'close';
 const progress=phase==='reveal'?clamp((t-w.enter)/(w.full-w.enter))
  :phase==='explore'?clamp((t-w.full)/(w.close-w.full)):
   clamp((t-w.close)/(w.end-w.close));
 // Return has its own traveler crossing while the old world closes.
 // Linear motion avoids the previous eased sprint and sudden exit velocity.
 const travelerX=travelerXAt(t);
 // The organic frontier never catches the travelers: reveal continues after
 // they have left frame, on the recorded musical interval.
 const frontProgress=phase==='reveal'?progress:
  phase==='close'?clamp((progress-.20)/.80):1;
 const mask=phase==='reveal'?frontProgress:phase==='close'?1-frontProgress:1;
 return {time:t,phase,worldIndex:w.worldIndex,worldId:w.id,
  travelerX,progress,mask,phaseProgress:progress,worldMount:true};
}
export function journeyNextRevealStart(frame:number){
 const t=frame/30;
 return journeyCut.find(w=>w.enter>t)?.enter??null;
}
