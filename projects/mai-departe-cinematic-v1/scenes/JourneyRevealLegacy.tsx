import {JourneyWorld} from './JourneyWorldLegacy';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import type {EditableComponent} from '@motion/sdk/editor';
import type {TimelineClip} from '@motion/sdk/timeline';
import guides from '../motion-guides.json';
const colors=['#db884e','#aa64d5','#399cbd'];
const keys=['phraseEmotional','vocalProsody','wordGravity'] as const;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const seed=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
function value(t:number,k:typeof keys[number]){const p=clamp(t/guides.sampleStepSeconds,0,guides.samples.length-1),i=Math.floor(p),a=guides.samples[i],b=guides.samples[Math.min(i+1,guides.samples.length-1)];return a[k]+(b[k]-a[k])*(p-i)}
export function JourneyRevealLegacy({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {fps}=useVideoConfig();const t=frame/fps+Number(clip.props.offsetSeconds??30);const horizon=Number(clip.props.horizon??55),speed=1920/horizon,cx=1000;
 const gain=Number(clip.props.gain??.92),density=Math.round(Number(clip.props.particles??70));
 const scales=[32,50,46];const tail=240;const revealX=cx-tail;
 const y=(time:number,k:number)=>450-value(time,keys[k])*scales[k]*gain;
 const px=(sec:number)=>cx+(sec-t)*speed;
 const offset=t*speed;
 const mountain=(layer:number)=>{const points=[];for(let x=-180;x<=2120;x+=35){const world=x+offset*(.45+layer*.22);const h=Math.pow(.5+.5*Math.sin(world*.006+layer*3),2)*190+Math.pow(.5+.5*Math.sin(world*.015+2),2)*55;points.push(`${x},${530+layer*75-h}`)}return `M-180 810 L${points.join(' L')} L2120 810 Z`};
 const river=Array.from({length:65},(_,i)=>{const x=i*32;return `${x},${700+Math.sin((x+offset)*.006)*25}`}).join(' L');
 return <AbsoluteFill style={{background:'#fff'}} data-journey-time={t}>
 <svg viewBox="0 0 1920 1080" style={{width:'100%',height:'100%'}}>
  <defs>
   <clipPath id="futureRoad"><rect x={revealX} y="90" width={1920-revealX} height="705"/></clipPath>
   <linearGradient id="reveal"><stop offset="0" stopColor="white"/><stop offset=".75" stopColor="white"/><stop offset="1" stopColor="black"/></linearGradient>
   <mask id="past"><rect x="0" y="90" width={revealX} height="705" fill="url(#reveal)"/>{keys.map((_,k)=><ellipse key={k} cx={revealX-105} cy={y(t,k)} rx="170" ry="110" fill="url(#sprayReveal)"/>)}</mask>
   <radialGradient id="sprayReveal"><stop stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient>
   <linearGradient id="sky" x2="0" y2="1"><stop stopColor="#d4eef0"/><stop offset="1" stopColor="#fff9e9"/></linearGradient>
   <linearGradient id="water" x2="0" y2="1"><stop stopColor="#60c2c9"/><stop offset="1" stopColor="#276e9c"/></linearGradient>
   <clipPath id="waterClip"><path d={`M0 700 L${river} L1920 795 L0 795 Z`}/></clipPath>
   {colors.map((c,k)=><radialGradient key={k} id={`orb${k}`} cx="30%" cy="25%"><stop stopColor="white"/><stop offset=".3" stopColor={c}/><stop offset="1" stopColor={['#8d4427','#582a87','#17596e'][k]}/></radialGradient>)}
  </defs>
  <g stroke="#d5dce0" strokeWidth="1" opacity=".55">{Array.from({length:22},(_,i)=>{const x=i*100-offset%100;return <path key={i} d={`M${x} 90 V795`}/>})}{Array.from({length:8},(_,i)=><path key={i} d={`M0 ${95+i*100} H1920`}/>)}</g>
  <g mask="url(#past)"><JourneyWorld time={t} speed={speed}/></g>
  {keys.map((_,k)=>{const points=[];for(let x=0;x<=1920;x+=7){const st=clamp(t+(x-cx)/speed,0,guides.durationSeconds);points.push(`${x} ${y(st,k)}`)}const d=`M${points.join(' L')}`; return <path key={k} clipPath="url(#futureRoad)" d={d} stroke={colors[k]} strokeWidth="3" fill="none" opacity=".22"/>})}
  {keys.map((_,k)=><g key={k}>{Array.from({length:density},(_,i)=>{const life=1.8+seed(i+100*k)*1.2;const age=(t+seed(i+k*300)*life)%life;const birth=Math.max(0,t-age);const travel=age*(85+seed(i+400)*115);const sy=y(birth,k)+(seed(i+500*k)-.5)*age*140;return <circle key={i} cx={cx-travel} cy={sy} r={1+seed(i+70)*3.4} fill={colors[k]} opacity={(1-age/life)*.65}/>})}<circle cx={cx} cy={y(t,k)} r="25" fill="#f8fafb" stroke="#253642" strokeWidth="1.5"/><circle cx={cx} cy={y(t,k)} r="18" fill="none" stroke={colors[k]} strokeWidth="3"/><circle cx={cx} cy={y(t,k)} r="5" fill="#253642"/><path d={`M${cx-32} ${y(t,k)} h9 M${cx+23} ${y(t,k)} h9 M${cx} ${y(t,k)-32} v9 M${cx} ${y(t,k)+23} v9`} stroke="#253642" strokeWidth="1.5"/></g>)}
  <path d="M0 80 H1920 M0 805 H1920" stroke="#c7ced2" strokeWidth="2"/>
  {Array.from({length:35},(_,i)=>{const x=i*60-offset%60;return <g key={i} fill="#d3d9dc"><rect x={x} y="50" width="25" height="14" rx="3"/><rect x={x} y="820" width="25" height="14" rx="3"/></g>})}
 </svg>
 </AbsoluteFill>;
}
export const journeyRevealLegacyModule:EditableComponent={id:'director-journey-reveal-legacy',name:'Director · Preserved journey prototype',fields:[{key:'horizon',target:'props',label:'Visible road (seconds)',type:'number',default:55,min:20,max:100,step:5},{key:'gain',target:'props',label:'Curve amplitude',type:'number',default:.92,min:.3,max:1.6,step:.05},{key:'particles',target:'props',label:'Spray particles per sphere',type:'number',default:70,min:20,max:150,step:10},{key:'offsetSeconds',target:'props',label:'Source time offset',type:'number',default:30,min:30,max:240,step:1}],component:JourneyRevealLegacy};
