/** One shared time-derived boundary for each physical film handoff. */
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
export type TransitionPhase='entry'|'world'|'return'|'paper'|'paper-full';
export const ENTRY_START=240,ENTRY_END=450,RETURN_START=690,RETURN_END=810,PAPER_END=930;
export function riftEdge(x:number,frame:number,seed=0){
 const points=Array.from({length:73},(_,i)=>{
  const y=i*15;
  const envelope=Math.sin(Math.PI*i/72);
  const n=(Math.sin(i*.69+seed*2.1+frame*.018)*16+
   Math.sin(i*1.73+seed*.7-frame*.012)*9+Math.sin(i*3.7+seed)*4)*envelope;
  return {x:x+n,y};
 });
 const path='M'+points.map(p=>p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' L');
 const poly=(side:'left'|'right')=>{
  const list=side==='left'?[{x:0,y:0},...points,{x:0,y:1080}]:
   [{x:1920,y:0},...points,{x:1920,y:1080}];
  return 'polygon('+list.map(p=>`${(p.x/19.2).toFixed(3)}% ${(p.y/10.8).toFixed(3)}%`).join(',')+')';
 };
 return {path,left:poly('left'),right:poly('right'),x};
}
export function transitionAt(frame:number){
 const phase:TransitionPhase=frame<ENTRY_END?'entry':frame<RETURN_START?'world':
  frame<RETURN_END?'return':frame<PAPER_END?'paper':'paper-full';
 const returnProgress=smooth((frame-RETURN_START)/(RETURN_END-RETURN_START));
 // The returning travelers come from LEFT and push the world off RIGHT.
 const returnEdge=riftEdge(1920*returnProgress,frame,1);
 // A second tear follows the travelers; paper takes over FROM LEFT only once
 // the film/travelers have visibly returned. This does not reset the travelers.
 const paperProgress=smooth((frame-780)/(PAPER_END-780));
 const paperEdge=riftEdge(1920*paperProgress,frame,6);
 return {phase,returnProgress,paperProgress,returnEdge,paperEdge,
  returnActive:frame>=RETURN_START&&frame<RETURN_END,
  paperActive:frame>=780&&frame<PAPER_END};
}
