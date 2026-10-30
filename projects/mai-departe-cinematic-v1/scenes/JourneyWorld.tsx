import { ThreeCanvas } from '@remotion/three';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useVideoConfig } from 'remotion';

/**
 * The GRID becomes the WORLD. A frame-addressable generative landscape,
 * combining vector-like elevation contours, mineral surfaces, independent
 * atmosphere and a reflective lake. No raster plate or UV-stretched photo.
 * All positions derive from song time (seek and render are deterministic).
 */
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number) => fract(Math.sin(x * 127.1 + 91.37) * 43758.5453);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function noise(x: number) {
  const i = Math.floor(x), f = fract(x), u = f * f * (3 - 2 * f);
  return mix(hash(i), hash(i + 1), u);
}
function summit(x: number, seed: number) {
  const p = x * 0.00165 + seed * 13.7;
  const broad = Math.abs(noise(p * 3.5) * 2 - 1);
  const teeth = Math.pow(Math.abs(noise(p * 11.5) * 2 - 1), 2.2);
  const detail = (noise(p * 61) - 0.5) * 0.15;
  return clamp(broad * 0.71 + teeth * 0.34 + detail, 0.04, 1);
}
const MIN_X = -1800, MAX_X = 8800, DX = 14;
function terrain(seed: number, base: number, altitude: number, bottom: number) {
  const vertices: number[] = [], colors: number[] = [], index: number[] = [];
  const rock = new THREE.Color(seed < 2 ? '#788da0' : seed < 3 ? '#476d80' : '#28556a');
  const snow = new THREE.Color('#dcecf1');
  const moss = new THREE.Color('#307a77');
  const n = Math.ceil((MAX_X - MIN_X) / DX);
  for (let i = 0; i <= n; i++) {
    const x = MIN_X + i * DX, peak = summit(x, seed);
    for (let j = 0; j < 2; j++) {
      vertices.push(x, j ? bottom : base + peak * altitude, 0);
      const c = rock.clone();
      const grain = noise(x * 0.019 + seed * 20);
      if (!j) c.lerp(snow, clamp((peak - 0.37) * 2.3 + (grain - 0.5) * 0.25));
      else c.lerp(moss, 0.42);
      c.multiplyScalar(0.86 + grain * 0.18);
      colors.push(c.r, c.g, c.b);
    }
    if (i < n) {
      const k = i * 2;
      index.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
}
function contour(seed: number, base: number, altitude: number, fraction: number) {
  const points: THREE.Vector3[] = [];
  for (let x = MIN_X; x <= MAX_X; x += DX) {
    points.push(new THREE.Vector3(x, base + summit(x, seed) * altitude * fraction, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
function Ridge({ time, speed, seed, base, altitude, bottom, rate, z, ink }: {
  time: number; speed: number; seed: number; base: number; altitude: number;
  bottom: number; rate: number; z: number; ink: string;
}) {
  const ground = useMemo(() => terrain(seed, base, altitude, bottom), [seed, base, altitude, bottom]);
  const contourLines = useMemo(() => [0.26, 0.46, 0.67, 0.84, 1].map(t => contour(seed, base, altitude, t)), [seed, base, altitude]);
  return <group position={[-time * speed * rate, 0, z]}>
    <mesh geometry={ground} renderOrder={3 + seed}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
    </mesh>
    {contourLines.map((geometry, i) => <line key={i} geometry={geometry} renderOrder={9 + seed}>
      <lineBasicMaterial color={ink} transparent opacity={i === 4 ? 0.92 : 0.16 + i * 0.065} depthTest={false} depthWrite={false} />
    </line>)}
  </group>;
}

const SKY_V = `
varying vec2 uvCoord;
void main() { uvCoord = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_F = `
uniform float time;
varying vec2 uvCoord;
void main() {
  float horizon = smoothstep(0.0,1.0,uvCoord.y);
  vec3 low = vec3(0.74,0.88,0.89);
  vec3 high = vec3(0.09,0.18,0.29);
  vec3 color = mix(low,high,pow(horizon,0.85));
  float sun = exp(-pow((uvCoord.x-0.76)*10.0,2.0)-pow((uvCoord.y-0.62)*5.0,2.0));
  color += vec3(0.59,0.39,0.24)*sun*0.42;
  float atmosphericBands = sin(uvCoord.y*70.0+time*.12+sin(uvCoord.x*8.0)*2.0)*.008;
  gl_FragColor = vec4(color+atmosphericBands,1.0);
}`;
const WATER_V = `
uniform float time;
varying vec2 localUV;
varying vec2 worldXY;
void main() {
  localUV=uv;
  vec3 p=position;
  p.y += sin(p.x*.018+time*.85)*2.8+sin(p.x*.054-time*1.26)*1.2;
  worldXY=p.xy;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const WATER_F = `
uniform float time;
varying vec2 localUV;
varying vec2 worldXY;
void main() {
  float ripple=sin(worldXY.x*.044+time*1.7+sin(worldXY.y*.017))*sin(worldXY.x*.012-time*.64);
  float shimmer=pow(max(0.0,ripple),15.0);
  vec3 deep=vec3(.025,.16,.22);
  vec3 near=vec3(.15,.39,.46);
  vec3 c=mix(deep,near,localUV.y);
  c+=vec3(.25,.42,.42)*shimmer*.34;
  float lines=pow(max(0.0,sin(worldXY.y*.17+sin(worldXY.x*.026+time)*2.0)),28.0);
  c+=vec3(.12,.32,.33)*lines*.22;
  gl_FragColor=vec4(c,1.0);
}`;
function Lake({ time, speed }: { time: number; speed: number }) {
  const uniforms=useMemo(()=>({time:{value:time}}),[]);
  uniforms.time.value=time;
  return <mesh position={[-time*speed*.65,-345,-2]} renderOrder={5}>
    <planeGeometry args={[12500,510,100,12]} />
    <shaderMaterial vertexShader={WATER_V} fragmentShader={WATER_F} uniforms={uniforms} depthTest={false} depthWrite={false} />
  </mesh>;
}
function Atmosphere({ time, speed }: { time: number; speed: number }) {
  const sky = useMemo(()=>({time:{value:time}}),[]);
  sky.time.value=time;
  return <>
    <mesh position={[0,0,-30]} renderOrder={0}>
      <planeGeometry args={[1920,1080]} />
      <shaderMaterial vertexShader={SKY_V} fragmentShader={SKY_F} uniforms={sky} depthTest={false} depthWrite={false} />
    </mesh>
    {[0,1,2].map(i=><mesh key={i} position={[Math.sin(time*.12+i*2)*32-time*speed*.025,80-i*90,-20+i]} renderOrder={1+i}>
      <planeGeometry args={[1680-i*160,75+i*40]} />
      <meshBasicMaterial color={i===0?'#b6d4de':'#d8ebeb'} transparent opacity={.065+i*.025} depthTest={false} depthWrite={false} />
    </mesh>)}
  </>;
}
function WorldGrid({time,speed}:{time:number;speed:number}) {
  const geometry=useMemo(()=>{
    const points:THREE.Vector3[]=[];
    for(let k=-25;k<=110;k++){
      const x=k*80;
      points.push(new THREE.Vector3(x,-460,0),new THREE.Vector3(x,440,0));
    }
    for(let y=-440;y<=440;y+=80){
      points.push(new THREE.Vector3(MIN_X,y,0),new THREE.Vector3(MAX_X,y,0));
    }
    const g=new THREE.BufferGeometry().setFromPoints(points);
    return g;
  },[]);
  return <lineSegments geometry={geometry} position={[-time*speed*.48,0,5]} renderOrder={12}>
    <lineBasicMaterial color="#bcf3f5" transparent opacity={.075} depthWrite={false} depthTest={false} />
  </lineSegments>;
}
function Sparks({time,speed}:{time:number;speed:number}) {
  const dots=useMemo(()=>{
    const a:number[]=[];
    for(let i=0;i<350;i++){
      a.push(-1000+hash(i*7)*10200,-410+hash(i*11+3)*690,0);
    }
    return new THREE.BufferGeometry().setFromPoints(Array.from({length:350},(_,i)=>new THREE.Vector3(a[i*3],a[i*3+1],0)));
  },[]);
  return <points geometry={dots} position={[-time*speed*.39,0,16]} renderOrder={15}>
    <pointsMaterial color="#b4edf0" size={2.2} transparent opacity={.56} sizeAttenuation={false} depthTest={false} depthWrite={false} />
  </points>;
}
export function JourneyWorld({time,speed,maskImage}:{time:number;speed:number;maskImage:string}) {
  const {width,height}=useVideoConfig();
  return <div aria-hidden="true" style={{
    position:'absolute',inset:0,overflow:'hidden',
    maskImage:`url("${maskImage}")`,WebkitMaskImage:`url("${maskImage}")`,
    maskSize:'100% 100%',WebkitMaskSize:'100% 100%',
    maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat'
  }}>
    <ThreeCanvas width={width} height={height} orthographic
      camera={{left:-960,right:960,top:540,bottom:-540,near:.1,far:2400,position:[0,0,1200]}}
      gl={{alpha:true,antialias:true}}
      style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
      <Atmosphere time={time} speed={speed}/>
      <Ridge time={time} speed={speed} seed={1} base={40} altitude={310} bottom={-180} rate={.15} z={-12} ink="#d9eff3"/>
      <Ridge time={time} speed={speed} seed={2} base={-105} altitude={380} bottom={-285} rate={.36} z={-8} ink="#abdee7"/>
      <Lake time={time} speed={speed}/>
      <Ridge time={time} speed={speed} seed={3} base={-260} altitude={190} bottom={-485} rate={.83} z={2} ink="#79bbc0"/>
      <WorldGrid time={time} speed={speed}/>
      <Sparks time={time} speed={speed}/>
    </ThreeCanvas>
  </div>;
}
