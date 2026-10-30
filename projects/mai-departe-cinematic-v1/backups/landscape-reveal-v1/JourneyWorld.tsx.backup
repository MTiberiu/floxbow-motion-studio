import rockTexture from '../assets/journey-fjord-material-study.png';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(a:number,b:number,v:number)=>{const u=clamp((v-a)/(b-a));return u*u*(3-2*u)};
const noise=(x:number)=>Math.sin(x*.0051)*.48+Math.sin(x*.0137+2)*.27+Math.sin(x*.0391+5)*.16+Math.sin(x*.087)*.09;
// Terrain is sampled in traveled-world coordinates, so authored regions stay behind
// the playhead after they have been painted instead of changing with the camera.
function ecology(sec:number){return smooth(48,82,sec)*(1-.7*smooth(98,112,sec))+.65*smooth(129,153,sec)}
export function JourneyWorld({time,speed}:{time:number;speed:number}){
 const travel=time*speed;
 const ridge=(layer:number)=>{let d='M-100 810';for(let x=-100;x<=2050;x+=12){const world=x+travel*(.5+layer*.19),sec=(x+travel-1000)/speed;const life=ecology(sec);const peak=Math.abs(noise(world+layer*530));const height=120+peak*(230-life*85);d+=` L${x} ${630+layer*48-height}`;}return d+' L2050 810 Z'};
 const waterY=(x:number)=>665+noise(x+travel)*22;
 const water='M-100 820 '+Array.from({length:109},(_,i)=>{const x=-100+i*20;return `L${x} ${waterY(x)}`}).join(' ')+' L2060 820 Z';
 const nowLife=clamp(ecology(time-15));
 return <g data-world-stage={time<55?'stone-and-current':time<98?'opening-valley':time<130?'fracture':'return-of-life'}>
 <defs>
  <linearGradient id="worldAtmosphere" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e5eef0"/><stop offset=".65" stopColor="#c2d1d4"/><stop offset="1" stopColor="#f3e5cc"/></linearGradient>
  <linearGradient id="worldWater" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#517f88"/><stop offset=".25" stopColor="#235766"/><stop offset="1" stopColor="#0c2f43"/></linearGradient>
  {[0,1,2].map(i=><pattern key={i} id={`stone${i}`} width="2304" height="1536" patternUnits="userSpaceOnUse" patternTransform={`translate(${-travel*(.5+i*.19)} ${-80-i*90})`}><image href={rockTexture} width="2304" height="1536" preserveAspectRatio="xMidYMid slice"/></pattern>)}
  <clipPath id="livingWater"><path d={water}/></clipPath>
  <filter id="mistBlur"><feGaussianBlur stdDeviation="18"/></filter>
  <linearGradient id="stoneShade" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#aac5d0" stopOpacity=".16"/><stop offset="1" stopColor="#081c27" stopOpacity=".65"/></linearGradient>
 </defs>
 <rect y="90" width="1920" height="705" fill="url(#worldAtmosphere)"/>
 {[0,1,2].map(i=><g key={i}><path d={ridge(i)} fill={`url(#stone${i})`}/><path d={ridge(i)} fill={i===0?'#b4c9ce':'url(#stoneShade)'} opacity={i===0?.45:.5}/><path d={ridge(i)} fill="none" stroke={i===0?'#e8edf0':'#556c6d'} strokeWidth={i===0?2:1} opacity=".65"/></g>)}
 {/* Narrow waterfalls anchored to the moving rock, each with a separate flow. */}
 {Array.from({length:10},(_,i)=>{const world=i*337,x=((world-travel*.88)%2500+2500)%2500-200;const start=410+Math.sin(i*4)*60;return <g key={i} opacity={.3+nowLife*.35}><path d={`M${x} ${start} q-12 45 4 80 t-5 100`} stroke="#c7e2df" strokeWidth="3" fill="none"/><path d={`M${x} ${start} q-12 45 4 80 t-5 100`} stroke="#f4ffff" strokeWidth="1.5" strokeDasharray="5 22" strokeDashoffset={-time*34} fill="none"/></g>})}
 {/* Atmospheric bands travel independently of terrain, without moving the road. */}
 <g filter="url(#mistBlur)" opacity=".26">{[0,1,2].map(i=><ellipse key={i} cx={370+i*490-Math.sin(time*.1+i)*160} cy={420+i*50} rx={310} ry="18" fill="#e8f2ef"/>)}</g>
 <path d={water} fill="url(#worldWater)"/>
 <g clipPath="url(#livingWater)">
 {Array.from({length:75},(_,i)=>{const yy=665+i*1.8;const start=(i*173-travel*.9+time*5)%2100;return <path key={i} d={`M${start} ${yy} q40 ${Math.sin(time*1.5+i)*3} 90 0 t110 0`} fill="none" stroke={i%3?'#b9d5ce':'#c6aa7a'} strokeWidth={i%4===0?2:.8} opacity={.08+(i%5)*.025}/>})}
 {Array.from({length:11},(_,i)=>{const x=((i*207-travel+time*(i%2?18:-14))%2200+2200)%2200-100,yy=726+(i%4)*15+Math.sin(time+i)*6;return <g key={i} opacity={nowLife*.65} fill="#071f2d" transform={`translate(${x} ${yy}) scale(${i%2?1:-1} 1)`}><path d={`M18 0 Q0 -7 -12 0 L${-24+Math.sin(time*6+i)*3} -6 L-21 6 L-12 0 Q0 7 18 0`}/></g>})}
 </g>
 {/* Fine near-bank growth emerges only in the fertile traveled regions. */}
 {Array.from({length:70},(_,i)=>{const world=i*43,x=((world-travel)%3000+3000)%3000-80,life=clamp(ecology((x+travel-1000)/speed));const yy=waterY(x)-4,h=15+(Math.sin(i*13)*.5+.5)*40;return <g key={i} opacity={life*.65} stroke="#183d39" strokeWidth="1.4"><path d={`M${x} ${yy} q${Math.sin(time*.5+i)*4} -${h/2} 1 -${h} M${x} ${yy-10} l-5 -9 M${x+1} ${yy-17} l5 -8`} fill="none"/></g>})}
 {Array.from({length:5},(_,i)=>{const x=((i*327-travel*.6+time*13)%2200+2200)%2200-100,yy=245+i*21+Math.sin(time*.7+i)*7,w=7+Math.sin(time*4+i)*5;return <path key={i} d={`M${x-12} ${yy-w} Q${x-4} ${yy-1} ${x} ${yy} Q${x+4} ${yy-1} ${x+12} ${yy-w}`} stroke="#203a45" strokeWidth="1.6" fill="none" opacity={nowLife*.75}/>})}
 </g>;
}
