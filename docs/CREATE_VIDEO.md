# Create a video

```sh
npm run create:project -- solar-system
```

Edit `projects/solar-system/project.json` to set name, type, resolution, fps, duration and entry. Required fields:

```json
{"id":"solar-system","name":"Solar System","type":"explainer","width":1920,"height":1080,"fps":30,"durationInFrames":300,"entry":"Composition.tsx","sdkVersion":"0.1.0"}
```

`type` is explainer, lyrics or custom. Optional fields: description, timeline and audio (project-relative files). IDs equal directory names; absolute paths, traversal and backslashes are rejected. The executable schema is `packages/project-loader/src/schema.ts`.

```tsx
import {Canvas, Scene, Fade} from '@motion/sdk';
import {KineticText, ChatBubble} from '@motion/animations';
export default function Video() {
  return <>
    <Scene from={0} duration={150}><Canvas><Fade><KineticText text="Our solar system"/></Fade></Canvas></Scene>
    <Scene from={150} duration={150}><Canvas><ChatBubble text="Eight planets. One star."/></Canvas></Scene>
  </>;
}
```

Run `npm run dev`, choose Solar System, and edit the composition. It is automatically transformed by Vite. New folders appear within roughly two seconds. Do not add central imports. For compile errors, fix the entry and reload preview if needed; switching to another project remains available.

Import media directly: `import photo from './assets/photo.png'`, then `<Img src={photo}/>` from the SDK. For audio use `import narration from './assets/narration.wav'` and `<Narration src={narration}/>` from `@motion/audio`. These URLs are supported by the preview and Remotion bundler. Declaring `audio` in the manifest validates existence but does not automatically play it; the composition controls playback. Include attribution and license in the project README.

Before delivery: validate, typecheck, inspect scenes, render a still or MP4, and report any missing narration/assets. Keep actual timing separate from editorial estimates. Built snapshot users run `npm run build` again after changes.
