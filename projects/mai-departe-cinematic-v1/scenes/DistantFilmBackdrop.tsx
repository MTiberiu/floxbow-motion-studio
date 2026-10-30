import {useMemo} from 'react';
import * as THREE from 'three';

/**
 * A distant film surface behind the physical ridges, not a foreground HUD.
 * This film is intentionally dim: it reads as a memory of the path system.
 * All movement is derived from composition time, compatible with seek/render.
 */
const palette=['#aa7148','#7e609c','#4b8494'];
function FilmRoute({index,time}:{index:number;time:number}){
 const geometry=useMemo(()=>{
  const points:THREE.Vector3[]=[];
  for(let i=0;i<=160;i++){
   const x=-35+i*70/160;
   const y=4.7-index*.8+Math.sin(x*.21+index*1.5)*.27+Math.sin(x*.52+index)*.08;
   points.push(new THREE.Vector3(x,y,0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
 },[index]);
 return <line geometry={geometry} position={[-(time*1.9%8),0,.12]}>
  <lineBasicMaterial color={palette[index]} transparent opacity={.37} depthWrite={false}/>
 </line>;
}
export function DistantFilmBackdrop({time}:{time:number}){
 // Show in the world exploration, not while the camera is still outside the film.
 const fade=Math.max(0,Math.min(1,(time-14)/3))*
  (1-Math.max(0,Math.min(1,(time-22)/2)));
 const slots=useMemo(()=>Array.from({length:41},(_,i)=>i),[]);
 return <group position={[0,9,-34]} visible={fade>.001}>
  <mesh>
   <planeGeometry args={[82,22]}/>
   <meshBasicMaterial color="#171515" transparent opacity={.72*fade} depthWrite={false} side={THREE.DoubleSide}/>
  </mesh>
  {/* Perforations embedded in the distant surface, not UI rectangles. */}
  {slots.map(i=><group key={i} position={[-40+i*2-(time*.4%2),0,.1]}>
   <mesh position={[0,9.75,0]}><planeGeometry args={[.86,.64]}/><meshBasicMaterial color="#8f6a4a" transparent opacity={.53*fade} depthWrite={false}/></mesh>
   <mesh position={[0,-9.75,0]}><planeGeometry args={[.86,.64]}/><meshBasicMaterial color="#8f6a4a" transparent opacity={.53*fade} depthWrite={false}/></mesh>
  </group>)}
  <group position={[0,-2,.15]}>
   {[0,1,2].map(i=><group key={i}><FilmRoute index={i} time={time}/></group>)}
  </group>
 </group>;
}
