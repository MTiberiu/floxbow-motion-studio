import { JourneyWorld } from './JourneyWorld';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type { EditableComponent } from '@motion/sdk/editor';
import type { TimelineClip } from '@motion/sdk/timeline';
import guides from '../motion-guides.json';

const colors = ['#db884e', '#aa64d5', '#399cbd'];
const keys = ['phraseEmotional', 'vocalProsody', 'wordGravity'] as const;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const seed = (value: number) => {
  const random = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return random - Math.floor(random);
};

function guideValue(time: number, key: (typeof keys)[number]) {
  const position = clamp(time / guides.sampleStepSeconds, 0, guides.samples.length - 1);
  const index = Math.floor(position);
  const first = guides.samples[index];
  const second = guides.samples[Math.min(index + 1, guides.samples.length - 1)];
  return first[key] + (second[key] - first[key]) * (position - index);
}

// World-anchored material reveal. The mask is evaluated afresh for every frame:
// seeking backwards gives the same result as playing forwards. The seeded flecks
// are material fragments; they are not a blurred curtain over the scenery.
// A continuous emulsion boundary — no disconnected black ellipse clusters.
// The same field drives opacity and warm edge glow. World-space texture stays
// deterministic for seeking. A small amplitude keeps the built image legible.
function emulsionEdge(y: number, offset: number, time: number, revealX: number) {
  const sway = 17 * Math.sin(y * .012 + offset * .002)
    + 10 * Math.sin(y * .037 + offset * .005 + 1.4)
    + 4 * Math.sin(y * .093 + 2.7);
  const narrativePulse = 2.5 * Math.sin(time * .43 + y * .005);
  return revealX + sway + narrativePulse;
}
function edgePath(revealX: number, offset: number, time: number) {
  const points: string[] = [];
  for (let y = 82; y <= 800; y += 8) {
    points.push(`${emulsionEdge(y,offset,time,revealX).toFixed(1)},${y}`);
  }
  return `M${points.join(' L')}`;
}
function buildWorldMask(revealX: number, _pathY: number[], offset: number, time: number) {
  const samples: string[]=[];
  for(let y=82;y<=800;y+=8) samples.push(`${emulsionEdge(y,offset,time,revealX).toFixed(1)},${y}`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="edge" x1="0" x2="1"><stop stop-color="white"/><stop offset=".68" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs><path d="M0 82 L${samples.join(' L')} L0 800 Z" fill="white"/><path d="M${samples.join(' L')}" fill="none" stroke="white" stroke-width="18" opacity=".32"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function JourneyReveal({ clip, frame = 0 }: { clip: TimelineClip; frame?: number }) {
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const horizon = Number(clip.props.horizon ?? 55);
  const speed = 1920 / horizon;
  const centerX = 1000;
  const gain = Number(clip.props.gain ?? 0.92);
  const density = Math.round(Number(clip.props.particles ?? 70));
  const trailSeconds = Number(clip.props.trailSeconds ?? 6.5);
  const trailPixels = trailSeconds * speed;
  const revealX = centerX - trailPixels;
  const scales = [32, 50, 46];
  const y = (seconds: number, path: number) => 450 - guideValue(seconds, keys[path]) * scales[path] * gain;
  const offset = time * speed;
  const maskImage = buildWorldMask(revealX, keys.map((_, path) => y(time, path)), offset, time);
  const boundary = edgePath(revealX, offset, time);

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 70% 45%, #25201d 0%, #100e11 58%, #070809 100%)' }} data-journey-time={time}>
      <JourneyWorld time={time} speed={speed} maskImage={maskImage} />
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <clipPath id="futureRoad"><rect x={revealX} y="90" width={1920 - revealX} height="705" /></clipPath>
          {colors.map((color, index) => <radialGradient key={color} id={`markerGlow${index}`} cx="30%" cy="25%"><stop stopColor="white" /><stop offset=".3" stopColor={color} /><stop offset="1" stopColor={['#8d4427', '#582a87', '#17596e'][index]} /></radialGradient>)}
        </defs>
        <g stroke="#967c61" strokeWidth="1" opacity=".2">
          {Array.from({ length: 22 }, (_, index) => { const x = index * 100 - (offset % 100); return <path key={`v-${index}`} d={`M${x} 90 V795`} />; })}
          {Array.from({ length: 8 }, (_, index) => <path key={`h-${index}`} d={`M0 ${95 + index * 100} H1920`} />)}
        </g>
        {keys.map((_, path) => {
          const points: string[] = [];
          for (let x = 0; x <= 1920; x += 7) {
            const seconds = clamp(time + (x - centerX) / speed, 0, guides.durationSeconds);
            points.push(`${x} ${y(seconds, path)}`);
          }
          const d = `M${points.join(' L')}`;
          return <path key={`road-${path}`} clipPath="url(#futureRoad)" d={d} stroke={colors[path]} strokeWidth="3" fill="none" opacity=".8" />;
        })}
        {keys.map((_, path) => (
          <g key={`marker-${path}`}>
            {Array.from({ length: density }, (_, index) => {
              const life = 1.8 + seed(index + 100 * path) * 1.2;
              const age = (time + seed(index + path * 300) * life) % life;
              const birth = Math.max(0, time - age);
              const travel = age * (85 + seed(index + 400) * 115);
              const py = y(birth, path) + (seed(index + 500 * path) - 0.5) * age * 140;
              return <circle key={index} cx={centerX - travel} cy={py} r={1 + seed(index + 70) * 3.4} fill={colors[path]} opacity={(1 - age / life) * 0.65} />;
            })}
            <circle cx={centerX} cy={y(time,path)} r="33" fill={colors[path]} opacity=".08"/>
            <circle cx={centerX} cy={y(time,path)} r="18" fill={colors[path]} opacity=".15"/>
            <circle cx={centerX} cy={y(time,path)} r="9" fill={colors[path]} opacity=".85"/>
            <circle cx={centerX} cy={y(time,path)} r="4" fill="#fff7de"/>
            <circle cx={centerX} cy={y(time,path)} r="19" fill="none" stroke={colors[path]} strokeWidth=".9" opacity=".6"/>

          </g>
        ))}
        <path d={boundary} stroke="#ffad64" strokeWidth="20" opacity=".12" fill="none"/>
        <path d={boundary} stroke="#ffd39b" strokeWidth="5" opacity=".76" fill="none"/>
        <path d={boundary} stroke="#fff7d9" strokeWidth="1.3" opacity=".95" fill="none"/>
        <path d="M0 80 H1920 M0 805 H1920" stroke="#a66732" strokeWidth="3" />
        {Array.from({ length: 35 }, (_, index) => {
          const x = index * 60 - (offset % 60);
          return <g key={`sprocket-${index}`} fill="#d3d9dc"><rect x={x} y="50" width="28" height="18" rx="4" /><rect x={x} y="820" width="25" height="14" rx="3" /></g>;
        })}
      </svg>
      <div aria-hidden="true" style={{position:'absolute',left:0,right:0,top:0,height:80,background:'linear-gradient(#160e0a,#412416 46%,#120e0e)',borderBottom:'3px solid #bb7b44',opacity:.97,pointerEvents:'none'}}/>
      <div aria-hidden="true" style={{position:'absolute',left:0,right:0,top:805,height:70,background:'linear-gradient(#2d1b12,#0e0b0b)',borderTop:'3px solid #bb7b44',opacity:.97,pointerEvents:'none'}}/>
      <svg viewBox="0 0 1920 1080" aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
        {Array.from({length:35},(_,i)=>{const x=i*60-(offset%60);return <g key={i} fill="#ba8751"><rect x={x} y="23" width="30" height="33" rx="5"/><rect x={x} y="827" width="30" height="28" rx="5"/></g>;})}
        {Array.from({length:110},(_,i)=>{const x=seed(i*13+1)*1920,y=82+seed(i*17+3)*720;return <circle key={i} cx={x} cy={y} r={.4+seed(i*7)*1.6} fill="#dba56f" opacity={.07+seed(i*3)*.17}/>;})}
      </svg>
    </AbsoluteFill>
  );
}

export const journeyRevealModule: EditableComponent = {
  id: 'director-journey-reveal',
  name: 'Director · Three paths / world reveal',
  fields: [
    { key: 'horizon', target: 'props', label: 'Visible road (seconds)', type: 'number', default: 55, min: 20, max: 100, step: 5 },
    { key: 'gain', target: 'props', label: 'Curve amplitude', type: 'number', default: 0.92, min: 0.3, max: 1.6, step: 0.05 },
    { key: 'particles', target: 'props', label: 'Spray particles per marker', type: 'number', default: 70, min: 20, max: 150, step: 10 },
    { key: 'trailSeconds', target: 'props', label: 'Trail before reveal (seconds)', type: 'number', default: 6.5, min: 5, max: 7, step: 0.25 },
  ],
  component: JourneyReveal,
};
