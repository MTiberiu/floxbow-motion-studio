import { ThreeCanvas } from "@remotion/three";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/** Small real-time preview demonstrating frame-deterministic Three.js in Remotion. */
export function ThreeSceneExample() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const turn = interpolate(frame, [0, 180], [0, Math.PI * 2], {
    extrapolateRight: "extend",
  });
  const pulse = 1 + Math.sin((frame / 180) * Math.PI * 4) * 0.08;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [0, 0, 4.5], fov: 42 }}
      style={{ background: "#101725" }}
    >
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <mesh rotation={[turn * 0.55, turn, turn * 0.2]} scale={pulse}>
        <boxGeometry args={[1.55, 1.55, 1.55]} />
        <meshStandardMaterial color="#ef7845" roughness={0.28} metalness={0.22} />
      </mesh>
      <mesh rotation={[0, -turn * 0.35, 0]} position={[0, 0, -1.25]}>
        <torusGeometry args={[1.35, 0.035, 12, 96]} />
        <meshStandardMaterial color="#c5f18a" emissive="#4d6b2d" />
      </mesh>
    </ThreeCanvas>
  );
}
