import {useLayoutEffect,useMemo,useRef} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {EditableComponent} from '@motion/sdk/editor';
import type {TimelineClip} from '@motion/sdk/timeline';
import natural from '../../assets/camera-valley-v1.png';
import paper from '../../assets/camera-valley-paper-v1.png';
import {RestoredFilmHub,restoredFilmHubModule} from './RestoredFilmHub';
import {studyState,studyTiming} from './study-state';
import {riftEdge,smooth} from '../RiftPushTransition';
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform sampler2D natural;uniform sampler2D paperImage;uniform float progress;uniform float time;uniform float warp;uniform vec2 lens;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
void main(){
 // Fixed image coordinates keep the transformation anchored to the landscape.
 float arrival=.18+vUv.y*.48+vUv.x*.15+n(vUv*9.)*.11+n(vUv*41.)*.035;
 float material=smoothstep(arrival-.065,arrival+.065,progress*1.15);
 vec2 delta=vUv-lens;
 float distanceToLens=length(delta);
 vec2 uv=clamp(vUv+delta*exp(-distanceToLens*7.)*warp*.12,vec2(.001),vec2(.999));
 float lake=1.-smoothstep(.23,.31,uv.y);
 uv.x+=sin(uv.y*320.+time*.8)*.00035*lake*(1.-material);
 vec3 a=texture2D(natural,uv).rgb;
 vec3 b=texture2D(paperImage,uv).rgb;
 float seam=(1.-smoothstep(.0,.025,abs(arrival-progress*1.15)))*step(.001,progress)*(1.-step(.999,progress));
 vec3 color=mix(a,b,material)+vec3(.07,.033,.008)*seam;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
function BackgroundWorld({frame}:{frame:number}){
 const state=studyState(frame);const {camera,invalidate}=useThree();
 const textures=useLoader(THREE.TextureLoader,[natural,paper]);
 const uniforms=useMemo(()=>({natural:{value:textures[0]},paperImage:{value:textures[1]},progress:{value:0},time:{value:0},warp:{value:0},lens:{value:new THREE.Vector2(.39,.56)}}),[textures]);
 const material=useRef<THREE.ShaderMaterial>(null);
 useLayoutEffect(()=>{textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;});},[textures]);
 useLayoutEffect(()=>{
  camera.position.set(...state.position);camera.lookAt(state.position[0],state.position[1],0);
  uniforms.progress.value=state.paper;uniforms.time.value=state.time;uniforms.warp.value=state.warp;uniforms.lens.value.set(state.entry<1?.39:.656,state.entry<1?.56:.64);
  if(material.current)material.current.uniformsNeedUpdate=true;
  camera.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,uniforms,state.paper,state.time,...state.position]);
 return <mesh position={[0,0,0]}><planeGeometry args={[68,38.25]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} toneMapped={false}/></mesh>;
}
/** Reusable reference shot only: the user will separate and place the scenery layers. */
export function PortalMaterialScene({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {width,height,fps}=useVideoConfig();const absolute=(clip.from+frame)*30/fps;const state=studyState(absolute);
 const departure=studyTiming.return[0],arrival=studyTiming.return[1];
 const returning=state.time>=departure&&state.time<arrival;
 // First seam: the original THREE traveling markers return from the LEFT.
 const firstX=1920*state.returning;
 const front=riftEdge(firstX,absolute,2);
 // Second seam follows behind the three travelers and reveals the PAPER material.
 // It starts after the first seam has travelled far enough to leave visible road.
 const paperFollow=smooth((state.time-(departure+.65))/(arrival+.9-(departure+.65)));
 const paperFront=riftEdge(1920*paperFollow,absolute,9);
 const showReturn=state.time>=departure;
 const showPaperFollow=state.time>=departure+.65;
 return <AbsoluteFill style={{background:'#110e0c',overflow:'hidden'}} data-portal-study-time={state.time}
  data-paper-progress={state.paper} data-return-progress={state.returning}
  data-active-director="portal-study-two-rifts">
  {/* The world layer is not zoomed out: it is physically pushed off the right. */}
  <AbsoluteFill style={{clipPath:showReturn?front.right:undefined,overflow:'hidden'}}>
   <AbsoluteFill style={{transform:showReturn?`translateX(${state.returning*7}%)`:undefined}}>
    <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
     camera={{fov:50,position:state.position,near:.1,far:200}} gl={{alpha:false,antialias:true}}>
     <BackgroundWorld frame={absolute}/>
    </ThreeCanvas>
   </AbsoluteFill>
  </AbsoluteFill>
  {/* Keep the original 3.7-10.8 second entry zoom and hub composition unchanged. */}
  {state.entry<1&&<AbsoluteFill style={{transform:`translate(${state.entryX/1920*100}%,${state.entryY/1080*100}%) scale(${state.entryScale})`,transformOrigin:'top left'}}>
   <AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}>
    <RestoredFilmHub clip={clip} frame={absolute*fps/30} openWorld crossing={state.warp}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {showReturn&&<AbsoluteFill style={{clipPath:front.left,overflow:'hidden'}}>
   <AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}>
    <RestoredFilmHub clip={clip} frame={absolute*fps/30} openWorld crossing={state.warp} rails={1}/>
   </AbsoluteFill>
  </AbsoluteFill>}
  {/* PAPER is the SECOND front, following the travelers. This is not a
      full-screen image swap: both separators can exist in the same frame. */}
  {showPaperFollow&&<AbsoluteFill style={{clipPath:paperFront.left,overflow:'hidden'}}>
   <img src={paper} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
  </AbsoluteFill>}
  {returning&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <path d={front.path} fill="none" stroke="#110a08" strokeWidth="30"/>
   <path d={front.path} fill="none" stroke="#a86b3e" strokeWidth="7" opacity=".75"/>
  </svg>}
  {showPaperFollow&&paperFollow<1&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <path d={paperFront.path} fill="none" stroke="#2a211b" strokeWidth="27"/>
   <path d={paperFront.path} fill="none" stroke="#c9a77a" strokeWidth="6" opacity=".85"/>
  </svg>}
 </AbsoluteFill>;
}

export const portalStudyModule:EditableComponent={...restoredFilmHubModule,id:'director-journey-reveal',name:'Portal → landscape → paper (reference)',component:PortalMaterialScene};
export const portalStudyContinuation:EditableComponent={...portalStudyModule,id:'director-journey-reveal-legacy'};
