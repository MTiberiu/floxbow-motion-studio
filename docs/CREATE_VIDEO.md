# Create a video

The editor starts without bundled user videos. Click **Create Project** to make an empty project with an editable timeline and local `assets/`, `scenes/` and `timing/` folders. The same scaffold is available from the CLI:

```sh
npm run create:project -- my-video
```

The scaffold creates `projects/my-video/`. Edit its `project.json` to set name, type, resolution, FPS, duration and entry. Required fields:

```json
{
  "id": "solar-system",
  "name": "Solar System",
  "type": "explainer",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationInFrames": 300,
  "entry": "Composition.tsx",
  "sdkVersion": "0.1.0"
}
```

`type` is explainer, lyrics or custom. Optional fields: description, timeline and audio (project-relative files). IDs equal directory names; absolute paths, traversal and backslashes are rejected. The executable schema is `packages/project-loader/src/schema.ts`.

Project folders are ignored by Git by default so personal scripts and media are not accidentally published with the framework. To deliberately version a project in this repository, use `git add -f projects/<project-id>` and review the files before committing. Prefer a separate repository when a project needs its own access, history or publication lifecycle. `projects/.gitkeep` preserves the empty folder in a fresh checkout.

```tsx
import { Canvas, Scene, Fade } from "@motion/sdk";
import { KineticText } from "@motion/animations";
export default function Video() {
  return (
    <Scene from={0} duration={180}>
      <Canvas>
        <Fade>
          <KineticText text="Replace with your own title" />
        </Fade>
      </Canvas>
    </Scene>
  );
}
```

Run `npm run dev`, select your project, and edit the composition. It is automatically transformed by Vite. New folders appear within roughly two seconds. Do not add central imports. For compile errors, fix the entry and reload preview if needed; switching to another project remains available. Small reusable-module demonstrations live in `examples/capabilities/` and the Capabilities Explorer; do not copy example content into a user project unless it is intended for that video.

For project-local images, import `import photo from './assets/photo.png'` and render `<Img src={photo}/>` from the SDK. For a linked song or narration in the editor, register an MP3/WAV in **Media** and choose **Use as soundtrack**. FloxBow creates a visible Audio-track clip, extends project duration as needed, and saves it with the editable Timeline. The starter composition passes its live Timeline to `TimelineComposition`; the preview and MP4 renderer attach the registered soundtrack to the same frame-based transport and render pipeline. The original audio stays at its source path. See [Project Media Registry](PROJECT_MEDIA.md) and [Timeline Editor](TIMELINE_EDITOR.md).

For a composition that owns audio directly, `Narration` from `@motion/audio` remains available with a project-local imported asset. Direct composition audio is independent from Media Registry soundtrack selection; do not add the same audio through both routes. Include attribution and license in the project README.

For a first subtitle music video, register the song, choose it as soundtrack, add or import subtitle clips on Captions, correct and preview them against the sound, save, then render with `npm run render -- <project-id>`. The current release does not transcribe lyrics or invent aligned timing. Provide reviewed timing data; the local Whisper workflow and AI-assisted correction are a separate next phase. If browser playback is blocked, allow sound for FloxBow and press Play again. Physical verification should include listening through the computer's normal output; automated checks verify playback state and non-silent decoded MP4 audio but cannot confirm the user's speakers or perceived mix.

Before delivery: validate, typecheck, inspect scenes, render a still or MP4, and report any missing narration/assets. Keep actual timing separate from editorial estimates. Built snapshot users run `npm run build` again after changes.
