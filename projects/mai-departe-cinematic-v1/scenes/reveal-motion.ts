/**
 * Single frame-based motion source for valley reveal and camera world.
 * All offsets are functions of absolute composition time, never history.
 * Pixels/sec on film, world-units/sec in perspective scene.
 */
export const revealMotion=(time:number)=>{
 const t=Math.max(0,time);
 const forward=t+0.6*Math.sin(t*0.12);
 const flow={
  sky:-forward*1.15,
  far:-forward*4.1,
  middle:-forward*9.6,
  near:-forward*18.8,
 };
 return {
  time:t,forward,flow,
  worldOffset:{
   far:-forward*.042,
   middle:-forward*.095,
   near:-forward*.21
  },
  waterPhase:t*.67,
  mistPhase:t*.11,
 };
};
