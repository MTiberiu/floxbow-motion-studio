# Three.js in FloxBow

FloxBow uses Remotion's official Three.js integration package `@remotion/three` with React Three Fiber and Three.js. Project code imports the official package directly; this does not add a plugin loader or change the Timeline schema.

```tsx
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";

export function Scene3D() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 5] }}>
      <ambientLight intensity={0.7} />
      <mesh rotation={[frame / 60, frame / 45, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ef7845" />
      </mesh>
    </ThreeCanvas>
  );
}
```

`ThreeCanvas` requires explicit width and height and WebGL. Drive every animated value from Remotion's frame and video configuration. Do not animate with `useFrame`, timers, `requestAnimationFrame`, or unseeded randomness: deterministic frame-based values are what make seeking and offline rendering agree. Follow Remotion's `@remotion/three` documentation for asynchronous textures and renderer-specific details.

The scene is composition code rendered by the Remotion preview and renderer. This initial integration does not turn Three.js objects into independent Timeline clips or Inspector controls; existing 2D Canvas transform contracts do not apply to a WebGL scene graph. WebGL availability in the preview/render environment is required.

The capability preview and source example are in `examples/capabilities/threejs.tsx`. Import `THREE` from `three` for Three.js classes, and keep any additional browser-safe geometry/material modules explicit in project code.

## Pinned dependencies

The adapter pins `@remotion/three` 4.0.537 to the workspace's Remotion version, React Three Fiber 9.1.2 for React 19, and Three.js 0.171.0. `@types/three` supplies TypeScript declarations. Keep all Remotion packages on the same exact version when updating them.

## Licensing

The selected `@remotion/three`, React Three Fiber, Three.js and `@types/three` packages are MIT-licensed. Remotion itself has separate licensing terms; see [Dependency review](DEPENDENCIES.md) before distributing FloxBow or using Remotion commercially.
