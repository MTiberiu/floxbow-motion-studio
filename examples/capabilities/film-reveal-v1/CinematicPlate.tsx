import {useMemo} from 'react';
import filmValley from '../assets/film-valley.png';

/**
 * The illustrated world lives inside JourneyWorld's EXISTING reveal mask.
 * Image is a project-local asset: assets/film-valley.png.
 * Time-driven parallax, water shimmer, haze and micro-light only.
 * No browser clock, randomness per frame, or network image.
 */
export function CinematicPlate({time}:{time:number}){
 const glints=useMemo(()=>Array.from({length:160},(_,i)=>{
   const f=(n:number)=>{const v=Math.sin(n*193.71+13.6)*47123.123;return v-Math.floor(v);};
   return {x:75+f(i*11)*750,y:680+f(i*19+4)*255,r:.6+f(i*3+7)*2.2,p:f(i*7+2)*6.283,phase:f(i*17+9)};
 }),[]);
 const drift=Math.sin(time*.15)*8;
 const bridgeLights=useMemo(()=>Array.from({length:18},(_,i)=>({
   x:320+i*25.4,y:474-8*Math.sin(i/17*Math.PI),
   phase:i*1.7,scale:.7+(i%3)*.2,
 })),[]);
 const fog=useMemo(()=>Array.from({length:6},(_,i)=>({
   y:410+i*58,x:70+i*128,width:290+i*35,delay:i*1.2
 })),[]);
 const image=filmValley;
 return <div aria-hidden="true" style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:20}}>
   <img src={image} style={{position:'absolute',width:'100%',height:'100%',objectFit:'fill',maxWidth:'none',
     transform:`translate3d(${drift}px,${Math.sin(time*.12)*2}px,0) scale(1.018)`,
     filter:'contrast(1.08) saturate(1.05)',transformOrigin:'42% 62%'}}/>
   {/* Valley atmosphere and intermittent bridge illumination. */}
   <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
     style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'screen'}}>
     <defs>
       <radialGradient id="cinemaValleyFog"><stop stopColor="#c7e7eb" stopOpacity=".25"/><stop offset=".55" stopColor="#bad8df" stopOpacity=".10"/><stop offset="1" stopColor="#b7d6df" stopOpacity="0"/></radialGradient>
       <radialGradient id="bridgeLightGlow"><stop stopColor="#fff7ce" stopOpacity=".75"/><stop offset=".24" stopColor="#f8c37d" stopOpacity=".28"/><stop offset="1" stopColor="#edb86b" stopOpacity="0"/></radialGradient>
     </defs>
     {fog.map((p,i)=><ellipse key={i}
       cx={p.x+Math.sin(time*.11+p.delay)*45+time*1.5}
       cy={p.y+Math.sin(time*.17+p.delay)*7} rx={p.width} ry={39+i*5}
       fill="url(#cinemaValleyFog)" opacity={.55+.19*Math.sin(time*.23+p.delay)}/>)}
     {bridgeLights.map((p,i)=>{
       const glow=.35+.65*Math.pow(Math.max(0,Math.sin(time*.76+p.phase)),2);
       return <g key={i}>
         <circle cx={p.x} cy={p.y} r={10*p.scale} fill="url(#bridgeLightGlow)" opacity={glow}/>
         <circle cx={p.x} cy={p.y} r={.7*p.scale} fill="#ffe4ad" opacity={.4+.5*glow}/>
       </g>;
     })}
   </svg>
   {/* Glints remain physically anchored to the illustrated lake, not the entire image. */}
   <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
     style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'screen'}}>
     <defs><linearGradient id="cinemaWaterGlint"><stop stopColor="#f8bd75"/><stop offset=".5" stopColor="#fff1c5"/><stop offset="1" stopColor="#6ccbcc"/></linearGradient></defs>
     {glints.map((g,i)=>{
       const bright=Math.pow(Math.max(0,Math.sin(time*(.9+g.phase*.4)+g.p)),4);
       const x=g.x+Math.sin(time*.33+g.p)*3;
       return <path key={i} d={`M${x-g.r*3} ${g.y}h${g.r*6}`}
         stroke="url(#cinemaWaterGlint)" strokeWidth={.5+bright*1.3}
         opacity={bright*.68}/>;
     })}
     {Array.from({length:4},(_,i)=> <path key={i}
       d={`M 20 ${590+i*55} Q ${240+i*17} ${581+i*55+Math.sin(time*.38+i)*6} 755 ${600+i*54}`}
       fill="none" stroke="#e9a66b" strokeWidth="1" opacity={.04+.03*Math.sin(time*.4+i)}/>)}
   </svg>
   <div style={{position:'absolute',inset:0,
    background:`radial-gradient(ellipse 50% 21% at ${45+Math.sin(time*.12)*2}% 60%,rgba(255,214,159,.075),transparent 80%)`,
    mixBlendMode:'screen'}}/>
 </div>;
}
