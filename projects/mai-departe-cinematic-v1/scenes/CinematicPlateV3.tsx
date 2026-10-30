import {useMemo} from 'react';
import filmValley from '../assets/film-valley.png';

/** Practical world-on-film parallax, sharing timeline time with the camera.
 * Depth bands temporarily reuse the original art; textured alpha joins disguise
 * their boundaries until separated original assets are available.
 */
const rand=(v:number)=>{const n=Math.sin(v*91.19+3.5)*43758.5453;return n-Math.floor(n);};
export function CinematicPlateV3({time}:{time:number}){
 const layers=[
  {name:'sky',top:0,bottom:48,rate:.014,scale:1.045,opacity:1},
  {name:'mountains',top:27,bottom:77,rate:.10,scale:1.07,opacity:1},
  {name:'water',top:53,bottom:100,rate:.29,scale:1.085,opacity:1},
 ];
 const glints=useMemo(()=>Array.from({length:115},(_,i)=>({x:rand(i*11+2)*910,y:615+rand(i*19+3)*390,r:.4+rand(i*31+6)*2.1,phase:rand(i*7+3)*6.28})),[]);
 const foregroundDrift=-time*1.4;
 return <div aria-hidden="true" data-cinematic-parallax-v3="1"
  style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:20,background:'#172a30'}}>
  {layers.map((l,i)=>{
   const shift=-time*(4+l.rate*36)+Math.sin(time*.16+i)*4;
   const upper=l.top,lower=l.bottom;
   const fadeTop=i===0?0:7,fadeBottom=i===layers.length-1?0:9;
   const mask=`linear-gradient(to bottom,transparent 0%,transparent ${Math.max(0,upper-fadeTop)}%,black ${upper+fadeTop}%,black ${lower-fadeBottom}%,transparent ${Math.min(100,lower+fadeBottom)}%,transparent 100%)`;
   return <div key={l.name} data-world-layer={l.name} style={{
    position:'absolute',inset:0,overflow:'hidden',maskImage:mask,WebkitMaskImage:mask
   }}>
    <img src={filmValley} style={{position:'absolute',width:'108%',height:'108%',left:'-4%',top:'-4%',
     maxWidth:'none',objectFit:'fill',transformOrigin:'42% 58%',
     transform:`translate3d(${shift}px,${Math.sin(time*.12+i)*3}px,0) scale(${l.scale+Math.min(time*.00032,.008)})`,
     filter:`contrast(1.07) saturate(${.89+i*.03})`}}/>
   </div>;
  })}
  {/* Animated depth fog follows scene motion; not a stationary decorative screen. */}
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'screen'}}>
   <defs>
    <radialGradient id="worldV3Fog"><stop stopColor="#d6ddcf" stopOpacity=".18"/><stop offset="1" stopColor="#b5c5c1" stopOpacity="0"/></radialGradient>
    <linearGradient id="worldV3Water"><stop stopColor="#d2c6a8" stopOpacity="0"/><stop offset=".5" stopColor="#f5dab2" stopOpacity=".7"/><stop offset="1" stopColor="#b6c9cf" stopOpacity="0"/></linearGradient>
   </defs>
   {Array.from({length:7},(_,i)=><ellipse key={i} cx={330+i*225-time*(1.1+i*.16)} cy={375+i*50+Math.sin(time*.2+i)*9}
    rx={260+i*8} ry={38+i*7} fill="url(#worldV3Fog)" opacity={.65}/>)}
   {glints.map((g,i)=>{
    const pulse=Math.pow(Math.max(0,Math.sin(time*.67+g.phase)),5);
    return <path key={i} d={`M${g.x+foregroundDrift} ${g.y} h${g.r*8}`}
      stroke="url(#worldV3Water)" strokeWidth={.6+pulse} opacity={pulse*.58}/>;
   })}
  </svg>
 </div>;
}
