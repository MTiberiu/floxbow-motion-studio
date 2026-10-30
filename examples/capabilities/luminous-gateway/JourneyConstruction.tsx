import {useMemo} from 'react';
import * as THREE from 'three';

/** Project-local visual: wireframe becomes an inhabited valley.
 * Deterministic, time-indexed, no project media or Timeline changes.
 * Mounted inside the existing JourneyWorld ThreeCanvas and reveal mask.
 */
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const buildings=[
  {x:-790,y:-138,w:72,h:103,seed:0},
  {x:-676,y:-122,w:95,h:147,seed:1},
  {x:-550,y:-161,w:62,h:89,seed:2},
  {x:-438,y:-128,w:110,h:124,seed:3},
  {x:-303,y:-152,w:79,h:105,seed:4},
  {x:-185,y:-179,w:59,h:80,seed:5},
];
function House({time,x,y,w,h,seed}:{time:number;x:number;y:number;w:number;h:number;seed:number}){
  const enter=smooth((time-3.5-seed*1.15)/3.4);
  const material=smooth((time-8-seed*.95)/7);
  const roof=useMemo(()=>{
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w*.64,h*.08,0),
      new THREE.Vector3(0,h*.48,0),
      new THREE.Vector3(w*.64,h*.08,0)
    ]);
  },[w,h]);
  const edges=useMemo(()=>new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,22)),[w,h]);
  return <group position={[x,y,23]} scale={[1,Math.max(.001,enter),1]}>
    <mesh position={[0,h*.5,-2]} renderOrder={32}>
      <boxGeometry args={[w,h,22]}/>
      <meshBasicMaterial color={seed%2===0?'#28515d':'#41636a'} transparent opacity={material*.97} depthTest={false} depthWrite={false}/>
    </mesh>
    <lineSegments geometry={edges} position={[0,h*.5,3]} renderOrder={34}>
      <lineBasicMaterial color="#bbfff4" transparent opacity={enter*(.84-material*.48)} depthTest={false} depthWrite={false}/>
    </lineSegments>
    <line geometry={roof} position={[0,h,6]} renderOrder={36}>
      <lineBasicMaterial color="#bdfbf0" transparent opacity={enter*.92} depthTest={false} depthWrite={false}/>
    </line>
    <mesh position={[0,h+15,2]} renderOrder={33} rotation={[0,0,Math.PI/4]}>
      <planeGeometry args={[w*.48,w*.48]}/>
      <meshBasicMaterial color="#4c7580" transparent opacity={material*.96} side={THREE.DoubleSide} depthTest={false} depthWrite={false}/>
    </mesh>
    {[0,1,2].map(i=><mesh key={i} position={[-w*.28+i*w*.28,h*.63,13]} renderOrder={35}>
      <planeGeometry args={[w*.14,h*.16]}/>
      <meshBasicMaterial color="#ffdb94" transparent opacity={material*(.65+.2*Math.sin(time*.5+seed+i))} depthTest={false} depthWrite={false}/>
    </mesh>)}
  </group>;
}
function Bridge({time}:{time:number}){
 const build=smooth((time-11)/8);
 const geometry=useMemo(()=>{
  const a:THREE.Vector3[]=[];
  for(let i=0;i<=90;i++){
    const t=i/90, x=-1020+1150*t;
    a.push(new THREE.Vector3(x,-190+48*Math.sin(Math.PI*t),0));
  }
  return new THREE.BufferGeometry().setFromPoints(a);
 },[]);
 return <group position={[0,0,33]}>
   <line geometry={geometry} renderOrder={49}>
     <lineBasicMaterial color="#b9fbeb" transparent opacity={build*.9} depthTest={false} depthWrite={false}/>
   </line>
   {Array.from({length:13},(_,i)=>{
      const t=i/12, x=-1020+1150*t,y=-190+48*Math.sin(Math.PI*t);
      return <mesh key={i} position={[x,y-20,0]} renderOrder={48} scale={[1,build,1]}>
        <planeGeometry args={[2,40]}/>
        <meshBasicMaterial color="#8dc9c6" transparent opacity={build*.62} depthTest={false} depthWrite={false}/>
      </mesh>;
   })}
 </group>;
}
export function JourneyConstruction({time}:{time:number}){
 const pulse=(Math.sin(time*2.4)+1)*.5;
 const arrived=smooth((time-3)/5);
 return <group>
   <Bridge time={time}/>
   {buildings.map(b=><House key={b.seed} {...b} time={time}/>)}
   <mesh position={[-505,-79,18]} renderOrder={60}>
    <sphereGeometry args={[13+pulse*4,24,16]}/>
    <meshBasicMaterial color="#e6fff1" transparent opacity={arrived*.75} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending}/>
   </mesh>
   <mesh position={[-505,-79,17]} renderOrder={59}>
    <sphereGeometry args={[35+pulse*10,24,16]}/>
    <meshBasicMaterial color="#6fe6d1" transparent opacity={arrived*.13} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending}/>
   </mesh>
 </group>;
}
