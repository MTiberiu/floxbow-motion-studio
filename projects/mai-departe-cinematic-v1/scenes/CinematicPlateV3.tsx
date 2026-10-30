import {useMemo} from 'react';
import filmValley from '../assets/film-valley.png';

/**
 * Moving image on the already revealed film.
 * Conservative depth bands avoid artificial polygon cutouts until clean alpha
 * assets exist. Each band samples the SAME original image, then travels with
 * a different amount of virtual camera motion. Entire plate is still masked
 * upstream by the analytic emulsion frontier.
 */
const rand=(v:number)=>{const n=Math.sin(v*91.19+3.5)*43758.5453;return n-Math.floor(n);};
const bands=[
 {name:'sky',from:0,to:38,fadeIn:0,fadeOut:5,depth:.035,zoom:1.025},
 {name:'far-ridges',from:35,to:57,fadeIn:5,fadeOut:5,depth:.11,zoom:1.035},
 {name:'valley',from:54,to:70,fadeIn:5,fadeOut:5,depth:.26,zoom:1.045},
 {name:'water-and-near',from:67,to:100,fadeIn:5,fadeOut:0,depth:.55,zoom:1.062},
] as const;

function fadeMask(from:number,to:number,fadeIn:number,fadeOut:number){
 // Keep opacity at 1 within each band and use correct monotonic CSS stops.
 // Adjacent bands share a small overlap to prevent transparent seams.
 const lo=Math.max(0,from-fadeIn),hi=Math.min(100,to+fadeOut);
 return `linear-gradient(to bottom,transparent ${lo}%,#000 ${Math.max(lo,from)}%,#000 ${Math.min(hi,to)}%,transparent ${hi}%)`;
}

export function CinematicPlateV3({time}:{time:number}){
 const glints=useMemo(()=>Array.from({length:132},(_,i)=>({
  x:70+rand(i*11+2)*890,y:650+rand(i*19+3)*280,
  r:.6+rand(i*31+6)*2.3,phase:rand(i*7+3)*6.28
 })),[]);
 return <div aria-hidden="true" data-cinematic-parallax-v3="1"
  style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:20,background:'#172a30'}}>
  {bands.map((l,i)=>{
   const forward=time*(3.6+l.depth*24);
   const sway=Math.sin(time*.13+i*.65)*(.8+l.depth*6);
   const zoom=l.zoom+Math.min(.016,time*.0007*l.depth);
   const mask=fadeMask(l.from,l.to,l.fadeIn,l.fadeOut);
   return <div key={l.name} data-world-layer={l.name} style={{
    position:'absolute',inset:0,overflow:'hidden',maskImage:mask,WebkitMaskImage:mask
   }}>
    <img src={filmValley} style={{position:'absolute',width:'112%',height:'112%',left:'-6%',top:'-6%',
     maxWidth:'none',objectFit:'fill',transformOrigin:'42% 58%',
     transform:`translate3d(${-forward+sway}px,${Math.sin(time*.11+i)*l.depth*5}px,0) scale(${zoom})`,
     filter:`contrast(1.06) saturate(${.94+i*.01})`}}/>
   </div>;
  })}
  {/* The old illustration contains a baked bridge. Do not draw a second 2D bridge.
      Real 3D luminous construction is in CameraWorld; cleaning the source
      artwork is still required before the painted bridge can disappear. */}
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'screen'}}>
   <defs>
    <radialGradient id="worldV3Fog"><stop stopColor="#d6ddcf" stopOpacity=".17"/><stop offset="1" stopColor="#b5c5c1" stopOpacity="0"/></radialGradient>
    <linearGradient id="worldV3Water"><stop stopColor="#d2c6a8" stopOpacity="0"/><stop offset=".5" stopColor="#f5dab2" stopOpacity=".64"/><stop offset="1" stopColor="#b6c9cf" stopOpacity="0"/></linearGradient>
   </defs>
   {Array.from({length:8},(_,i)=><ellipse key={i}
    cx={350+i*218-time*(2.4+i*.38)} cy={390+i*43+Math.sin(time*.15+i)*7}
    rx={260+i*12} ry={33+i*6} fill="url(#worldV3Fog)" opacity={.62}/>)}
   {glints.map((g,i)=>{
    const pulse=Math.pow(Math.max(0,Math.sin(time*(.6+rand(i*3)*.3)+g.phase)),5);
    const x=g.x-time*2.7+Math.sin(time*.25+g.phase)*2;
    return <path key={i} d={`M${x} ${g.y}h${g.r*8}`}
     stroke="url(#worldV3Water)" strokeWidth={.5+pulse*1.2} opacity={pulse*.54}/>;
   })}
  </svg>
 </div>;
}
