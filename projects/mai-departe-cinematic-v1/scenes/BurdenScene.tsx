import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import type { EditableComponent } from '@motion/sdk/editor';
import type { TimelineClip } from '@motion/sdk/timeline';
import idle from '../assets/actors/phone-hesitate-v2.png';
import rise from '../assets/actors/burden-rise-v3.png';
import write from '../assets/actors/burden-write-v3.png';
import gather from '../assets/actors/burden-gather-v3.png';
import answer from '../assets/actors/burden-answer-v3.png';
import silent from '../assets/actors/burden-silent-v3.png';
import lower from '../assets/actors/burden-lower-v3.png';
import walking from '../assets/actors/walking.png';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const p=clamp(x);return p*p*(3-2*p)};
const move=(t:number,a:number,b:number)=>ease((t-a)/(b-a));
const modes=['hesitation','step','promise','bills','cannot-call','answer','silence','consent','lost-time'];
const assets:Record<string,string>={idle,rise,write,gather,answer,silent,lower,walking};
function Paper({x,y,angle=0,opacity=1}:{x:number;y:number;angle?:number;opacity?:number}){return <g transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacity}><rect width="124" height="156" rx="3" fill="#fff" stroke="#9da7b1" strokeWidth="2"/><path d="M16 27 H105 M16 42 H86 M16 64 H105 M16 79 H99 M16 94 H105 M16 124 H70" stroke="#aeb6bd" strokeWidth="3"/><rect x="84" y="119" width="22" height="17" fill="#b76750" opacity=".65"/></g>}
function Phone({x,y,angle=0}:{x:number;y:number;angle?:number}){return <g transform={`translate(${x} ${y}) rotate(${angle})`}><rect width="124" height="225" rx="18" fill="#202a33"/><rect x="7" y="12" width="110" height="196" rx="12" fill="#526473"/><path d="M48 14 H77" stroke="#111b24" strokeWidth="5"/><circle cx="62" cy="165" r="19" fill="#d39b67"/><path d="M52 161 Q62 153 72 161" fill="none" stroke="white" strokeWidth="5"/></g>}
export function BurdenScene({clip,frame=0}:{clip:TimelineClip;frame?:number}){
 const {fps}=useVideoConfig();const t=frame/fps; const duration=clip.durationInFrames/fps;
 const mode=String(clip.props.action??'hesitation'); const strength=Number(clip.props.lightStrength??0.16);
 const marks=(clip.props.wordMarks??{}) as Record<string,number>;
 const silenceAt=Number(clip.props.silenceAt??2.45);
 let key='idle'; let previous='idle';let switchAt=0;
 if(mode==='hesitation'){key=t<1.2?'idle':t<3?'rise':'idle';previous=t<3?'idle':'rise';switchAt=t<3?1.2:3;}
 if(mode==='step')key='walking';
 if(mode==='promise')key='write';
 if(mode==='bills')key='gather';
 if(mode==='answer'){switchAt=marks['prefac']??1.258; key=t<switchAt?'lower':'answer';previous='lower';}
 if(mode==='silence'){switchAt=t<silenceAt?(marks['apoi']??0.934):silenceAt;key=t<(marks['apoi']??0.934)?'answer':t<silenceAt?'silent':'lower';previous=t<silenceAt?'answer':'silent';}
 if(mode==='consent')key='gather';
 if(mode==='lost-time')key='lower';
 const blend=move(t,switchAt,switchAt+0.16);
 const insert=mode==='promise'||mode==='consent';
 const actorX=insert?70:mode==='step'?20+move(t,0.8,3)*13:mode==='lost-time'?27:50;
 const actorW=insert?46:mode==='lost-time'?52:mode==='step'?32:62;
 const actorH=insert?58:70;
 const imageStyle={position:'absolute' as const,left:`${actorX}%`,top:insert?'13%':'3%',width:`${actorW}%`,height:`${actorH}%`,objectFit:'contain' as const,transform:'translateX(-50%)'};
 const events=(clip.props.paperEvents??[]) as number[];
 return <AbsoluteFill data-burden-action={mode} style={{background:'#fff'}}>
  <div style={{display:'none'}}>{Object.values(assets).map(src=><Img key={src} src={src}/>)}</div>
  <div style={{position:'absolute',left:'9%',top:'65%',width:mode==='lost-time'?`${25+move(t,0,duration)*35}%`:'70%',height:4,background:'#8195aa',opacity:strength*0.55,transform:'skewX(-35deg)',transformOrigin:'left'}}/>
  {previous!==key&&blend<1&&<Img src={assets[previous]} style={imageStyle}/>}
  <Img src={assets[key]} style={{...imageStyle,opacity:previous===key?1:blend}}/>
  <svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
   {['cannot-call','answer','silence'].includes(mode)&&<g transform="translate(760 338) scale(.28 .12)">{[0,1,2].map(i=><Paper key={i} x={i*6} y={-156-i*4} angle={i*3-3}/>)}</g>}
   {mode==='step'&&<g>{[0,1,2].map(i=><g key={i} opacity={0.2*move(t,0.6+i*0.8,1+i*0.8)} transform={`translate(${680+i*160} 705)`}><ellipse rx="44" ry="10" fill="#b98b60"/><path d="M-22 0 H24" stroke="#a2744d" strokeWidth="3"/></g>)}<path d={`M655 710 H${655+460*move(t,0.7,3.5)}`} stroke="#cb9865" strokeWidth="2"/></g>}
   {mode==='promise'&&<g transform="translate(190 190)"><rect x="0" y="0" width="580" height="450" rx="8" fill="#fdfcfa" stroke="#a5adb3" strokeWidth="3"/><path d="M290 10 V440" stroke="#bbc1c6" strokeWidth="2"/>{[0,1,2,3,4].map(i=><path key={i} d={`M330 ${80+i*55} H530 M40 ${80+i*55} H250`} stroke="#e0e4e7" strokeWidth="2"/>)}<path d="M45 80 Q80 58 110 80 T180 80" pathLength="1" strokeDasharray="1" strokeDashoffset={1-move(t,0.6,2.1)} stroke="#3f4b58" strokeWidth="4" fill="none"/><g transform={`translate(${45+135*move(t,.6,2.1)} ${80-28*move(t,2.4,2.9)}) rotate(-32)`}><path d="M0 0 L8 -120 L20 -120 L12 0 Z" fill="#33434f"/><path d="M0 0 L6 16 L12 0" fill="#bb9373"/></g></g>}
   {mode==='bills'&&Array.from({length:7},(_,i)=>{const start=events[i]??0.12+i*.22;const p=move(t,start,start+.85);const settle=move(t,2.2,3.1);return t<start?null:<Paper key={i} x={(640+i*70)*(1-settle)+(860+i*4)*settle+Math.sin(i*2+t*5)*22*(1-p)} y={-160+346*p-i*2} angle={(i%2?18:-16)*(1-p)+(i-3)*2*(1-settle)}/>;})}
   {mode==='cannot-call'&&<g transform="translate(1370 240)"><Phone x={0} y={0}/><path d="M-60 180 Q-95 155 -70 125" fill="none" stroke="#b5bdc5" strokeWidth="3" opacity={1-move(t,1.8,2.3)}/><circle cx={62} cy={165} r={25+move(t,0.4,1.2)*20} fill="none" stroke="#a9b5be" strokeWidth="2" opacity={0.5*(1-move(t,1.4,2.2))}/></g>}
   {mode==='answer'&&t<(marks['prefac']??1.258)&&<g opacity={1-move(t,.7,1.2)}><Phone x={1370+Math.sin(t*45)*5} y={240}/>{[0,1].map(i=><path key={i} d={`M${1510+i*16} 300 Q${1535+i*16} 340 ${1510+i*16} 380`} stroke="#c69261" fill="none" strokeWidth="3"/>)}</g>}
   {mode==='consent'&&<g><rect x="230" y="320" width="510" height="300" rx="5" fill="#fafafa" stroke="#c8cdd1"/>{[0,1,2,3].map(i=><Paper key={i} x={350+i*17} y={340-i*9} angle={i*3-6}/>)}<Paper x={840-400*move(t,marks['da']??.41,1.25)} y={120+190*move(t,.41,1.25)} angle={-12+12*move(t,.41,1.25)}/></g>}
   {mode==='lost-time'&&<g transform="translate(1370 350)"><circle r="145" fill="#fff" stroke="#b4bec7" strokeWidth="3"/>{Array.from({length:12},(_,i)=><path key={i} d="M0 -125 V-113" stroke="#aab4bd" strokeWidth="3" transform={`rotate(${i*30})`}/>)}<path d="M0 0 V-100" stroke="#7d8c9a" strokeWidth="4" transform={`rotate(${t*80})`}/><path d="M0 0 L55 -35" stroke="#536473" strokeWidth="6"/><circle r="7" fill="#ba8f66"/>{[0,1,2].map(i=><Paper key={i} x={-110+i*24} y={200-i*6} angle={i*4-5}/>)}</g>}
  </svg>
 </AbsoluteFill>;
}
export const burdenSceneModule:EditableComponent={id:'director-burden-scene',name:'Director · The burden / action',fields:[{key:'action',target:'props',label:'Story action',type:'select',default:'hesitation',options:modes},{key:'lightStrength',target:'props',label:'Shadow strength',type:'number',default:.16,min:0,max:.4,step:.01}],component:BurdenScene};
