# Create a video

The desktop app opens to the **Project Library**. Search and organize local projects there, open a project to enter its workspace, or create one with a canvas format (16:9, 9:16, 1:1 or 21:9). Project cards use the first image clip on the saved Timeline as a thumbnail when one exists. Inside a project, use **Projects** to return to the library; the app warns before leaving when Timeline or Storyboard edits are unsaved. The **Assets** button opens the project's media panel when needed.

In the Project Library, **Delete** permanently removes the selected project's entire folder, including its Timeline, Storyboard and local media. FloxBow asks for confirmation before deleting. Project creation, deletion and editing are available in the live development workspace; a built snapshot is read-only.

Creating a project makes an empty project with an editable Timeline and local `assets/`, `scenes/` and `timing/` folders. The same scaffold is available from the CLI:

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

The scaffold is the default project shape. Its `project.json` points `editTimeline` to `edit-timeline.json`, and its composition consumes the live Timeline prop while using the saved JSON as the standalone preview/render fallback:

```tsx
import { Canvas } from "@motion/sdk";
import {
  TimelineComposition,
  type EditableVideoProps,
} from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import savedTimeline from "./edit-timeline.json";

export const editorComponents = [subtitleModule];

export default function Video({
  timeline,
  imageSources,
  videoSources,
}: EditableVideoProps) {
  return (
    <Canvas background="#000000" style={{ padding: 0 }}>
      <TimelineComposition
        timeline={timeline ?? parseEditTimeline(savedTimeline)}
        components={editorComponents}
        imageSources={imageSources}
        videoSources={videoSources}
      />
    </Canvas>
  );
}
```

Run `npm run dev`, select your project, and edit the composition. It is automatically transformed by Vite. New folders appear within roughly two seconds. Do not add central imports. For compile errors, fix the entry and reload preview if needed; switching to another project remains available. Small reusable-module demonstrations live in `examples/capabilities/` and the Capabilities Explorer; do not copy example content into a user project unless it is intended for that video.

The live `timeline` prop is the editor's authoritative draft; do not replace it with a second hard-coded timeline. Build elements that must be edited as actual Timeline clips using components declared in `editorComponents`. Only fields declared by a registered `EditableComponent` appear as Inspector controls, and those controls work only when the component reads the values. `KineticText`, `Fade` and other composition-level components remain useful for custom animation, but their React props are not automatically editable in the Timeline. Keep custom animation logic in the composition where appropriate; disclose any requested property that will remain code-only before promising it as editable.

For a simple title or other standalone text, use the core **Add Text** clip. Its saved JSON contract and external-agent editing workflow are documented in [Standalone Text clip](STANDALONE_TEXT.md). It is available in the default scaffold and does not require adding a specialized module.

For project-local images used by custom React composition code, import the file and render `<Img src={photo}/>`; that direct import is code-driven. For a first-class editable image, register a PNG in the left **Media Library** and choose **Add**, or drag it onto Canvas or a visual Timeline track. The resulting clip has its own timing and Inspector transform fields while referencing the stable asset ID. See [the Image clip contract](STANDALONE_IMAGE.md) and [Core Canvas interaction](CANVAS_CORE.md). For a linked song or narration in the editor, register an MP3/WAV in the left **Media Library** and choose **Soundtrack**. FloxBow creates a visible Audio-track clip, extends project duration as needed, and saves it with the editable Timeline. The starter composition passes its live Timeline to `TimelineComposition`; the preview and MP4 renderer attach the registered soundtrack to the same frame-based transport and render pipeline. The original media stays at its source path. See [Project Media Registry](PROJECT_MEDIA.md) and [Timeline Editor](TIMELINE_EDITOR.md).

For ordinary video, register an MP4 with **Add Video**, then choose **Add** or drag it to Canvas/a visual Timeline track. The clip is independently timed and uses the shared Canvas transforms; the Inspector supports source in-point, duration via Timeline trim, transform, fit, opacity and embedded clip volume. Preview and MP4 rendering resolve the same registered asset ID. See [Standalone Video](STANDALONE_VIDEO.md). Independent audio-only clips and flexible audio timing/mixing are not implemented; the separate soundtrack remains fixed at frame zero.

For a composition that owns audio directly, `Narration` from `@motion/audio` remains available with a project-local imported asset. Direct composition audio is independent from Media Registry soundtrack selection; do not add the same audio through both routes. Include attribution and license in the project README.

For subtitles from music, choose the project soundtrack or a video clip on the Timeline in **Transcribe from**, then click **Generate Subtitles** in the live development editor. For a video, only the selected clip's embedded audio and source range are analyzed; generated times begin at that clip's Timeline position. The existing local Whisper worker proposes unverified segment text and timing without requiring a lyrics file. Review the text and clips on the Timeline and Canvas, correct them, save, then render with `npm run render -- <project-id>`. Missing, invalid, or out-of-project timestamps are reported and never invented or silently truncated. Whisper may misrecognize singing; a later external AI correction is user-initiated and must work from the documented project JSON and APIs. If browser playback is blocked, allow sound for FloxBow and press Play again. Physical verification should include listening through the computer's normal output; automated checks verify playback state and non-silent decoded MP4 audio but cannot confirm the user's speakers or perceived mix.

Before delivery, run validation, typecheck and tests as applicable. In the actual editor, verify Timeline visibility, clip selection, the promised Inspector controls, a Canvas update after editing, and save/reload behavior. Use automated UI tools where available; otherwise state what still needs manual verification. Inspect representative frames and render a still or MP4 when requested. Report missing assets, unsupported features, and any values that remain code-only. Keep observed timing separate from editorial estimates. Built snapshot users run `npm run build` again after changes.
