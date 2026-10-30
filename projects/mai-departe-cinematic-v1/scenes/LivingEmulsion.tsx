import {frontierX,frontierParticle} from './emulsion-field';
export function LivingEmulsion({time,speed,revealX,edge}:{time:number;speed:number;revealX:number;edge:string}){
 return <g pointerEvents="none" data-living-emulsion="1">
  <path d={edge} fill="none" stroke="#ee792e" strokeWidth={25} opacity={.07}/>
  <path d={edge} fill="none" stroke="#ffc075" strokeWidth={9} opacity={.18}/>
  <path d={edge} fill="none" stroke="#ffcf89" strokeWidth={2.5} opacity={.85}/>
  <path d={edge} fill="none" stroke="#fff2cb" strokeWidth={.8} opacity={.95}/>
  {Array.from({length:16},(_,i)=>{
   // Short offset contours, not unrelated sine ribbons. Local tangent is shared.
   const start=90+i*43,length=32+(i%3)*11;
   const points=Array.from({length:20},(_,j)=>{const y=Math.min(798,start+j*length/19),x=frontierX(time,y,speed,revealX);
    const slope=(frontierX(time,y+1,speed,revealX)-frontierX(time,y-1,speed,revealX))/2;
    const distance=(5+i%4*4)*Math.sin(Math.PI*j/19),n=Math.hypot(1,slope);
    return `${x-distance/n},${y+distance*slope/n}`;
   });
   return <path key={i} d={'M'+points.join(' L')} stroke={i%3===0?'#a5d9da':'#ffd49c'} strokeWidth={.65} fill="none" opacity={.35+.15*Math.sin(time*1.4+i)}/>;
  })}
  {Array.from({length:100},(_,i)=>{const p=frontierParticle(i,time,speed,revealX);return <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity={p.opacity*.7} fill={i%5===0?'#b8dbe1':'#ffcf8b'}/>;})}
 </g>;
}
