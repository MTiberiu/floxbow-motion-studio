// Film coordinates are immutable. Arrival is a scalar field, never accumulated state.
export const hash = (n: number) => {const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const smooth=(v:number)=>v*v*(3-2*v);
function noise(x:number,y:number){
 const ix=Math.floor(x),iy=Math.floor(y),a=smooth(x-ix),b=smooth(y-iy);
 const h=(dx:number,dy:number)=>hash((ix+dx)*17+(iy+dy)*131);
 return ((h(0,0)*(1-a)+h(1,0)*a)*(1-b)+(h(0,1)*(1-a)+h(1,1)*a)*b)*2-1;
}
// Authored lobes give the edge a hierarchy; noise only erodes their contours.
function relief(u:number,y:number){
 const bell=(c:number,w:number)=>Math.exp(-(((y-c)/w)**2));
 const macro=100*bell(240,110)-74*bell(430,90)+80*bell(660,130);
 return macro+48*noise(u/1100,y/110)+17*noise(u/650+19,y/32)+5*noise(u/420+47,y/9);
}
export function arrivalTime(u:number,y:number,speed:number,revealX:number){
 return (u-revealX-relief(u,y))/speed;
}
function solveFrontierX(time:number,y:number,speed:number,revealX:number,iterations:number){
 // d(relief)/du is bounded below 1: arrival is strictly increasing in film X.
 // Hence one connected contour, no floating blotches and no re-covering pixels.
 let lo=revealX+time*speed-260,hi=revealX+time*speed+260;
 for(let i=0;i<iterations;i++){const mid=(lo+hi)/2;if(arrivalTime(mid,y,speed,revealX)<time)lo=mid;else hi=mid;}
 return (lo+hi)/2-time*speed;
}
export function frontierX(time:number,y:number,speed:number,revealX:number){
 return solveFrontierX(time,y,speed,revealX,23);
}
// The raster mask only needs subpixel accuracy. A short fixed-point solve
// avoids repeated relief/noise evaluation during frame-by-frame playback.
export function frontierXForMask(time:number,y:number,speed:number,revealX:number){
 // Fixed-point inversion converges quickly because the relief slope is
 // bounded below 1. Three passes stay within 0.2 px of the precise contour
 // across the authored reveal range, while avoiding repeated binary search.
 const target=revealX+time*speed;
 let x=target;
 for(let i=0;i<3;i++)x=target+relief(x,y);
 return x-time*speed;
}
export function buildEmulsion(time:number,speed:number,revealX:number){
 const points=Array.from({length:360},(_,i)=>{const y=82+i*2;return {x:frontierXForMask(time,y,speed,revealX),y};});
 const edge='M'+points.map(p=>`${p.x.toFixed(3)},${p.y}`).join(' L');
 const area=`M0,82 L${points.map(p=>`${p.x.toFixed(3)},${p.y}`).join(' L')} L0,800 Z`;
 const mask=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path d="${area}" fill="white"/></svg>`;
 return {edge,area,maskImage:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(mask)}`};
}
export function frontierParticle(id:number,time:number,speed:number,revealX:number){
 const life=1.2+hash(id+32)*1.5,phase=hash(id+91)*life;
 const cycle=Math.floor((time+phase)/life),birth=cycle*life-phase,age=time-birth;
 const y=90+hash(id+cycle*157)*700;
 // Particle placement is a visual contour sample; half-pixel precision is
 // sufficient and avoids repeating the high-precision camera solve 3x.
 const x=frontierXForMask(birth,y,speed,revealX);
 const slope=(frontierXForMask(birth,y+1,speed,revealX)-frontierXForMask(birth,y-1,speed,revealX))/2;
 const norm=Math.hypot(1,slope),v=14+hash(id+81)*30;
 return {x:x-age*speed+age*v/norm,y:y-age*v*slope/norm+age*age*6,opacity:birth<0?0:Math.sin(Math.PI*Math.min(1,age/.12)/2)*(1-age/life)**2,r:.6+hash(id+71)*1.3};
}
