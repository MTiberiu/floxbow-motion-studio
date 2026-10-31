/** Proposed music-led cut v1: 4 worlds, 2D narrative has its own time.
 * All boundaries follow the saved 30fps director/lyric phrase plan. 
 * Each world runs REVEAL -> EXPLORE -> CLOSE, without overlapping 3D stages.
 */
export const journeyCut=[
 {id:'valley',worldIndex:0,enter:27.2666666667,full:33.9666666667,close:51.8666666667,end:55.2},
 {id:'harbor',worldIndex:1,enter:73.2666666667,full:80.3,close:94.2666666667,end:97.8666666667},
 {id:'forest',worldIndex:3,enter:139.7333333333,full:144.8666666667,close:163.2666666667,end:167.7333333333},
 {id:'cloud',worldIndex:5,enter:186.9,full:193.7,close:207.0333333333,end:211.4666666667},
] as const;
export const journeyDuration=239.9666666667;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
export function journeyAt(frame:number){
 const t=frame/30;
 const i=journeyCut.findIndex(w=>t>=w.enter&&t<w.end);
 if(i<0){
  const next=journeyCut.find(w=>w.enter>t);
  const previous=[...journeyCut].reverse().find(w=>w.end<=t);
  const a=previous?.end??0,b=next?.enter??journeyDuration;
  const progress=clamp((t-a)/Math.max(.01,b-a));
  return {time:t,phase:'hub' as const,worldIndex:-1,worldId:null,
   travelerX:progress*1152,progress,mask:0,phaseProgress:progress,worldMount:false};
 }
 const w=journeyCut[i];
 const phase=t<w.full?'reveal':t<w.close?'explore':'close';
 const progress=phase==='reveal'?clamp((t-w.enter)/(w.full-w.enter))
  :phase==='explore'?clamp((t-w.full)/(w.close-w.full)):
   clamp((t-w.close)/(w.end-w.close));
 // Return has its own traveler crossing while the old world closes.
 const travelerX=phase==='reveal'?1152+768*progress:
  phase==='close'?1920*progress:1920;
 const mask=phase==='reveal'?ease(progress):phase==='close'?1-ease(progress):1;
 return {time:t,phase,worldIndex:w.worldIndex,worldId:w.id,
  travelerX,progress,mask,phaseProgress:progress,worldMount:true};
}
export function journeyNextRevealStart(frame:number){
 const t=frame/30;
 return journeyCut.find(w=>w.enter>t)?.enter??null;
}
