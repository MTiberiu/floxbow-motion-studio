import {useLayoutEffect,useMemo} from 'react';
import {useLoader,useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {useVideoConfig} from 'remotion';
import * as THREE from 'three';
import plate from '../assets/camera-valley-v1.png';
import slope from '../assets/journey-near-slope-v1.png';
import {cameraState,type Vec3} from './camera-state';
const vertex=`varying vec2 vUv; varying vec3 world; void main(){vUv=uv;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
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
function Rig({frame,orangeY}:{frame:number;orangeY:number}){
 const {camera,invalidate}=useThree();const state=cameraState(frame);
 useLayoutEffect(()=>{const cam=camera as THREE.PerspectiveCamera;
  cam.position.set(...state.position);cam.fov=state.fov;
  cam.lookAt(state.target[0],state.target[1]+(450-orangeY)/1080*.25*state.follow,state.target[2]);
  cam.updateProjectionMatrix();invalidate();
 },[camera,invalidate,frame,orangeY]);return null;
}
function World({frame,time,orangeY}:{frame:number;time:number;orangeY:number}){
 const textures=useLoader(THREE.TextureLoader,[plate,slope]);
 // Loaded once; ThreeCanvas Suspense waits for texture readiness in Remotion.
 useLayoutEffect(()=>{textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;});},[textures]);
 const uniforms=useMemo(()=>({image:{value:textures[0]},time:{value:time}}),[textures,time]);
 const hero:Vec3=[.8,2.4+(450-orangeY)/1080*.7,-1];
 return <>
  <Rig frame={frame} orangeY={orangeY}/>
  <color attach="background" args={['#171715']}/>
  <mesh position={[0,7,-36]}><planeGeometry args={[88,49.5]}/><meshBasicMaterial map={textures[0]} toneMapped={false}/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.5,-6]}><planeGeometry args={[90,56,1,1]}/><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={water} transparent depthWrite={false}/></mesh>
  {/* Real depth separation with natural-alpha banks; camera cannot orbit these cards. */}
  <mesh position={[-12,0,-7]}><planeGeometry args={[30,16.88]}/><meshBasicMaterial map={textures[1]} transparent alphaTest={.025} color="#bc936d" toneMapped={false}/></mesh>
  <mesh position={[18,-1,-19]} rotation={[0,0,-.12]} scale={[-1,1,1]}><planeGeometry args={[29,16.3]}/><meshBasicMaterial map={textures[1]} transparent alphaTest={.025} side={THREE.DoubleSide} color="#917c69" toneMapped={false}/></mesh>
  <mesh position={hero}><sphereGeometry args={[.045,20,12]}/><meshBasicMaterial color="#fff5d5" toneMapped={false}/></mesh>
  <mesh position={hero}><torusGeometry args={[.13,.005,8,64]}/><meshBasicMaterial color="#ffc278" transparent opacity={.8} toneMapped={false}/></mesh>
  <mesh position={hero}><planeGeometry args={[1.5,1.5]}/><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexShader={vertex} fragmentShader={`varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=exp(-r*r*18.)*.3;gl_FragColor=vec4(1.,.35,.06,a);}`}/></mesh>
 </>;
}
export function CameraWorld({frame,orangeY}:{frame:number;orangeY:number}){
 const {width,height,fps}=useVideoConfig();return <ThreeCanvas width={width} height={height}
  camera={{position:[0,2.5,16],fov:48,near:.1,far:150}} gl={{alpha:false,antialias:true}}
  style={{position:'absolute',inset:0}}><World frame={frame} time={frame/fps} orangeY={orangeY}/></ThreeCanvas>;
}
