import {useMemo} from 'react';

/** DARK film atmosphere: deterministic, frame-derived, project-local.
 * A deliberately perceptible moving emulsion / light-leak treatment.
 * Subtitles remain outside this composition.
 */
const frac=(v:number)=>v-Math.floor(v);
const rand=(n:number)=>frac(Math.sin(n*127.1+31.7)*43758.5453);
const flecks=Array.from({length:220},(_,i)=>({
 x:rand(i*7+1)*1920,y:88+rand(i*19+2)*708,r:.45+rand(i*23+4)*1.7,
 speed:3+rand(i*11+3)*13,phase:rand(i*37+5)*6.283,
}));
const grain=Array.from({length:85},(_,i)=>({
 x:rand(i*13)*1920,y:90+rand(i*17+6)*700,w:1+rand(i*31)*6,
 phase:rand(i*29)*6.283,
}));
export function DarkFilmAtmosphere({time,intensity=1}:{time:number;intensity?:number}){
 const warmX=1180+Math.sin(time*.19)*240;
 const coldX=1450+Math.cos(time*.11)*220;
 const flicker=.95+.05*Math.sin(time*7.1);
 return <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"
  style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',mixBlendMode:'screen'}}>
  <defs>
   <clipPath id="dark-atmosphere-window"><rect x="0" y="85" width="1920" height="715"/></clipPath>
   <radialGradient id="dark-film-warm"><stop offset="0" stopColor="#d07d36" stopOpacity=".26"/><stop offset=".6" stopColor="#ad592e" stopOpacity=".09"/><stop offset="1" stopColor="#6e2919" stopOpacity="0"/></radialGradient>
   <radialGradient id="dark-film-cold"><stop offset="0" stopColor="#62b9c8" stopOpacity=".19"/><stop offset="1" stopColor="#317389" stopOpacity="0"/></radialGradient>
   <linearGradient id="dark-film-scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f9d394" stopOpacity="0"/><stop offset=".5" stopColor="#f9d394" stopOpacity=".18"/><stop offset="1" stopColor="#f9d394" stopOpacity="0"/></linearGradient>
  </defs>
  <g clipPath="url(#dark-atmosphere-window)" opacity={intensity*flicker}>
   <ellipse cx={warmX} cy={390+Math.sin(time*.13)*80} rx="650" ry="420" fill="url(#dark-film-warm)"/>
   <ellipse cx={coldX} cy={670+Math.sin(time*.17)*55} rx="490" ry="240" fill="url(#dark-film-cold)"/>
   <path d={`M${850+Math.sin(time*.07)*160} 90h160v710h-160z`} fill="url(#dark-film-scan)" opacity=".24"/>
   {flecks.map((p,i)=>{
    const x=((p.x-time*p.speed)%1940+1940)%1940;
    const twinkle=Math.pow(Math.max(0,Math.sin(time*(.32+p.speed*.02)+p.phase)),3);
    return <circle key={i} cx={x} cy={p.y+Math.sin(time*.24+p.phase)*7}
      r={p.r} fill={i%3===0?'#ffd29b':'#85b7b9'} opacity={.10+twinkle*.48}/>;
   })}
   {grain.map((p,i)=>{
    const x=((p.x-time*(2+i%4))%1950+1950)%1950;
    return <path key={i} d={`M${x} ${p.y} l${p.w} ${Math.sin(time*.16+p.phase)*5}`}
      stroke={i%3===0?'#f8ca87':'#a5a59a'} opacity={.08+.10*Math.pow(Math.max(0,Math.sin(time*.28+p.phase)),2)}
      strokeWidth=".65"/>;
   })}
  </g>
 </svg>;
}
