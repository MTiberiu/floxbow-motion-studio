import {useMemo} from 'react';
import * as THREE from 'three';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const hash=(v:number)=>{const n=Math.sin(v*117.19+32.7)*43758.5453;return n-Math.floor(n);};
/**
 * 3D bridge assembled from restrained warm filaments. All fragments are
 * geometric lines, not a shiny neon plane. Stable at any Remotion seek.
 * Coordinates live in the actual 2.5D world camera, above the water surface.
 */
export function LuminousBridge({frame}:{frame:number}){
 const build=ease((frame-270)/250);
 const pieces=useMemo(()=>{
  const spans:THREE.BufferGeometry[]=[];
  const steps=84;
  const curve=(u:number)=>new THREE.Vector3(-9+18*u,1.5+3.7*Math.sin(Math.PI*u),-17);
  // Arched supporting rib and a low walking deck.
  for(let i=0;i<steps;i++){
   const u=i/steps,v=(i+1)/steps;
   spans.push(new THREE.BufferGeometry().setFromPoints([curve(u),curve(v)]));
   spans.push(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9+18*u,1.45,-16),new THREE.Vector3(-9+18*v,1.45,-16)]));
   if(i%6===0)spans.push(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9+18*u,1.45,-16),curve(u)]));
  }
  return spans;
 },[]);
 const active=Math.floor(pieces.length*build);
 const glow=useMemo(()=>{
  const points:THREE.Vector3[]=[];
  for(let i=0;i<110;i++){
   const u=hash(i*7+1);
   points.push(new THREE.Vector3(-9+18*u,1.5+3.7*Math.sin(Math.PI*u)+(hash(i*13)-.5)*.42,-17+(hash(i*17)-.5)*1.2));
  }
  return points;
 },[]);
 return <group>
  {pieces.slice(0,active).map((geometry,i)=><line key={i} geometry={geometry}>
   <lineBasicMaterial color={i%3===0?'#f4d6a1':'#bf8f59'} transparent opacity={.35+.4*build} depthWrite={false}/>
  </line>)}
  {glow.slice(0,Math.floor(glow.length*build)).map((p,i)=><mesh key={i} position={p.toArray()}>
   <sphereGeometry args={[.012+hash(i*3)*.025,6,4]}/>
   <meshBasicMaterial color={i%4===0?'#fff0cb':'#b78a5a'} transparent opacity={.35+.5*build} depthWrite={false}/>
  </mesh>)}
 </group>;
}
