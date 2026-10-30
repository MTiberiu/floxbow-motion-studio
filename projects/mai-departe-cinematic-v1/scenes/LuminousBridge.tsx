import {useMemo} from 'react';
import * as THREE from 'three';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const hash=(v:number)=>{const n=Math.sin(v*117.19+32.7)*43758.5453;return n-Math.floor(n);};

type BridgeSegment={geometry:THREE.BufferGeometry;index:number;kind:'arch'|'deck'|'hanger'};

/**
 * The bridge builds physically from the left abutment to the right.
 * Previous implementation interleaved all segment categories and revealed
 * them by array count, which looked like unrelated glowing fragments.
 * Every vertex is frame-addressable; no accumulating playback state.
 */
export function LuminousBridge({frame}:{frame:number}){
 const build=ease((frame-270)/250);
 const spans=useMemo(()=>{
  const result:BridgeSegment[]=[];
  const steps=84;
  const arch=(u:number)=>new THREE.Vector3(-9+18*u,1.55+3.7*Math.sin(Math.PI*u),-17);
  const deck=(u:number)=>new THREE.Vector3(-9+18*u,1.45,-16);
  for(let i=0;i<steps;i++){
   const u=i/steps,v=(i+1)/steps;
   result.push({geometry:new THREE.BufferGeometry().setFromPoints([deck(u),deck(v)]),index:i,kind:'deck'});
   result.push({geometry:new THREE.BufferGeometry().setFromPoints([arch(u),arch(v)]),index:i,kind:'arch'});
   if(i%6===0)result.push({geometry:new THREE.BufferGeometry().setFromPoints([deck(u),arch(u)]),index:i,kind:'hanger'});
  }
  return result;
 },[]);
 // The construction front crosses 84 sequential intervals: do not reveal
 // beams far away while the leading end of the bridge has not arrived.
 const visible=build*84;
 const emberPositions=useMemo(()=>Array.from({length:95},(_,i)=>{
  const u=hash(i*7+1);
  return {u,p:new THREE.Vector3(-9+18*u,1.55+3.7*Math.sin(Math.PI*u)+(hash(i*13)-.5)*.36,-17+(hash(i*17)-.5)*.75)};
 }),[]);
 return <group>
  {spans.filter(segment=>segment.index<=visible).map((segment,i)=>{
   const birth=clamp(visible-segment.index);
   const opacity=(segment.kind==='hanger'?.25:.42)*(.3+.7*ease(birth));
   return <line key={segment.kind+segment.index} geometry={segment.geometry}>
    <lineBasicMaterial color={segment.kind==='arch'?'#e1bd88':'#b38a5e'} transparent opacity={opacity} depthWrite={false}/>
   </line>;
  })}
  {emberPositions.filter(dot=>dot.u<=build).map((dot,i)=><mesh key={i} position={dot.p.toArray()}>
   <sphereGeometry args={[.014+hash(i*3)*.018,6,4]}/>
   <meshBasicMaterial color={i%4===0?'#f8e2ba':'#b89668'} transparent opacity={.27+.28*build} depthWrite={false}/>
  </mesh>)}
 </group>;
}
