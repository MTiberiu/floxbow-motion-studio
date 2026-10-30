import {useLayoutEffect,useMemo} from 'react';
import {useLoader,useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {useVideoConfig} from 'remotion';
import * as THREE from 'three';
import plate from '../assets/camera-valley-v1.png';
import slope from '../assets/journey-near-slope-v1.png';
import {cameraState,type Vec3} from './camera-state';
import {LuminousBridge} from './LuminousBridge';
import {WorldDepthRidges} from './WorldDepthRidges';
import {DistantFilmBackdrop} from './DistantFilmBackdrop';
import {revealMotion} from './reveal-motion';
const vertex=`varying vec2 vUv; varying vec3 world; void main(){vUv=uv;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const mistVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const mistFragment=`uniform float time;uniform float seed;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec2 uv=vUv;float n=noise(vec2(uv.x*8.+time*.045+seed,uv.y*2.5+seed));
 float n2=noise(vec2(uv.x*17.-time*.025,uv.y*4.5+seed*2.));
 float band=exp(-pow((uv.y-.37-n*.13)/.24,2.));
 float alpha=(.12+n*.22+n2*.07)*band*smoothstep(0.,.18,uv.x)*(1.-smoothstep(.82,1.,uv.x));
 vec3 color=mix(vec3(.45,.57,.57),vec3(.89,.70,.53),.30+n*.35);
 gl_FragColor=vec4(color,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const worldPlate=`uniform sampler2D image;uniform float time;varying vec2 vUv;
void main(){
 // UV y=1 is sky; y=0 is foreground. Keep the optical flow ordered by depth.
 float sky=smoothstep(.75,.91,vUv.y);
 float mountains=smoothstep(.39,.57,vUv.y)*(1.-smoothstep(.76,.94,vUv.y));
 float near=1.-smoothstep(.24,.49,vUv.y);
 float speed=.00007+mountains*.00012+near*.00042;
 float push=time*.00019;
 vec2 uv=vec2(.5)+ (vUv-vec2(.5))*(1.-min(.034,push));
 uv.x-=time*speed*(1.-sky*.6);
 uv.x+=sin(time*.12+vUv.y*3.)*.001*(1.-sky);
 uv=clamp(uv,vec2(.004),vec2(.996));
 vec3 c=texture2D(image,uv).rgb;
 // Defer colour grade to the image, avoiding synthetic gaming gloss.
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const water=`uniform sampler2D image;uniform float time;varying vec2 vUv;varying vec3 world;
void main(){float waves=sin(world.z*4.2+time*.8+sin(world.x*1.4))*sin(world.x*6.-time*.4);
vec2 uv=vec2(clamp(.5+world.x/65.,.02,.98),.27+min(.4,abs(world.z+25.)*.008));
uv.x+=waves*.002;vec3 reflection=texture2D(image,uv).rgb;
float glint=pow(max(0.,sin(world.z*13.+time*.7+sin(world.x*8.))),28.);
float light=exp(-pow((world.x+1.)/3.,2.));
vec3 color=mix(vec3(.025,.08,.085),reflection*.45,.35)+vec3(.8,.43,.16)*glint*light*.28;
float fade=smoothstep(-28.,-17.,world.z);gl_FragColor=vec4(color,fade*.16);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
function Rig({frame,orangeY,accent}:{frame:number;orangeY:number;accent:number}){
 const {camera,invalidate}=useThree();const state=cameraState(frame);
 useLayoutEffect(()=>{const cam=camera as THREE.PerspectiveCamera;
  // A small continuous travelling motion begins as soon as the aperture opens.
  // World geometry, film and camera are all evaluated from the same frame.
  const moving=Math.max(0,Math.min(1,(frame-240)/210));
  const sway=Math.sin(frame/150)*.17*moving;
  // Music-derived prosody attacks gently accelerate the physical dolly, not image scale.
  const impulse=Math.max(0,Math.min(1,accent));
  cam.position.set(state.position[0]+sway,state.position[1]+Math.sin(frame/210)*.045*moving,state.position[2]-.7*impulse*moving);
  cam.fov=state.fov;
  cam.lookAt(state.target[0],state.target[1]+(450-orangeY)/1080*.25*state.follow,state.target[2]);
  cam.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,orangeY,accent]);return null;
}
function World({frame,time,orangeY,accent}:{frame:number;time:number;orangeY:number;accent:number}){
 const motion=revealMotion(time);
 const textures=useLoader(THREE.TextureLoader,[plate,slope]);
 // Loaded once; ThreeCanvas Suspense waits for texture readiness in Remotion.
 useLayoutEffect(()=>{textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;});},[textures]);
 const uniforms=useMemo(()=>({image:{value:textures[0]},time:{value:time}}),[textures,time]);
 const plateUniforms=useMemo(()=>({image:{value:textures[0]},time:{value:time}}),[textures,time]);
 const hero:Vec3=[.8,2.4+(450-orangeY)/1080*.7,-1];
 const mistA=useMemo(()=>({time:{value:time},seed:{value:1.1}}),[]);
 const mistB=useMemo(()=>({time:{value:time},seed:{value:4.7}}),[]);
 mistA.time.value=time;mistB.time.value=time;
 return <>
  <Rig frame={frame} orangeY={orangeY} accent={accent}/>
  <color attach="background" args={['#171715']}/>
  <mesh position={[0,7,-36]}><planeGeometry args={[88,49.5]}/><shaderMaterial uniforms={plateUniforms} vertexShader={vertex} fragmentShader={worldPlate}/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.5,-6]}><planeGeometry args={[90,56,1,1]}/><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={water} transparent depthWrite={false}/></mesh>
  {/* Real depth separation with natural-alpha banks; camera cannot orbit these cards. */}
  <mesh position={[-12+motion.worldOffset.middle*1.25,0,-7]}><planeGeometry args={[30,16.88]}/><meshBasicMaterial map={textures[1]} transparent alphaTest={.025} color="#bc936d" toneMapped={false}/></mesh>
  <mesh position={[18+motion.worldOffset.far,-1,-19]} rotation={[0,0,-.12]} scale={[-1,1,1]}><planeGeometry args={[29,16.3]}/><meshBasicMaterial map={textures[1]} transparent alphaTest={.025} side={THREE.DoubleSide} color="#917c69" toneMapped={false}/></mesh>
  <DistantFilmBackdrop time={time}/>
  <WorldDepthRidges time={time}/>
  {/* The same world remains visible through the tear and after crossing it:
      two independently drifting mist planes at different physical depths. */}
  <mesh position={[0,1,-26]} renderOrder={4}>
   <planeGeometry args={[72,18]}/>
   <shaderMaterial vertexShader={mistVertex} fragmentShader={mistFragment} uniforms={mistB}
    transparent depthWrite={false} side={THREE.DoubleSide}/>
  </mesh>
  <mesh position={[0,-.2,-12]} renderOrder={5}>
   <planeGeometry args={[44,13]}/>
   <shaderMaterial vertexShader={mistVertex} fragmentShader={mistFragment} uniforms={mistA}
    transparent depthWrite={false} side={THREE.DoubleSide}/>
  </mesh>
  {/* Close silhouettes give the advance a readable optical-flow cue.
      Both use the existing natural-alpha bank artwork. */}
  <mesh position={[-23+motion.worldOffset.near,-3,0]} rotation={[0,.08,0]}>
   <planeGeometry args={[25,14]}/>
   <meshBasicMaterial map={textures[1]} transparent alphaTest={.03} color="#514b42"
    toneMapped={false} depthWrite={false}/>
  </mesh>
  <mesh position={[25+motion.worldOffset.near*.82,-3,-2]} rotation={[0,-.10,0]} scale={[-1,1,1]}>
   <planeGeometry args={[25,14]}/>
   <meshBasicMaterial map={textures[1]} transparent alphaTest={.03} color="#554c41"
    toneMapped={false} side={THREE.DoubleSide} depthWrite={false}/>
  </mesh>
  <LuminousBridge frame={frame}/>
  <mesh position={hero}><sphereGeometry args={[.045,20,12]}/><meshBasicMaterial color="#fff5d5" toneMapped={false}/></mesh>
  <mesh position={hero}><torusGeometry args={[.13,.005,8,64]}/><meshBasicMaterial color="#ffc278" transparent opacity={.8} toneMapped={false}/></mesh>
  <mesh position={hero}><planeGeometry args={[1.5,1.5]}/><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexShader={vertex} fragmentShader={`varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=exp(-r*r*18.)*.3;gl_FragColor=vec4(1.,.35,.06,a);}`}/></mesh>
 </>;
}
export function CameraWorld({frame,orangeY,accent=0}:{frame:number;orangeY:number;accent?:number}){
 const {width,height,fps}=useVideoConfig();return <ThreeCanvas width={width} height={height}
  camera={{position:[0,2.5,16],fov:48,near:.1,far:150}} gl={{alpha:false,antialias:true}}
  style={{position:'absolute',inset:0}}><World frame={frame} time={frame/fps} orangeY={orangeY} accent={accent}/></ThreeCanvas>;
}
