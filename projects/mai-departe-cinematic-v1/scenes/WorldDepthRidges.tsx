import {useMemo} from 'react';
import * as THREE from 'three';

/**
 * Geometric silhouettes at distinct Z planes.
 * Purpose: provide real occlusion/parallax under the existing perspective rig,
 * beyond the flat valley PNG; mesh vertices form terrain outlines, not cropped
 * rectangular image bands. These are restrained mid-distance shapes and NOT a
 * substitute for the required bridge-free source artwork.
 */
function ridgeHeight(u:number,seed:number){
 const a=Math.sin(u*6.4+seed*1.9)*.35;
 const b=Math.sin(u*16.1-seed*2.2)*.17;
 const c=Math.sin(u*31.9+seed*3.4)*.06;
 return a+b+c;
}
function RidgeLayer({seed,z,base,height,span,color,opacity}:{seed:number;z:number;base:number;height:number;span:number;color:string;opacity:number}){
 const geometry=useMemo(()=>{
  const vertices:number[]=[];
  const indices:number[]=[];
  const divisions=120;
  for(let i=0;i<=divisions;i++){
   const u=i/divisions;
   const x=(u-.5)*span;
   const y=base+height*(.4+ridgeHeight(u,seed));
   vertices.push(x,y,0,x,base-15,0);
   if(i<divisions){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
 },[seed,base,height,span]);
 return <mesh geometry={geometry} position={[0,0,z]}>
  <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} toneMapped={false}/>
 </mesh>;
}
export function WorldDepthRidges({time}:{time:number}){
 return <group position={[Math.sin(time*.08)*.15,0,0]}>
  <RidgeLayer seed={1} z={-32} base={-3.9} height={4.3} span={86} color="#607b80" opacity={.56}/>
  <RidgeLayer seed={2} z={-23} base={-4.0} height={3.1} span={69} color="#425c62" opacity={.63}/>
  <RidgeLayer seed={3} z={-14} base={-3.7} height={2.1} span={50} color="#303e3f" opacity={.52}/>
 </group>;
}
