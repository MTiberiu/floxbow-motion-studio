import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {CameraWorld} from './CameraWorld';
import {cameraState} from './camera-state';
/** Wraps only the visual clip; Timeline subtitles/audio remain outside this camera. */
export function CameraDirector({frame,orangeY,children}:{frame:number;orangeY:number;children:ReactNode}){
 const state=cameraState(frame);
 return <AbsoluteFill style={{background:'#100e0d',overflow:'hidden'}} data-camera-shot={state.shot.shotType}>
  <AbsoluteFill style={{opacity:1,visibility:state.filmOpacity===0?'hidden':'visible'}}>{children}</AbsoluteFill>
  {/* Keep textures and camera mounted across seeks. Opacity is not a second clock. */}
  <AbsoluteFill style={{opacity:state.worldOpacity,pointerEvents:'none',visibility:state.worldOpacity===0?'hidden':'visible'}}>
   <CameraWorld frame={frame} orangeY={orangeY}/>
   <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 45%,transparent 40%,rgba(12,8,5,.32))',mixBlendMode:'multiply'}}/>
  </AbsoluteFill>
 </AbsoluteFill>;
}
