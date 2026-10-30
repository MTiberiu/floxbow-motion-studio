import excursion from './music-camera.json';
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(10+t*(-15+6*t));};
function musicProgress(t:number,knots:{time:number;progress:number}[]){const i=knots.findIndex(k=>k.time>=t);if(i<0)return 1;if(i===0)return 0;const a=knots[i-1],b=knots[i];return ease(a.progress+(b.progress-a.progress)*(t-a.time)/(b.time-a.time));}
export const studyTiming={entry:excursion.entry,morph:excursion.morph,end:55.2};
export function studyState(frame:number){
 const time=frame/30;
 const entry=musicProgress(time,excursion.speed.enter);
 const travel=musicProgress(time,excursion.speed.explore);
 const paper=ease((time-studyTiming.morph[0])/(studyTiming.morph[1]-studyTiming.morph[0]));
 return {time,entry,paper,position:[-.6*travel,.16*travel,38-3*entry-5*travel] as [number,number,number]};
}
/** Screen-space aperture grows beyond every corner before the film is removed. */
export function portalOutline(progress:number,time:number){
 const radius=4+progress*progress*2400;
 return Array.from({length:160},(_,i)=>{
  const a=i/160*Math.PI*2;
  const r=radius*(1+.065*Math.sin(a*7)+.025*Math.sin(a*17+time*.35));
  return [760+Math.cos(a)*r,470+Math.sin(a)*r*.82];
 });
}
