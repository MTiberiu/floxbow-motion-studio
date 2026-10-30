import {frontierX} from '../emulsion-field';
const seed=(i:number)=>{const x=Math.sin(i*127.1+31.7)*43758.5453;return x-Math.floor(x);};
/** All strands sample the existing arrival-field frontier: no independent entrance hole. */
export function RiftBoundary({time,speed,revealX,edge,intensity=0}:{time:number;speed:number;revealX:number;edge:string;intensity?:number}){
 const samples=Array.from({length:100},(_,i)=>{const y=82+i*718/99;return {x:frontierX(time,y,speed,revealX),y};});
 return <g pointerEvents="none">
  <defs><filter id="riftBloom" x="-100%" width="300%"><feGaussianBlur stdDeviation={5+intensity*5}/></filter></defs>
  <path d={edge} fill="none" stroke="#080b16" strokeWidth={10+intensity*8} opacity=".8" filter="url(#riftBloom)"/>
  <path d={edge} fill="none" stroke="#efbd76" strokeWidth={6+intensity*10} opacity={.24+intensity*.22} filter="url(#riftBloom)"/>
  {Array.from({length:14},(_,k)=>{
   const d='M'+samples.map((p,i)=>{
    const field=Math.sin(p.y*.009+time*.23+k*.7)*Math.sin(p.y*.023+k);
    const dx=(k-6.5)*(1.2+intensity*1.8)+(8+intensity*16)*field;
    return `${p.x+dx},${p.y}`;
   }).join(' L');
   return <path key={k} d={d} fill="none" stroke={k%3?'#ffd4a2':'#79bfcf'} strokeWidth={.35+seed(k)*.7} opacity={.1+seed(k+41)*.24+intensity*.12} strokeDasharray={`${35+seed(k)*110} ${10+seed(k+8)*70}`} strokeDashoffset={-time*(7+k)}/>;
  })}
  {Array.from({length:70},(_,i)=>{
   const age=(time*.3+seed(i))%1,y=84+seed(i+71)*714;
   const x=frontierX(time,y,speed,revealX)-(age*age)*(12+intensity*70);
   return <ellipse key={i} cx={x} cy={y+age*12} rx={.5+intensity*age*7} ry={.35+seed(i+5)} fill={i%3?'#ffd7a2':'#88cddd'} opacity={Math.sin(age*Math.PI)*.55}/>;
  })}
 </g>;
}
