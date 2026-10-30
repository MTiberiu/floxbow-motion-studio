import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {CameraWorld} from './CameraWorld';
import {cameraState,ease} from './camera-state';

/** A ragged, growing aperture: entering the photographed world THROUGH the film.
 * All geometry is derived from the current composition frame (stable on seeks).
 * The prepared 2.5D world sits behind the aperture; no global opacity dissolve.
 */
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const hash=(n:number)=>{const v=Math.sin(n*127.1+78.19)*43758.5453;return v-Math.floor(v);};
function aperture(frame:number){
 // Entry at 8s, fully inside by 15s. Exit opens back to the film at 23–27s.
 const amount=frame<240?0:frame<450?ease((frame-240)/210):frame<690?1:frame<810?1-ease((frame-690)/120):0;
 const open=clamp(amount);
 const points=Array.from({length:96},(_,i)=>{
  const angle=i*Math.PI*2/96;
  const serration=.96+(hash(i*13+2)-.5)*.12+Math.sin(angle*13+frame*.025)*.015;
  const radius=(.001+open*1.5)*serration;
  return `${46+Math.cos(angle)*radius*110}% ${43+Math.sin(angle)*radius*165}%`;
 });
 return {open,polygon:`polygon(${points.join(',')})`};
}

/** Wraps only the visual clip; Timeline subtitles/audio remain outside this camera. */
export function CameraDirector({frame,orangeY,children}:{frame:number;orangeY:number;children:ReactNode}){
 const state=cameraState(frame);
 const portal=aperture(frame);
 return <AbsoluteFill style={{background:'#100e0d',overflow:'hidden'}} data-camera-shot={state.shot.shotType}>
  <AbsoluteFill>{children}</AbsoluteFill>
  {/* The camera advances BEHIND a growing irregular opening; film stays visible
      outside the burned aperture. One time source, no cut disguised as fade. */}
  <AbsoluteFill style={{
   clipPath:portal.polygon,
   opacity:portal.open===0?0:1,
   pointerEvents:'none',
   visibility:portal.open===0?'hidden':'visible',
  }}>
   <CameraWorld frame={frame} orangeY={orangeY}/>
   <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 45%,transparent 40%,rgba(12,8,5,.32))',mixBlendMode:'multiply'}}/>
  </AbsoluteFill>
 </AbsoluteFill>;
}
