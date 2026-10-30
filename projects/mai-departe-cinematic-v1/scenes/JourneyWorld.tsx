import { ThreeCanvas } from '@remotion/three';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo } from 'react';
import { useVideoConfig } from 'remotion';
import distantMountains from '../assets/journey-distant-mountains-v1.png';
import nearSlope from '../assets/journey-near-slope-v1.png';
import foregroundShore from '../assets/journey-shore-v1.png';

const PHOTO_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A small edge despill pass replaces cyan pixels with nearby opaque material colors.
// It leaves the alpha channel intact, so the cutout stays truly transparent.
const PHOTO_FRAGMENT = `
uniform sampler2D map;
uniform vec2 texelSize;
varying vec2 vUv;
void main() {
  vec4 base = texture2D(map, vUv);
  if (base.a < 0.01) discard;
  vec3 interior = vec3(0.0);
  float count = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      if (x == 0 && y == 0) continue;
      vec4 sampleColor = texture2D(map, vUv + vec2(float(x), float(y)) * texelSize);
      if (sampleColor.a > 0.94) {
        interior += sampleColor.rgb;
        count += 1.0;
      }
    }
  }
  vec3 rgb = base.rgb;
  if (count > 0.0 && base.a < 0.96) {
    vec3 inside = interior / count;
    float cyanFringe = step(max(base.r, base.g) * 1.22, base.b) * step(base.r * 1.32, base.g);
    float edge = 1.0 - smoothstep(0.35, 0.96, base.a);
    rgb = mix(rgb, inside, cyanFringe * edge * 0.92);
  }
  gl_FragColor = vec4(rgb, base.a);
}`;

const SKY_VERTEX = PHOTO_VERTEX;
const SKY_FRAGMENT = `
varying vec2 vUv;
void main() {
  vec3 upper = vec3(0.57, 0.68, 0.72);
  vec3 horizon = vec3(0.91, 0.87, 0.78);
  float light = smoothstep(0.08, 0.92, vUv.y);
  vec3 color = mix(horizon, upper, light);
  float cloudBand = sin(vUv.x * 18.0 + vUv.y * 4.0) * 0.012;
  color += cloudBand * smoothstep(0.1, 0.75, vUv.y);
  gl_FragColor = vec4(color, 1.0);
}`;

const WATER_VERTEX = `
uniform float time;
varying vec2 vUv;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vec3 p = position;
  float crest = sin((p.x + time * 24.0) * 0.018) * 1.5
              + sin((p.x - time * 15.0) * 0.043) * 0.65;
  p.y += crest * smoothstep(-470.0, -80.0, p.y);
  vLocal = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const WATER_FRAGMENT = `
uniform float time;
varying vec2 vUv;
varying vec3 vLocal;
void main() {
  float depth = 1.0 - smoothstep(-540.0, -90.0, vLocal.y);
  vec3 shore = vec3(0.31, 0.52, 0.56);
  vec3 deep = vec3(0.035, 0.15, 0.21);
  vec3 color = mix(shore, deep, depth);
  float waveA = sin(vLocal.x * 0.035 + time * 1.1);
  float waveB = sin(vLocal.x * 0.061 - time * 0.7 + vLocal.y * 0.008);
  float glimmer = pow(max(0.0, waveA * 0.5 + waveB * 0.5), 15.0);
  color = mix(color, vec3(0.76, 0.81, 0.75), glimmer * 0.23);
  gl_FragColor = vec4(color, 1.0);
}`;

const FOG_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FOG_FRAGMENT = `
uniform float opacity;
varying vec2 vUv;
void main() {
  float horizontal = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
  float vertical = exp(-pow((vUv.y - 0.5) * 3.0, 2.0));
  gl_FragColor = vec4(0.79, 0.86, 0.84, horizontal * vertical * opacity);
}`;

function PhotoLayer({ source, x, top, width, order, travel, parallax }: {
  source: string;
  x: number;
  top: number;
  width: number;
  order: number;
  travel: number;
  parallax: number;
}) {
  const loaded = useLoader(THREE.TextureLoader, source);
  const texture = useMemo(() => {
    const copy = loaded.clone();
    copy.colorSpace = THREE.SRGBColorSpace;
    copy.needsUpdate = true;
    return copy;
  }, [loaded]);
  const height = width * texture.image.height / texture.image.width;
  const uniforms = useMemo(() => ({
    map: { value: texture },
    texelSize: { value: new THREE.Vector2(1 / texture.image.width, 1 / texture.image.height) },
  }), [texture]);

  return (
    <mesh
      position={[x + width / 2 - 960 - travel * parallax, 540 - top - height / 2, order * 0.01]}
      renderOrder={order}
    >
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={PHOTO_VERTEX}
        fragmentShader={PHOTO_FRAGMENT}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Atmosphere({ time, travel }: { time: number; travel: number }) {
  const fogs = [
    { x: 180, y: 385, width: 650, alpha: 0.12, rate: 0.12 },
    { x: 850, y: 445, width: 780, alpha: 0.1, rate: 0.08 },
    { x: 1420, y: 355, width: 520, alpha: 0.07, rate: 0.06 },
  ];
  return <>
    <mesh position={[-travel * 0.025, 45, -40]} renderOrder={0}>
      <planeGeometry args={[2600, 900]} />
      <shaderMaterial vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} depthTest={false} depthWrite={false} />
    </mesh>
    {fogs.map((fog, index) => (
      <mesh key={index} position={[fog.x - 960 - travel * fog.rate + Math.sin(time * 0.12 + index) * 22, 540 - fog.y, -20 + index]} renderOrder={index + 1}>
        <planeGeometry args={[fog.width, 54]} />
        <shaderMaterial uniforms={{ opacity: { value: fog.alpha } }} vertexShader={FOG_VERTEX} fragmentShader={FOG_FRAGMENT} transparent depthTest={false} depthWrite={false} />
      </mesh>
    ))}
  </>;
}

function waterGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1160, -95);
  shape.bezierCurveTo(-930, -70, -790, -45, -590, -36);
  shape.bezierCurveTo(-360, -27, -190, 0, 20, -3);
  shape.bezierCurveTo(260, -6, 430, -52, 650, -48);
  shape.bezierCurveTo(830, -42, 1010, -10, 1160, -40);
  shape.lineTo(1160, -560);
  shape.lineTo(-1160, -560);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 64);
}

function Lake({ time, travel }: { time: number; travel: number }) {
  const geometry = useMemo(waterGeometry, []);
  const uniforms = useMemo(() => ({ time: { value: time } }), []);
  uniforms.time.value = time;
  return (
    <mesh geometry={geometry} position={[-travel * 0.82, -50, -8]} renderOrder={5}>
      <shaderMaterial uniforms={uniforms} vertexShader={WATER_VERTEX} fragmentShader={WATER_FRAGMENT} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function Wildlife({ time, travel }: { time: number; travel: number }) {
  const birdGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-15, 3);
    shape.quadraticCurveTo(-7, -6, 0, 0);
    shape.quadraticCurveTo(7, -6, 15, 3);
    shape.quadraticCurveTo(6, -1, 0, 4);
    shape.quadraticCurveTo(-6, -1, -15, 3);
    return new THREE.ShapeGeometry(shape);
  }, []);
  const fishGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(12, 0);
    shape.quadraticCurveTo(0, 8, -12, 0);
    shape.quadraticCurveTo(0, -8, 12, 0);
    shape.moveTo(-11, 0);
    shape.lineTo(-20, 7);
    shape.lineTo(-18, 0);
    shape.lineTo(-20, -7);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  const life = Math.max(0, Math.min(1, (time - 8) / 14));
  const birds = Array.from({ length: 5 }, (_, index) => {
    const x = ((index * 390 - travel * 0.24 + time * (9 + index)) % 2400 + 2400) % 2400 - 1200;
    const y = 540 - (245 + index * 31 + Math.sin(time * 0.72 + index * 2.1) * 9);
    return <mesh key={`bird-${index}`} geometry={birdGeometry} position={[x, y, 10]} rotation={[0, 0, Math.sin(time * 0.8 + index) * 0.07]} scale={0.5 + index * 0.04} renderOrder={9}>
      <meshBasicMaterial color="#253a43" transparent opacity={life * 0.68} depthTest={false} depthWrite={false} />
    </mesh>;
  });
  const fish = Array.from({ length: 7 }, (_, index) => {
    const x = ((index * 315 - travel * 0.86 + time * (index % 2 ? 14 : -10)) % 2300 + 2300) % 2300 - 1150;
    const y = 540 - (690 + (index % 4) * 22 + Math.sin(time + index * 1.7) * 5);
    return <mesh key={`fish-${index}`} geometry={fishGeometry} position={[x, y, -3]} scale={0.5 + (index % 3) * 0.12} renderOrder={6}>
      <meshBasicMaterial color="#092f3b" transparent opacity={life * 0.27} depthTest={false} depthWrite={false} />
    </mesh>;
  });
  return <>{fish}{birds}</>;
}

export function JourneyWorld({ time, speed, maskImage }: { time: number; speed: number; maskImage: string }) {
  const { width, height } = useVideoConfig();
  const travel = time * speed;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        maskImage: `url("${maskImage}")`,
        WebkitMaskImage: `url("${maskImage}")`,
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        orthographic
        camera={{ left: -960, right: 960, top: 540, bottom: -540, near: 0.1, far: 2400, position: [0, 0, 1200] }}
        gl={{ alpha: true, antialias: true }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <Atmosphere time={time} travel={travel} />
        <PhotoLayer source={distantMountains} x={-230} top={225} width={1320} order={4} travel={travel} parallax={0.16} />
        <Lake time={time} travel={travel} />
        <PhotoLayer source={nearSlope} x={-760} top={520} width={1280} order={7} travel={travel} parallax={0.48} />
        <PhotoLayer source={foregroundShore} x={-260} top={600} width={1820} order={8} travel={travel} parallax={0.78} />
        <Wildlife time={time} travel={travel} />
      </ThreeCanvas>
    </div>
  );
}
