import {journeyCut,travelerXAt} from './journey-cut';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const x=clamp(n);return x*x*(3-2*x);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
export type TravelerPose={
 x:number; yOffset:number; scale:number; detached:number;
 opacity:number; worldId:string|null; costume:'orb'|'character';
};
/** The underlying sound-path remains immutable. Separate visual flight poses
 * are driven by absolute music time and smoothly return BEFORE world closure.
 * Actors can later supply per-world alpha textures without changing paths.
 */
export function travelerPoseAt(time:number,index:number):TravelerPose{
 const home=travelerXAt(time);
 const world=journeyCut.find(w=>time>=w.enter-5 && time<w.close);
 if(!world)return {x:home,yOffset:0,scale:1,detached:0,opacity:1,worldId:null,costume:'orb'};
 const i=journeyCut.findIndex(w=>w.id===world.id);
 const passageStart=i===0?0:journeyCut[i-1].close;
 const departure=Math.max(passageStart+7.5,world.enter-4)+index*.78;
 const landing=world.close-4.8+index*.48;
 const leave=smooth((time-departure)/1.6);
 const rejoin=smooth((time-landing)/2);
 const flight=leave*(1-rejoin);
 const age=Math.max(0,time-departure);
 // Orbs travel inside the world independently; the camera changes only
 // the world layer and cannot add velocity to the musical-road position.
 const flightX=840+index*170+115*Math.sin(age*.39+index*1.3);
 const flightY=[-155,120,-80][index]+38*Math.sin(age*1.1+index*1.7);
 const x=mix(home,flightX,flight);
 return {
  x,yOffset:flight*flightY,scale:1+flight*(1.3+index*.22),
  detached:flight,opacity:1,worldId:world.id,costume:'orb',
 };
}
