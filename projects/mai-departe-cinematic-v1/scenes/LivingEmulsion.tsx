import {frontierXForMask,frontierParticle} from './emulsion-field';
const fract=(n:number)=>n-Math.floor(n);
const noise=(n:number)=>fract(Math.sin(n*127.1+91.7)*43758.5453);

/** Rough physical emulsion: carbonized edge, paper fibres and pinholes.
 * No neon contours. The illuminated seam only glows through occasional thin gaps.
 */
export function LivingEmulsion({time,speed,revealX,edge}:{time:number;speed:number;revealX:number;edge:string}){
 return <g pointerEvents="none" data-living-emulsion="1">
  <path d={edge} fill="none" stroke="#100b08" strokeWidth={24} opacity={.88}/>
  <path d={edge} fill="none" stroke="#43271d" strokeWidth={17} opacity={.88}/>
  <path d={edge} fill="none" stroke="#79432a" strokeWidth={8} opacity={.56}/>
  <path d={edge} fill="none" stroke="#d69a62" strokeWidth={2.2} opacity={.34}/>
  {Array.from({length:190},(_,i)=>{
   const yy=84+noise(i*17+3)*712;
   const xx=frontierXForMask(time,yy,speed,revealX);
   const side=noise(i*19+6)>.42?-1:1;
   const distance=4+noise(i*29+2)*30;
   const x=xx+side*distance;
   const radius=.8+noise(i*31+7)*4.8;
   const flicker=.87+.13*Math.sin(time*.7+i);
   return <g key={i} opacity={flicker*(.25+noise(i*7)*.64)}>
    <ellipse cx={x} cy={yy} rx={radius*(.6+noise(i*43))} ry={radius*(.45+noise(i*53))} fill={side<0?'#1a100d':'#090706'} />
    {i%5===0&&<circle cx={xx-1+noise(i*61)*12} cy={yy} r={.35+noise(i*11)*1.25} fill="#e2a06a" opacity=".48"/>}
   </g>;
  })}
  {/* Tiny torn threads and heat cracks are attached to the actual frontier. */}
  {Array.from({length:56},(_,i)=>{
   const yy=88+noise(i*23+2)*704;
   const x=frontierXForMask(time,yy,speed,revealX);
   const lift=(noise(i*13+5)-.5)*14;
   return <path key={i} d={`M${x-5} ${yy-2} l${-6-noise(i*3)*15} ${lift} l${-3-noise(i*47)*9} ${lift*.6}`}
    fill="none" stroke={i%4===0?'#d9a06d':'#24140e'} strokeWidth={.45+noise(i*31)*1.8}
    opacity={.22+noise(i*41)*.45}/>;
  })}
  {/* Sparse embers; never a continuous laser outline. */}
  {Array.from({length:65},(_,i)=>{const p=frontierParticle(i,time,speed,revealX);
   return <circle key={i} cx={p.x} cy={p.y} r={Math.min(1.3,p.r*.4)} opacity={p.opacity*.37} fill="#e4a06c"/>;
  })}
 </g>;
}
