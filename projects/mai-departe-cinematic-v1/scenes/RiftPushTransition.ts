/**
 * Shared directional rift compositor, expressed in film viewport coordinates.
 * The incoming plane pushes the outgoing plane; no growing ellipse or scale mask.
 * Deterministic by absolute composition frame so random seeks are reproducible.
 */
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};

export type RiftPhase='film'|'enter'|'world'|'return';
export type RiftState={
 phase:RiftPhase;
 progress:number;
 edgeX:number;
 worldClip:string;
 filmClip:string;
 edgePath:string;
 active:boolean;
 // Outgoing physical plane moves with the rift rather than waiting behind a wipe.
 worldShift:number;
 filmShift:number;
};

export function riftPush(frame:number):RiftState {
 const entering=frame>=240&&frame<450;
 const returning=frame>=690&&frame<810;
 const phase:RiftPhase=entering?'enter':returning?'return':frame>=450&&frame<690?'world':'film';
 const progress=entering?smooth((frame-240)/210):returning?smooth((frame-690)/120):phase==='world'?1:0;
 // Enter: world advances from left. Exit: film advances from left.
 const x=progress*1920;
 const pts=Array.from({length:65},(_,i)=>{
  const y=i*1080/64;
  const taper=Math.sin(Math.PI*i/64);
  const rough=(Math.sin(i*.71+1.8)*17+Math.sin(i*1.91)*9+Math.sin(i*3.57)*3)*taper;
  return {x:Math.max(-40,Math.min(1960,x+rough)),y};
 });
 const seam=pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
 const left=[`0,0`,...pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`),`0,1080`].join(' ');
 const right=[`1920,0`,...pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`),`1920,1080`].join(' ');
 const clip=(coords:string)=>`polygon(${coords.split(' ').map(pair=>{const [px,py]=pair.split(',').map(Number);return `${px/19.2}% ${py/10.8}%`;}).join(',')})`;
 return {
  phase,progress,edgeX:x,active:entering||returning,
  worldClip:entering?clip(left):returning?clip(right):phase==='world'?'inset(0)':'inset(0 100% 0 0)',
  filmClip:returning?clip(left):entering?clip(right):phase==='film'?'inset(0)':'inset(0 100% 0 0)',
  edgePath:'M'+seam.replaceAll(' ',' L').replaceAll(',', ' '),
  worldShift:returning?Math.round(progress*105):0,
  filmShift:entering?Math.round(progress*105):0,
 };
}
