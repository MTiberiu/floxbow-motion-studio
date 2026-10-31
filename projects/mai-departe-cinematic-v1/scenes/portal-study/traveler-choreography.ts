import {journeyCut,travelerPassage,travelerXAt} from './journey-cut';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const x=clamp(n);return x*x*(3-2*x);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
export type TravelerPose={x:number; yOffset:number; scale:number; detached:number; opacity:number; worldId:string|null};
/** Song-time choreography: every dot leaves the audio road separately.
 * The line/its sample NEVER changes. All 3 rejoin the NEXT passage's
 * correct absolute-time musical position before the existing world CLOSE.
 * Seeking is deterministic; no per-frame random impulses or CSS slides.
 */
export function travelerPoseAt(time:number,index:number):TravelerPose{
 const world=journeyCut.find(w=>time>=w.enter-5&&time<w.close);
 const home=travelerXAt(time);
 if(!world)return {x:home,yOffset:0,scale:1,detached:0,opacity:1,worldId:null};
 const wIndex=journeyCut.findIndex(w=>w.id===world.id);
 const passageStart=wIndex===0?0:journeyCut[wIndex-1].close;
 // During the first ten seconds the dots follow the road untouched.
 // Each begins a separate flight shortly before the reveal opening.
 const departure=Math.max(passageStart+7.5,world.enter-4)+index*.85;
 const detached=smooth((time-departure)/1.8)*(1-smooth((time-(world.close-5.5+index*.55))/2.3));
 const liftPhase=Math.max(0,time-departure);
 const musicalFloat=Math.sin(liftPhase*1.5+index*1.8)*28;
 const flightX=600+index*285+Math.sin(liftPhase*.44+index*1.4)*125;
 const flightY=[-155,110,-85][index]+musicalFloat;
 // Closure starts a NEW traveling passage: home is then x=0.
 // Aim back at the actual next passage origin, not the offscreen old position.
 const nextHome=0;
 const returnMix=smooth((time-(world.close-5.5+index*.55))/2.3);
 const targetX=mix(flightX,nextHome,returnMix);
 const targetY=mix(flightY,0,returnMix);
 const x=mix(home,targetX,detached)+(returnMix*(1-detached))*(nextHome-home);
 return {x,yOffset:detached*targetY,scale:1+detached*(1.5+index*.28),detached,
  opacity:1,worldId:world.id};
}
