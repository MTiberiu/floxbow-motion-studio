import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {CameraWorld} from './CameraWorld';
import {cameraState} from './camera-state';
import {portalAperture} from './PortalAperture';

/** A ragged, growing aperture: entering the photographed world THROUGH the film.
 * All geometry is derived from the current composition frame (stable on seeks).
 * The prepared 2.5D world sits behind the aperture; no global opacity dissolve.
 */
/** Wraps only the visual clip; Timeline subtitles/audio remain outside this camera. */
export function CameraDirector({frame,orangeY,speed,revealX,fps,children}:{frame:number;orangeY:number;speed:number;revealX:number;fps:number;children:ReactNode}){
 const state=cameraState(frame);
 const portal=portalAperture(frame,fps,speed,revealX);
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
