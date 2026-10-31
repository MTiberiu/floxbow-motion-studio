import {useLayoutEffect} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {TimelineClip} from '@motion/sdk/timeline';
import type {EditableComponent} from '@motion/sdk/editor';
import guides from '../../motion-guides.json';
import accents from './film-cue-sheet.json';
import valley from '../../assets/camera-valley-v1.png';
import harbor from '../../assets/camera-harbor-v1.png';
import forest from '../../assets/camera-forest-v1.png';
import cloud from '../../assets/camera-cloud-v1.png';
import {journeyAt,journeyCut} from './journey-cut';
import {RiftBoundary} from './RiftBoundary';

const plates:Record<number,string>={0:valley,1:harbor,3:forest,5:cloud};
// Fetch source images early without mounting any world or WebGL context in HUB solo.
useLoader.preload(THREE.TextureLoader,[valley,harbor,forest,cloud]);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
const guideKeys=['phraseEmotional','vocalProsody','wordGravity'] as const;
function pathY(t:number,index:number){
 const p=Math.max(0,Math.min(guides.samples.length-1,t/guides.sampleStepSeconds));
 const a=Math.floor(p),b=Math.min(a+1,guides.samples.length-1);
 const value=guides.samples[a][guideKeys[index]]*(1-(p-a))+guides.samples[b][guideKeys[index]]*(p-a);
 return 440-value*[32,50,46][index]*.92+[0,13,-13][index];
}
function CameraPlate({frame,index,start,full,end}:{frame:number;index:number;start:number;full:number;end:number}){
 const time=frame/30;
 const reveal=ease((time-start)/(full-start));
 const explore=ease((time-full)/Math.max(1,end-full));
 const texture=useLoader(THREE.TextureLoader,plates[index]);
 const {camera,invalidate}=useThree();
 const seed=index*1.71+.37;
 const direction=Math.sin(seed)>0?1:-1;
 const pulse=accents.accents.reduce((sum,c)=>{const age=time-c.time;return age>=0&&age<.6?sum+c.strength*Math.sin(Math.PI*age/.6):sum;},0);
 useLayoutEffect(()=>{texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;},[texture]);
 useLayoutEffect(()=>{
  // World already fills screen. Camera retreats during reveal and later
  // moves in a deterministic audio-directed pan / dolly.
  const x=direction*(1.6*(1-reveal)+2.1*explore);
  const y=.28*(1-reveal)+.35*Math.sin(seed)*explore;
  camera.position.set(x,y,33+9*reveal-3*explore-.1*Math.min(1,pulse));
  camera.lookAt(x*.1,y*.1,0);
  camera.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,reveal,explore,pulse,seed,direction]);
 return <mesh><planeGeometry args={[78,44]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
function WorldStage({frame,index,start,full,end,width,height}:{frame:number;index:number;start:number;full:number;end:number;width:number;height:number}){
 return <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
  camera={{fov:50,position:[0,0,42],near:.1,far:200}} gl={{alpha:false,antialias:true}}>
  <CameraPlate frame={frame} index={index} start={start} full={full} end={end}/>
 </ThreeCanvas>;
}
function edgeX(y:number,front:number,time:number){
 // Multiscale irregular frontier: one geometry feeds clipping AND glowing tears.
 const wobble=57*Math.sin(y*.011+time*.12)+34*Math.sin(y*.025-time*.07)
  +18*Math.sin(y*.054+time*.17)+7*Math.sin(y*.129-time*.06);
 return front+wobble;
}
function edgePolygon(front:number,time:number,keep:'left'|'right'){
 const pts=Array.from({length:145},(_,i)=>{const y=i*1080/144;return `${edgeX(y,front,time).toFixed(2)}px ${(y/10.8).toFixed(3)}%`;});
 if(keep==='left')return `polygon(0% 0%,${pts.join(',')},0% 100%)`;
 return `polygon(${pts.join(',')},100% 100%,100% 0%)`;
}
const colors=['#db884e','#aa64d5','#399cbd'];
const roadSpeed=1920/55;
/** The exact same song-time sampling drives rendered curves and their riders. */
function visibleRoadY(time:number,x:number,index:number){
 return pathY(Math.max(0,time+(x-960)/roadSpeed),index);
}
function FixedHub({time}:{time:number}){
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 66% 43%,#312017 0%,#121016 60%,#080b12 100%)'}}>
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{width:'100%',height:'100%'}}>
   <defs><pattern id="journey-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" stroke="#b89570" strokeWidth=".75" opacity=".20" fill="none"/></pattern></defs>
   <rect x="0" y="80" width="1920" height="925" fill="url(#journey-grid)"/>
   {guideKeys.map((_,i)=>{
    const pts=Array.from({length:276},(_,n)=>{const px=n*7;return `${px},${visibleRoadY(time,px,i)}`;});
    return <g key={i}>
     <path d={`M${pts.join(' L')}`} fill="none" stroke={colors[i]} strokeWidth="3" opacity=".85"/>
    </g>;
   })}
  </svg>
 </AbsoluteFill>;
}
/** Film hub is fixed. ONLY travelers move. A single 3D world is masked on
 * top of this hub; no sliding image or overlapping 3D world canvases.
 */
export function JourneyCutScene({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {width,height,fps}=useVideoConfig();
 const globalFrame=(clip.from+frame)*30/fps;
 const state=journeyAt(globalFrame),time=state.time;
 const world=journeyCut.find(w=>w.worldIndex===state.worldIndex);
 const front=state.phase==='reveal'?-100+2240*state.mask:
  state.phase==='close'?-100+2240*(1-state.mask):2140;
 const mask=state.phase==='close'?edgePolygon(front,time,'right'):edgePolygon(front,time,'left');
 const edgeVisible=state.phase==='reveal'||state.phase==='close';
 const sprocketShift=state.phase==='explore'?0:(time*1920/55)%60;
 return <AbsoluteFill style={{background:'#0b0c10',overflow:'hidden'}} data-active-director="journey-hub-world-v2" data-journey-phase={state.phase} data-world-id={state.worldId??'solo'}>
  <FixedHub time={time}/>
  {world&&<AbsoluteFill key={world.id} data-active-world={world.id} style={{clipPath:mask}}>
   <WorldStage frame={globalFrame} index={world.worldIndex} start={world.enter} full={world.full} end={world.end} width={width} height={height}/>
  </AbsoluteFill>}
  {/* Markers are ABOVE the 3D reveal, following the fixed HUD road. */}
  {state.phase!=='explore'&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   {colors.map((color,i)=><g key={i}>
    <circle cx={state.travelerX} cy={visibleRoadY(time,state.travelerX,i)} r="28" fill={color} opacity=".1"/>
    <circle cx={state.travelerX} cy={visibleRoadY(time,state.travelerX,i)} r="12" fill={color} opacity=".5"/>
    <circle cx={state.travelerX} cy={visibleRoadY(time,state.travelerX,i)} r="6" fill={color}/>
    <circle cx={state.travelerX} cy={visibleRoadY(time,state.travelerX,i)} r="3" fill="white"/>
   </g>)}
  </svg>}
  {edgeVisible&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <RiftBoundary time={time} speed={1920/55} revealX={front}
    intensity={.38+Math.sin(Math.PI*state.phaseProgress)*.40}
    edge={'M'+Array.from({length:145},(_,i)=>{const y=i*1080/144;return `${edgeX(y,front,time)},${y}`;}).join(' L')}
    sampleAt={(y)=>edgeX(y,front,time)}/>
  </svg>}
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <path d="M0 0H1920V80H0Z M0 1005H1920V1080H0Z" fill="#20130f"/>
   <path d="M0 80H1920 M0 1005H1920" stroke="#bb7b44" strokeWidth="3"/>
   {Array.from({length:35},(_,i)=>{const x=i*60-sprocketShift;return <g key={i} fill="#b78654"><rect x={x} y="22" width="31" height="35" rx="5"/><rect x={x} y="1025" width="31" height="31" rx="5"/></g>;})}
  </svg>
 </AbsoluteFill>;
}
export const journeyCutModule:EditableComponent={
 id:'director-journey-reveal',name:'Journey HUB + 4 music-cued live worlds',component:JourneyCutScene,fields:[],
};
export const journeyCutContinuation:EditableComponent={...journeyCutModule,id:'director-journey-reveal-legacy'};
