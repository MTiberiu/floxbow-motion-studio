import cues from './film-cue-sheet.json';
import {studyState} from './study-state';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
function progress(t:number,knots:{time:number;progress:number}[]){const i=knots.findIndex(k=>k.time>=t);if(i<0)return 1;if(i===0)return 0;const a=knots[i-1],b=knots[i];return smooth(a.progress+(b.progress-a.progress)*(t-a.time)/(b.time-a.time));}
export function filmState(frame:number){
 const time=frame/30;const finale=frame>=cues.finale.frameStart;
 const index=Math.max(0,cues.worlds.filter(w=>frame>=Math.round(w.start*30)).length-1);
 const world=cues.worlds[index];
 const entry=progress(time,world.speed.enter),travel=progress(time,world.speed.explore),returning=progress(time,world.speed.exit);
 const seed=world.cameraSeed;const direction=Math.sin(seed)>0?1:-1;
 // Analytic finite-life accents: identical at playback and direct seek.
 const pulse=cues.accents.reduce((sum,a)=>{const age=time-a.time;return age>=0&&age<.7?sum+a.strength*Math.sin(Math.PI*age/.7)*Math.exp(-age*5):sum;},0);
 const envelope=Math.sin(Math.PI*travel);
 const original=studyState(frame);
 return {...original,time,index,finale,entry,returning,showReturn:time>=world.exit[0],
  paper:index===0?original.paper:0,
  warp:Math.sin(Math.PI*entry)*.7+Math.sin(Math.PI*returning),
  position:index===0?original.position:[direction*(.3+((seed%7)/7))*travel,Math.sin(seed*.3)*.45*travel,41-3*entry-(4+(seed%3))*travel-.12*pulse*envelope] as [number,number,number]};
}
