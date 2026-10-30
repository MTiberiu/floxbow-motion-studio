import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {CameraWorld} from './CameraWorld';
import {riftPush} from './RiftPushTransition';

/**
 * Reusable film <-> world travelling transition.
 * Entry: photographic world drives a charred seam left-to-right, pushing film away.
 * Exit: film returns from the left, pushing the same continuous world to the right.
 * No growing CSS portal and no reset of the music-driven three-traveler timeline.
 */
export function CameraDirector({frame,orangeY,speed,revealX,fps,children,accent=0}:{
 frame:number;orangeY:number;speed:number;revealX:number;fps:number;children:ReactNode;accent?:number
}){
 const rift=riftPush(frame);
 const showWorld=rift.phase!=='film';
 const showFilm=rift.phase!=='world';
 return <AbsoluteFill style={{background:'#100e0d',overflow:'hidden'}}
   data-camera-shot={rift.phase} data-rift-progress={rift.progress.toFixed(3)}>
  {showWorld&&<AbsoluteFill style={{clipPath:rift.worldClip,overflow:'hidden',pointerEvents:'none'}}>
   <AbsoluteFill style={{transform:`translate3d(${rift.worldShift}px,0,0)`}}>
    <CameraWorld frame={frame} orangeY={orangeY} accent={accent}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {showFilm&&<AbsoluteFill style={{clipPath:rift.filmClip,overflow:'hidden'}}>
   <AbsoluteFill style={{transform:`translate3d(${rift.filmShift}px,0,0)`}}>{children}</AbsoluteFill>
  </AbsoluteFill>}
  {/* Film rails are a stable camera-frame reference even when the world pushes
      the old route plane away. These are not part of the moving landscape. */}
  {showWorld&&<svg aria-hidden="true" viewBox="0 0 1920 1080"
    preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
    <defs><linearGradient id="riftFilmRail" x1="0" y1="0" x2="0" y2="1">
      <stop stopColor="#1b100c"/><stop offset=".5" stopColor="#3a2319"/><stop offset="1" stopColor="#130e0d"/>
    </linearGradient></defs>
    <rect width="1920" height="80" fill="url(#riftFilmRail)"/>
    <rect y="805" width="1920" height="70" fill="url(#riftFilmRail)"/>
    <path d="M0 80H1920 M0 805H1920" stroke="#976436" strokeWidth="3"/>
    {Array.from({length:34},(_,i)=>{
      const x=i*60-(frame*2%60);
      return <g key={i} fill="#c18b54" opacity=".9">
        <rect x={x} y="23" width="30" height="33" rx="5"/>
        <rect x={x} y="827" width="30" height="28" rx="5"/>
      </g>;
    })}
  </svg>}
  {/* A single actual separation contour is shared by both clips and the scorched lip.
      Film grain, black char, thin heat and cinders follow the moving border. */}
  {rift.active&&<svg aria-hidden="true" viewBox="0 0 1920 1080"
   preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <path d={rift.edgePath} stroke="#100907" strokeWidth="31" strokeLinejoin="round" fill="none" opacity=".9"/>
   <path d={rift.edgePath} stroke="#39251b" strokeWidth="17" strokeLinejoin="round" fill="none" opacity=".9"/>
   <path d={rift.edgePath} stroke="#bd6c35" strokeWidth="5" strokeLinejoin="round" fill="none" opacity=".62"/>
   <path d={rift.edgePath} stroke="#ffe3ac" strokeWidth="1.8" strokeLinejoin="round" fill="none" opacity=".46"/>
   {Array.from({length:47},(_,i)=>{
    const y=65+(i*73.9)%935;
    const x=rift.edgeX+Math.sin(i*2.17+frame*.07)*19;
    const flicker=Math.max(0,Math.sin(i*4.2+frame*.17));
    const side=rift.phase==='enter'?-1:1;
    return <g key={i} opacity={.12+flicker*.46}>
     <circle cx={x+side*(8+((i*17+frame*.55)%84))} cy={y+Math.sin(i*3.1+frame*.09)*11}
      r={.7+(i%4)*.64} fill={i%3===0?'#ffcb88':'#bb6739'}/>
    </g>;
   })}
  </svg>}
 </AbsoluteFill>;
}
