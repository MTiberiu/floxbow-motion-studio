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
import {portalOutline,studyState} from './study-state';
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform sampler2D natural;uniform sampler2D paperImage;uniform float progress;uniform float time;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
void main(){
 // Fixed image coordinates keep the transformation anchored to the landscape.
 float arrival=.18+vUv.y*.48+vUv.x*.15+n(vUv*9.)*.11+n(vUv*41.)*.035;
 float material=smoothstep(arrival-.065,arrival+.065,progress*1.15);
 vec2 uv=vUv;
 float lake=1.-smoothstep(.23,.31,uv.y);
 uv.x+=sin(uv.y*320.+time*.8)*.00035*lake*(1.-material);
 vec3 a=texture2D(natural,uv).rgb;
 vec3 b=texture2D(paperImage,vUv).rgb;
 float seam=(1.-smoothstep(.0,.025,abs(arrival-progress*1.15)))*step(.001,progress)*(1.-step(.999,progress));
 vec3 color=mix(a,b,material)+vec3(.07,.033,.008)*seam;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
function BackgroundWorld({frame}:{frame:number}){
 const state=studyState(frame);const {camera,invalidate}=useThree();
 const textures=useLoader(THREE.TextureLoader,[natural,paper]);
 const uniforms=useMemo(()=>({natural:{value:textures[0]},paperImage:{value:textures[1]},progress:{value:0},time:{value:0}}),[textures]);
 const material=useRef<THREE.ShaderMaterial>(null);
 useLayoutEffect(()=>{textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;});},[textures]);
 useLayoutEffect(()=>{
  camera.position.set(...state.position);camera.lookAt(state.position[0],state.position[1],0);
  uniforms.progress.value=state.paper;uniforms.time.value=state.time;
  if(material.current)material.current.uniformsNeedUpdate=true;
  camera.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,uniforms,state.paper,state.time,...state.position]);
 return <mesh position={[0,0,0]}><planeGeometry args={[68,38.25]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} toneMapped={false}/></mesh>;
}
/** Reusable reference shot only: the user will separate and place the scenery layers. */
export function PortalMaterialScene({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {width,height,fps}=useVideoConfig();const absolute=(clip.from+frame)*30/fps;const state=studyState(absolute);
 const points=portalOutline(state.entry,state.time);const contour=`M${points.map(p=>p.join(',')).join(' L')}Z`;
 const cut=`M-500,-500 H2420 V1580 H-500Z ${contour}`;
 const mask=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><path d="${cut}" fill="white" fill-rule="evenodd"/></svg>`)}")`;
 return <AbsoluteFill style={{background:'#110e0c',overflow:'hidden'}} data-portal-study-time={state.time} data-paper-progress={state.paper}>
  <ThreeCanvas width={width} height={height} style={{position:'absolute',inset:0,width:'100%',height:'100%'}} camera={{fov:50,position:state.position,near:.1,far:200}} gl={{alpha:false,antialias:true}}><BackgroundWorld frame={absolute}/></ThreeCanvas>
  {state.entry<1&&<AbsoluteFill style={{maskImage:state.entry>0?mask:undefined,WebkitMaskImage:state.entry>0?mask:undefined,maskSize:'100% 100%',WebkitMaskSize:'100% 100%'}}>
   <AbsoluteFill style={{transform:'scaleY(1.2342857143)',transformOrigin:'top'}}><RestoredFilmHub clip={clip} frame={absolute*fps/30}/></AbsoluteFill>
  </AbsoluteFill>}
  {state.entry>0&&state.entry<1&&<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   <defs><filter id="portalStudyGlow"><feGaussianBlur stdDeviation="12"/></filter></defs>
   <path d={contour} fill="none" stroke="#efa64b" strokeWidth="24" opacity=".45" filter="url(#portalStudyGlow)"/>
   <path d={contour} fill="none" stroke="#21120a" strokeWidth="15"/>
   <path d={contour} fill="none" stroke="#f8cd87" strokeWidth="3"/>
   <path d={contour} fill="none" stroke="#fff5d7" strokeWidth="1" strokeDasharray="3 13 31 7" strokeDashoffset={-state.time*24}/>
  </svg>}
 </AbsoluteFill>;
}
export const portalStudyModule:EditableComponent={...restoredFilmHubModule,id:'director-journey-reveal',name:'Portal → landscape → paper (reference)',component:PortalMaterialScene};
export const portalStudyContinuation:EditableComponent={...portalStudyModule,id:'director-journey-reveal-legacy'};
