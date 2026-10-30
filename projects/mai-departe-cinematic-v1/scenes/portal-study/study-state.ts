import excursion from './music-camera.json';
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(10+t*(-15+6*t));};
function musicProgress(t:number,knots:{time:number;progress:number}[]){const i=knots.findIndex(k=>k.time>=t);if(i<0)return 1;if(i===0)return 0;const a=knots[i-1],b=knots[i];return ease(a.progress+(b.progress-a.progress)*(t-a.time)/(b.time-a.time));}
export const studyTiming={entry:excursion.entry,morph:excursion.morph,return:[excursion.speed.exit[0].time,excursion.speed.exit.at(-1)!.time],end:55.2};
export function studyState(frame:number){
 const time=frame/30;
 const entry=musicProgress(time,excursion.speed.enter);
 const travel=musicProgress(time,excursion.speed.explore);
 const returning=musicProgress(time,excursion.speed.exit);
 const paper=ease((time-studyTiming.morph[0])/(studyTiming.morph[1]-studyTiming.morph[0]));
 const entryScale=1/(1-.88*entry);
 const entryX=350+(960-350)*entry-350*entryScale;
 const entryY=540-540*entryScale;
 return {time,entry,paper,returning,entryScale,entryX,entryY,
  returnX:1050*(1-returning),
  warp:Math.sin(Math.PI*entry)*.7+Math.sin(Math.PI*returning),
  position:[-.6*travel+1.2*returning,.16*travel+.25*returning,41-3*entry-5*travel-3*returning] as [number,number,number]};
}
