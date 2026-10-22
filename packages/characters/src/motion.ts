import type {MascotMotion} from './actions';

/** Deterministic clip-local posing; ramps expressive motion to neutral near boundaries. */
export function sampleMascotPose(input:{
 motion:MascotMotion;localFrame:number;durationInFrames:number;fps:number;speed:number;
 travelX?:number;travelY?:number;
}) {
 const {motion,localFrame,durationInFrames,fps,speed}=input;
 const clamp=(n:number)=>Math.max(0,Math.min(1,n));
 const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
 const fadeFrames=Math.max(1,Math.min(8,Math.floor(durationInFrames/4)));
 const envelope=smooth(localFrame/fadeFrames)*smooth((durationInFrames-1-localFrame)/fadeFrames);
 const time=localFrame/fps*speed,phase=time*Math.PI*2;
 const step=Math.sin(phase*2);
 const travel=Math.hypot(input.travelX??0,input.travelY??0);
 const walk=motion==='walk',dance=motion==='dance',jump=motion==='jump';
 const cycle= Math.abs(Math.sin(phase*0.7));
 const bounce=jump?cycle*105*envelope:dance?Math.abs(Math.sin(phase))*30*envelope:walk?Math.abs(step)*Math.min(12,6+travel/12)*envelope:Math.sin(phase*0.35)*4*envelope;
 return {
  bounce,
  tilt:(dance?Math.sin(phase)*13:walk?Math.sin(phase)*5:Math.sin(phase*0.35)*2)*envelope,
  leftArm:(dance?-36+Math.sin(phase)*42:walk?Math.sin(phase)*26:jump?-42:0)*envelope,
  rightArm:(motion==='wave'?-110+Math.sin(phase*2)*22:dance?36+Math.sin(phase+Math.PI)*42:walk?-Math.sin(phase)*26:jump?42:0)*envelope,
  leftLeg:(walk?step*19:dance?step*23:0)*envelope,
  rightLeg:(walk?-step*19:dance?-step*23:0)*envelope,
  spinDegrees:motion==='spin'?time*360:0,
 };
}
