import plan from './camera-shots.json';
export type ShotType='overview'|'follow-orange'|'follow-purple'|'follow-cyan'|'world-fullscreen'|'aerial';
export type Vec3=[number,number,number];
export interface CameraShot {shotType:ShotType;startFrame:number;endFrame:number;position:Vec3;target:Vec3;fov:number;transitionFrames:number;transitionType:'smoothstep'|'linear';filmVisible:boolean;routesVisible:boolean}
export const shots=plan as CameraShot[];
export const ease=(x:number)=>{const v=Math.min(1,Math.max(0,x));return v*v*v*(v*(v*6-15)+10);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function cameraState(frame:number){
 const shot=shots.find(s=>frame>=s.startFrame&&frame<s.endFrame)??shots[0];
 const index=shots.indexOf(shot),previous=shots[Math.max(0,index-1)];
 const duration=shot.endFrame-shot.startFrame;
 const raw=(frame-shot.startFrame)/Math.max(1,duration);
 const progress=shot.transitionType==='linear'?Math.min(1,Math.max(0,raw)):ease(raw);
 const transition=shot.transitionFrames===0?1:ease((frame-shot.startFrame)/shot.transitionFrames);
 const vector=(a:Vec3,b:Vec3)=>a.map((v,i)=>mix(v,b[i],progress)) as Vec3;
 // Follow is a perspective dolly. Fullscreen continues it, rather than resetting.
 const position=shot.shotType==='overview'&&index===0?shot.position:vector(previous.position,shot.position);
 const target=shot.shotType==='overview'&&index===0?shot.target:vector(previous.target,shot.target);
 const worldOpacity=index===0?0:shot.shotType==='overview'?1-transition:shot.shotType==='follow-orange'?.72*transition:.72+.28*transition;
 return {shot,position,target,fov:mix(previous.fov,shot.fov,progress),worldOpacity,filmOpacity:1-worldOpacity,
  follow:shot.shotType==='follow-orange'?transition:shot.shotType==='world-fullscreen'?1:1-transition};
}
