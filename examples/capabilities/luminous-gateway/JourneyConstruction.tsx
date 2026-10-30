import {useMemo} from 'react';
import * as THREE from 'three';

/**
 * Journey Construction v2 — The Crossing.
 * The light draws a passage through the valley: contour filaments, an arched
 * bridge, and a moving construction wave. No houses or flat facade sprites.
 * Frame-addressable, deterministic, project-local, no audio/timeline changes.
 */
const sat=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=sat(v);return t*t*(3-2*t);};
const wave=(x:number,t:number)=>Math.sin(x*.021+t*.6)*.5+Math.sin(x*.049-t*.25)*.25;
function seeded(i:number){const s=Math.sin(i*127.1+78.3)*43758.5453;return s-Math.floor(s);}
function Curve({points,color,opacity=1,width=1,order=31}:{
 points:THREE.Vector3[];color:string;opacity?:number;width?:number;order?:number;
}){
 const g=useMemo(()=>new THREE.BufferGeometry().setFromPoints(points),[points]);
 return <line geometry={g} renderOrder={order}>
   <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={width}
     depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending}/>
 </line>;
}
const deckY=(x:number)=>-224+52*Math.sin(Math.PI*sat((x+1060)/1240));
const PATH_X0=-1060, PATH_X1=180;
const deck=Array.from({length:125},(_,i)=>{
 const x=PATH_X0+(PATH_X1-PATH_X0)*i/124;
 return new THREE.Vector3(x,deckY(x),0);
});
function LuminousBridge({time}:{time:number}){
 const draw=ease((time-5.4)/11.5);
 const solid=ease((time-12.5)/10);
 const active=Math.max(2,Math.floor(124*draw));
 const live=deck.slice(0,active);
 const ribs=Array.from({length:25},(_,i)=>{
   const x=PATH_X0+(PATH_X1-PATH_X0)*i/24;
   const y=deckY(x);
   return {x,y,progress:sat((draw*26-i)/2)};
 });
 const supports=useMemo(()=>ribs.map(r=>[new THREE.Vector3(r.x,r.y,0),new THREE.Vector3(r.x,r.y-62,0)]),[]);
 return <group position={[0,0,40]}>
   <Curve points={live} color="#eafff8" opacity={.68+solid*.27} order={71}/>
   <Curve points={live.map(p=>new THREE.Vector3(p.x,p.y-6,0))} color="#45d6dc" opacity={.5+solid*.25} order={70}/>
   {supports.map((line,i)=><Curve key={i} points={line} color="#88e6dd"
     opacity={ribs[i].progress*(.24+solid*.36)} order={69}/>)}
   {ribs.map((r,i)=>i%2===0?<mesh key={i} position={[r.x,r.y-4,0]} renderOrder={73}>
     <sphereGeometry args={[1.6+solid*.8,7,6]}/>
     <meshBasicMaterial color="#e7ffec" transparent opacity={r.progress*.8}
       depthTest={false} depthWrite={false}/>
   </mesh>:null)}
   <mesh position={[PATH_X0+(PATH_X1-PATH_X0)*draw,deckY(PATH_X0+(PATH_X1-PATH_X0)*draw),7]} renderOrder={79}>
     <sphereGeometry args={[5+Math.sin(time*3)*1.3,14,10]}/>
     <meshBasicMaterial color="#fff2cd" transparent opacity={draw<.99?.9:.18}
       blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false}/>
   </mesh>
 </group>;
}
function ContourTerrain({time}:{time:number}){
 const lines=useMemo(()=>{
   const output:THREE.Vector3[][]=[];
   for(let layer=0;layer<14;layer++){
     const coords:THREE.Vector3[]=[];
     for(let i=0;i<=155;i++){
       const x=-1200+i*9.5;
       const peakA=210*Math.exp(-Math.pow((x+850)/230,2));
       const peakB=310*Math.exp(-Math.pow((x+300)/165,2));
       const peakC=180*Math.exp(-Math.pow((x-180)/240,2));
       const mountain=Math.max(peakA,peakB,peakC);
       const y=-225+mountain*(.3+layer*.055)+wave(x,layer)*8+layer*5;
       coords.push(new THREE.Vector3(x,y,-layer*.4));
     }
     output.push(coords);
   }
   return output;
 },[]);
 const revealing=ease((time-1)/19);
 return <group position={[0,0,25]}>
   {lines.map((pts,i)=>{
     const count=Math.max(2,Math.floor(pts.length*sat(revealing*1.5-i*.022)));
     return <Curve key={i} points={pts.slice(0,count)}
        color={i%3===0?'#ddfff7':i%3===1?'#89dcda':'#5bb0c1'}
        opacity={(.10+i*.012)*ease((time-1-i*.30)/4)} order={36+i}/>;
   })}
 </group>;
}
function Fireflies({time}:{time:number}){
 const data=useMemo(()=>Array.from({length:150},(_,i)=>{
   const x=-1180+seeded(i*7)*1510;
   const y=-300+seeded(i*11+2)*430;
   return {x,y,s:seeded(i*5+4),phase:seeded(i*3+21)*6.28};
 }),[]);
 const lit=ease((time-4)/12);
 return <group position={[0,0,62]}>
   {data.map((p,i)=>{
     const x=p.x+Math.sin(time*.3+p.phase)*11;
     const y=p.y+Math.sin(time*.54+p.phase)*13;
     const blink=.42+.58*Math.pow(Math.sin(time*(.7+p.s)+p.phase)*.5+.5,2);
     return <mesh key={i} position={[x,y,0]} renderOrder={83}>
       <planeGeometry args={[1.2+p.s*2.2,1.2+p.s*2.2]}/>
       <meshBasicMaterial color={p.s>.6?'#f5e5c0':'#9deef3'} transparent opacity={lit*blink*.7}
         blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false}/>
     </mesh>;
   })}
 </group>;
}
export function JourneyConstruction({time}:{time:number}){
 return <group>
   <ContourTerrain time={time}/>
   <LuminousBridge time={time}/>
   <Fireflies time={time}/>
 </group>;
}
