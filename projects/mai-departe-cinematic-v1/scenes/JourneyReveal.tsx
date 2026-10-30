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

function buildWorldMask(revealX: number, pathY: number[]) {
  const emitters = pathY.map((y) =>
    `<ellipse cx="${revealX - 105}" cy="${y.toFixed(2)}" rx="170" ry="110" fill="url(#sprayReveal)"/>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="pastReveal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="white"/><stop offset=".75" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><radialGradient id="sprayReveal"><stop stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><rect x="0" y="90" width="${revealX}" height="705" fill="url(#pastReveal)"/>${emitters}</svg>`;
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
  const maskImage = buildWorldMask(revealX, keys.map((_, path) => y(time, path)));
  const offset = time * speed;

  return (
    <AbsoluteFill style={{ background: '#fff' }} data-journey-time={time}>
      <JourneyWorld time={time} speed={speed} maskImage={maskImage} />
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <clipPath id="futureRoad"><rect x={revealX} y="90" width={1920 - revealX} height="705" /></clipPath>
          {colors.map((color, index) => <radialGradient key={color} id={`markerGlow${index}`} cx="30%" cy="25%"><stop stopColor="white" /><stop offset=".3" stopColor={color} /><stop offset="1" stopColor={['#8d4427', '#582a87', '#17596e'][index]} /></radialGradient>)}
        </defs>
        <g stroke="#d5dce0" strokeWidth="1" opacity=".55">
          {Array.from({ length: 22 }, (_, index) => { const x = index * 100 - (offset % 100); return <path key={`v-${index}`} d={`M${x} 90 V795`} />; })}
          {Array.from({ length: 8 }, (_, index) => <path key={`h-${index}`} d={`M0 ${95 + index * 100} H1920`} />)}
        </g>
        {keys.map((_, path) => {
          let d = '';
          for (let x = 0; x <= 1920; x += 7) {
            const seconds = clamp(time + (x - centerX) / speed, 0, guides.durationSeconds);
            d += `${x === 0 ? 'M' : ' L'}${x} ${y(seconds, path)}`;
          }
          return <path key={`road-${path}`} clipPath="url(#futureRoad)" d={d} stroke={colors[path]} strokeWidth="3" fill="none" opacity=".22" />;
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
            <circle cx={centerX} cy={y(time, path)} r="25" fill="#f8fafb" stroke="#253642" strokeWidth="1.5" />
            <circle cx={centerX} cy={y(time, path)} r="18" fill="none" stroke={colors[path]} strokeWidth="3" />
            <circle cx={centerX} cy={y(time, path)} r="5" fill="#253642" />
            <path d={`M${centerX - 32} ${y(time, path)} h9 M${centerX + 23} ${y(time, path)} h9 M${centerX} ${y(time, path) - 32} v9 M${centerX} ${y(time, path) + 23} v9`} stroke="#253642" strokeWidth="1.5" />
          </g>
        ))}
        <path d="M0 80 H1920 M0 805 H1920" stroke="#c7ced2" strokeWidth="2" />
        {Array.from({ length: 35 }, (_, index) => {
          const x = index * 60 - (offset % 60);
          return <g key={`sprocket-${index}`} fill="#d3d9dc"><rect x={x} y="50" width="25" height="14" rx="3" /><rect x={x} y="820" width="25" height="14" rx="3" /></g>;
        })}
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
