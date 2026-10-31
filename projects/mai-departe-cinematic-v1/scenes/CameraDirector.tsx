import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {CameraWorld} from './CameraWorld';
import {portalAperture} from './PortalAperture';
import {transitionAt,RETURN_START,RETURN_END,PAPER_END} from './RiftPushTransition';
import {PaperWorldPlaceholder} from './PaperWorldPlaceholder';

function BurnedSeam({path,frame,seed=0}:{path:string;frame:number;seed?:number}){
 return <svg aria-hidden="true" viewBox="0 0 1920 1080" preserveAspectRatio="none"
  style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
  <path d={path} stroke="#100907" strokeWidth="32" opacity=".98" fill="none"/>
  <path d={path} stroke="#443024" strokeWidth="18" opacity=".92" fill="none"/>
  <path d={path} stroke="#b36a35" strokeWidth="5" opacity=".65" fill="none"/>
  <path d={path} stroke="#ffd7a0" strokeWidth="1.3" opacity=".55" fill="none"/>
  {Array.from({length:43},(_,i)=>{
   const y=80+(i*117.23)%725;
   const x=path.length?0:0;
   // Ash motes derive from composition time; no playback-history dependence.
   const age=(frame*.66+i*37)%110;
   const dx=Math.sin(i*1.72+seed)*13 + age*(seed===1?-.65:.5);
   const opacity=(1-age/110)*(.15+.35*Math.abs(Math.sin(i*2.6+frame*.08)));
   return <circle key={i} cx={x+dx} cy={y} r={1+i%3} opacity={opacity} fill="#df965a"
    transform={`translate(${(seed===1?transitionAt(frame).returnEdge.x:transitionAt(frame).paperEdge.x)})`}/>;
  })}
 </svg>;
}

export function CameraDirector({frame,orangeY,speed,revealX,fps,children,accent=0}:{
 frame:number;orangeY:number;speed:number;revealX:number;fps:number;children:ReactNode;accent?:number
}){
 const stage=transitionAt(frame);
 const entering=frame<450;
 const portal=entering?portalAperture(frame,fps,speed,revealX):null;
 const inWorld=frame>=450&&frame<RETURN_START;
 const returning=frame>=RETURN_START&&frame<RETURN_END;
 const filmVisible=entering||frame>=RETURN_START&&frame<PAPER_END;
 const worldVisible=frame>=240&&frame<RETURN_END;
 const paperVisible=frame>=780;
 const filmClip=entering?'inset(0)':returning?stage.returnEdge.left:
  frame>=RETURN_END&&frame<PAPER_END?stage.paperEdge.right:'inset(0)';
 const worldClip=entering?(portal?.polygon??'inset(0 100% 0 0)'):
  returning?stage.returnEdge.right:'inset(0)';
 return <AbsoluteFill style={{background:'#120e0b',overflow:'hidden'}}
  data-camera-shot={stage.phase} data-return-progress={stage.returnProgress.toFixed(3)}
  data-paper-progress={stage.paperProgress.toFixed(3)}>
  {/* PAPER is behind the advancing film; its separate rupture follows the travelers.
      Rendering order: paper, physical 3D valley, moving film with the same traveler clock. */}
  {paperVisible&&<AbsoluteFill style={{clipPath:frame<PAPER_END?stage.paperEdge.left:'inset(0)'}}>
   <PaperWorldPlaceholder frame={frame}/>
  </AbsoluteFill>}
  {worldVisible&&<AbsoluteFill style={{clipPath:worldClip,overflow:'hidden',pointerEvents:'none'}}>
   <AbsoluteFill style={{transform:returning?`translate3d(${stage.returnProgress*145}px,0,0)`:undefined}}>
    <CameraWorld frame={frame} orangeY={orangeY} accent={accent}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {filmVisible&&<AbsoluteFill style={{clipPath:filmClip,overflow:'hidden'}}>
   {children}
  </AbsoluteFill>}
  {/* During 780..810 two neighboring fronts coexist: PAPER left, traveling film
      in the middle, and departing world on the right. The paper must occlude film. */}
  {paperVisible&&frame<RETURN_END&&<AbsoluteFill style={{clipPath:stage.paperEdge.left,overflow:'hidden',pointerEvents:'none'}}>
   <PaperWorldPlaceholder frame={frame}/>
  </AbsoluteFill>}
  {entering&&portal?.edgeVisible&&<svg aria-hidden="true" viewBox="0 0 1920 1080" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <polygon points={portal.edgePoints} fill="none" stroke="#120b08" strokeWidth="29"/>
   <polygon points={portal.edgePoints} fill="none" stroke="#754122" strokeWidth="8" opacity=".75"/>
  </svg>}
  {stage.returnActive&&<BurnedSeam path={stage.returnEdge.path} frame={frame} seed={1}/>}
  {stage.paperActive&&<BurnedSeam path={stage.paperEdge.path} frame={frame} seed={6}/>}
 </AbsoluteFill>;
}
