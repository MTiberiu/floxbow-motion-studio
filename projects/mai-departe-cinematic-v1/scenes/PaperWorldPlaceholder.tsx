import {AbsoluteFill} from 'remotion';

/** Deliberately provisional paper art; the physical handoff and movement are the deliverable.
 * Replace with character/photo paper plates after director reviews the camera flow.
 */
export function PaperWorldPlaceholder({frame}:{frame:number}){
 const time=frame/30;
 const travel=Math.max(0,frame-780);
 return <AbsoluteFill data-material="paper-placeholder" style={{
  background:'repeating-linear-gradient(7deg,rgba(106,87,60,.03) 0px,rgba(106,87,60,.03) 1px,transparent 1px,transparent 11px),linear-gradient(140deg,#f0e7d5,#d6c6ac 75%,#b9a689)',
  overflow:'hidden',pointerEvents:'none'}}>
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
   <defs>
    <filter id="paperShadow"><feDropShadow dx="7" dy="14" stdDeviation="9" floodColor="#594733" floodOpacity=".25"/></filter>
    <pattern id="paperFibres" width="34" height="34" patternUnits="userSpaceOnUse">
     <path d="M4 3l8 1m11 8l6 -1m-8 17l5 2" stroke="#816d53" opacity=".16"/>
    </pattern>
   </defs>
   <rect width="1920" height="1080" fill="url(#paperFibres)"/>
   <g transform={`translate(${-travel*.12} 0)`} filter="url(#paperShadow)">
    <path d="M-200 820L230 430L415 625L680 265L950 680L1170 380L1480 790L1800 440L2200 860V1150H-200Z"
     fill="#d6d9ce" stroke="#faf8ec" strokeWidth="20" strokeLinejoin="round"/>
    <path d="M-200 880L170 690L435 830L730 575L1020 860L1350 640L1740 850L2160 660V1150H-200Z"
     fill="#97b3aa" stroke="#e8eee3" strokeWidth="16" strokeLinejoin="round"/>
    <path d="M-200 1000L290 825L680 990L1090 800L1500 995L2100 840V1140H-200Z"
     fill="#557e72" stroke="#b5c8b6" strokeWidth="18" strokeLinejoin="round"/>
   </g>
   <g opacity=".46" stroke="#746852" fill="none" strokeWidth="2">
    {Array.from({length:9},(_,i)=><path key={i} d={`M${i*250-160} 130l180 860`}/>)}
   </g>
   <g transform={`translate(${1650-Math.min(180,travel*.4)} 230) rotate(8)`} filter="url(#paperShadow)">
    <rect x="-210" y="-160" width="390" height="390" rx="3" fill="#f8f2e4" stroke="#9c8667" strokeWidth="4"/>
    <rect x="-178" y="-130" width="325" height="240" fill="#b4c6c2"/>
    <path d="M-178 88L-80-46L0 30L65-66L147 60V110H-178Z" fill="#688d86"/>
    <path d="M-170 160h275m-275 25h200" stroke="#988773" strokeWidth="7" opacity=".5"/>
   </g>
  </svg>
 </AbsoluteFill>;
}
