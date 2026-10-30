import {frontierX} from './emulsion-field';
import {ease} from './camera-state';

/** One reveal-front in scene coordinates drives both the edge and the traversal window.
 * Forward motion never changes time origin between film and world.
 */
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function portalAperture(frame:number,fps:number,speed:number,revealX:number){
 const t=frame/fps;
 const entering=clamp((frame-240)/210);
 const retreating=clamp((frame-690)/120);
 const travel=frame<240?0:frame<450?ease(entering):frame<690?1:1-ease(retreating);
 const boundary=frontierX(t,450,speed,revealX);
 // Derive the portal center from the moving physical edge rather than an arbitrary 46% screen anchor.
 const cx=clamp(boundary/1920)*100;
 const cy=41.7;
 const expansion=.001+travel*1.58;
 const points=Array.from({length:96},(_,i)=>{
  const a=i*2*Math.PI/96;
  const rough=1+.055*Math.sin(a*9+1.4)+.035*Math.sin(a*27-1.7)+.02*Math.sin(a*52+.5);
  const rx=expansion*110*rough,ry=expansion*166*rough;
  return `${cx+Math.cos(a)*rx}% ${cy+Math.sin(a)*ry}%`;
 });
 return {open:travel,boundary,polygon:`polygon(${points.join(',')})`,cx,cy};
}
