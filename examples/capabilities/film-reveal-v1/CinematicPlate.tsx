import {useMemo} from 'react';
import {staticFile} from 'remotion';

/**
 * The illustrated world lives inside JourneyWorld's EXISTING reveal mask.
 * Image from project public assets: public/film-valley.png.
 * Time-driven parallax, water shimmer, haze and micro-light only.
 * No browser clock, randomness per frame, or network image.
 */
export function CinematicPlate({time}:{time:number}){
 const glints=useMemo(()=>Array.from({length:90},(_,i)=>{
   const f=(n:number)=>{const v=Math.sin(n*193.71+13.6)*47123.123;return v-Math.floor(v);};
   return {x:85+f(i*11)*720,y:576+f(i*19+4)*238,r:.6+f(i*3+7)*2.2,p:f(i*7+2)*6.283,phase:f(i*17+9)};
 }),[]);
 const drift=Math.sin(time*.15)*8;
 const image=staticFile('film-valley.png');
 return <div aria-hidden="true" style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:20}}>
   <img src={image} style={{position:'absolute',width:'100%',height:'100%',objectFit:'fill',maxWidth:'none',
     transform:`translate3d(${drift}px,${Math.sin(time*.12)*2}px,0) scale(1.018)`,
     filter:'contrast(1.08) saturate(1.05)',transformOrigin:'42% 62%'}}/>
   {/* Glints remain physically anchored to the illustrated lake, not the entire image. */}
   <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
     style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'screen'}}>
     <defs><linearGradient id="cinemaWaterGlint"><stop stopColor="#f8bd75"/><stop offset=".5" stopColor="#fff1c5"/><stop offset="1" stopColor="#6ccbcc"/></linearGradient></defs>
     {glints.map((g,i)=>{
       const bright=Math.pow(Math.max(0,Math.sin(time*(.9+g.phase*.4)+g.p)),4);
       const x=g.x+Math.sin(time*.33+g.p)*3;
       return <path key={i} d={`M${x-g.r*3} ${g.y}h${g.r*6}`}
         stroke="url(#cinemaWaterGlint)" strokeWidth={.5+bright*1.3}
         opacity={bright*.55}/>;
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
