# Editable project contract, version 1

The two original demos now declare project-owned clips. No new animation framework is used. Arbitrary React source cannot safely be reverse-engineered into a timeline: editable components must opt into this small data contract.

## Author a project

`npm run create:project -- my-video` creates an editable six-second subtitle project. For existing projects, add `"editTimeline": "edit-timeline.json"` to the manifest. The file is JSON validated by `@motion/sdk/timeline`; its FPS and duration must exactly match the manifest.

```json
{
  "version": 1,
  "fps": 30,
  "durationInFrames": 180,
  "tracks": [
    { "id": "visuals", "name": "Visuals" },
    { "id": "captions", "name": "Subtitles" }
  ],
  "clips": [
    {
      "id": "line-1",
      "trackId": "captions",
      "componentId": "subtitles",
      "label": "Opening",
      "from": 0,
      "durationInFrames": 180,
      "content": { "text": "An idea in motion.", "status": "unverified" },
      "props": {
        "fontSize": 68,
        "color": "#ffffff",
        "x": 50,
        "y": 82,
        "animation": "fade"
      }
    }
  ]
}
```

Clip start is `from`; exclusive end is `from + durationInFrames`. All timeline boundaries are integer frames. Lower tracks in the editor render on top of earlier tracks. Within a track, later entries render on top. Overlap is allowed, not automatically rippled or collision-resolved.

```tsx
import {
  TimelineComposition,
  type EditableVideoProps,
} from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import { subtitleModule } from "@motion/lyrics-sync/component";
import data from "./edit-timeline.json";
export const editorComponents = [subtitleModule];
export default function Video({ timeline }: EditableVideoProps) {
  return (
    <TimelineComposition
      timeline={timeline ?? parseEditTimeline(data)}
      components={editorComponents}
    />
  );
}
```

The optional `timeline` prop carries live editor state. The imported JSON is the saved default used by standalone preview and rendering. **Do not ignore this prop or maintain a second hard-coded timeline.** Saving writes the editable timeline and, when its duration grows, updates `project.json` in the same save operation. Render after saving to use those edits. Existing code-only projects still play but do not acquire editable elements automatically.

The core standalone Text clip is available through **Add Text** without activating a specialized module. Its exact validated JSON fields, Inspector controls and external-agent edit/reload workflow are documented in [Standalone Text clip](STANDALONE_TEXT.md).

## Soundtrack clips

The linked-audio workflow adds an app-owned clip with `componentId: "soundtrack"`, `content.assetId` set to a stable ID from `media.json`, and a duration that covers the selected file. It is visible on a separate Audio track and uses the same frame ruler and playhead as captions. The soundtrack stays fixed at frame zero with its source, track and full audio duration unchanged; moving and trimming are unavailable. The live editor and MP4 renderer resolve and play it through the Remotion transport. The clip contains no host filesystem path. `TimelineComposition` skips soundtrack clips when drawing visual elements; the player and renderer add `TimelineSoundtrackAudio` around the same composition. Projects keep using Timeline v1 and do not need a new audio document. Moving an ordinary editable clip past the current project end extends the editable project duration when saved, subject to the existing maximum duration. Mixing, audio effects and waveform editing are not implemented. See [Project Media Registry](PROJECT_MEDIA.md).

## Declared properties, not editor-specific controls

`EditableComponent` contains `id`, `name`, a React `component({clip})`, a JSON-serializable `fields` list, and optional `timelineBehavior` metadata. Each field declares `key`, `label`, `target` (`content` or `props`), `type`, `default`, and optional min/max/step/options. Supported UI controls: text, number, color, select and boolean. The editor receives only serializable metadata from the isolated preview; renderer functions and behavior functions never cross the bridge.

Timeline behavior IDs are resolved by a static trusted map in the desktop editor. The metadata selects only behavior code already registered by the application; it cannot name or install executable code. Missing behavior metadata uses generic visual editing, except for the documented compatibility fallback for legacy `subtitles` registrations. Unknown IDs also use generic editing. The version-1 timeline format is unchanged and does not persist behavior IDs on clips. Built-in behavior hooks currently cover content changes on trim, duplicate, and declared content fields. Subtitle behavior preserves word offsets and status semantics; generic range edits never infer meaning from fields such as `words` or `status`.

For example, a project-owned component can declare:

```tsx
const title = {
  id: "my-title",
  name: "Project title",
  component: MyTitle,
  fields: [
    {
      key: "headline",
      label: "Headline",
      target: "content" as const,
      type: "text" as const,
      default: "Hello",
    },
  ],
};
// MyTitle reads clip.content.headline; export it in editorComponents.
```

No editor changes are needed for the field to appear. Components must actually consume the declared values; metadata cannot make an arbitrary hard-coded value editable. Project-authored scene components can expose timing only; their internal animation code remains in the project. The editor does not introspect nested JSX.

## The one reusable module: Subtitles / Lyrics

Import `subtitleModule` from `@motion/lyrics-sync/component`. Content is separate from appearance:

- `content.text`: semantic text. `section` and `repeatOf` optionally describe chorus occurrences. Each repeated occurrence has its own clip ID and timing.
- `content.status`: demo, unverified or reviewed; demos remain explicitly synthetic.
- `content.words`: optional `{id,text,start,end}` entries in **seconds relative to clip start**. Negative offsets or offsets beyond the visible end can occur after trimming; they preserve the original spoken positions.
- `props`: fontFamily, fontSize, color, highlightColor, x/y percentage position, animation (`none`, `fade`, `rise`), animationFrames and karaoke boolean. Defaults/ranges live in `subtitleFields`, which generates the panel.

Changing styling does not change synchronization data. Moving a clip shifts with its segment-relative word offsets. Trimming moves only the visible boundary: word offsets adjust at the left edge so absolute word positions stay fixed. Text corrections preserve the clip ID, segment timing, word IDs and word intervals. If the corrected text has the same number of words, the module updates the visible word labels while retaining each interval. If the count changes, the original word intervals remain as timing evidence and karaoke highlighting pauses rather than showing stale word-to-time matches. No replacement timestamps are invented. Duplicate creates an independent repeat with `repeatOf` metadata. Deleting or editing one occurrence does not change another.

## Editing and persistence

Select a clip, drag its body horizontally, or trim using either edge handle. The ruler scrubs the playhead; frame input and ±1 controls provide exact seeks. Play/pause and player events keep the timeline synchronized. Properties are next to the preview and apply immediately without recompiling Electron. Add tracks, move a selected clip between tracks, duplicate/delete clips, and undo/redo.

Save project writes to the project JSON. Unsaved drafts survive switching/reloading in local storage. External file changes refresh clean documents; if the user has a draft, revision conflicts block saving until the user exports it or reloads from disk. Reload from disk discards the current draft. Saves use validated project paths, a 2 MB request cap, shell-origin checks, serialized writes, revision checks and atomic replacement. Code remains behind the existing Electron/browser sandbox boundaries.

The shared Timeline command set is selection, move/trim gesture, copy, cut, paste, duplicate, delete, undo and redo. Copy is kept in the active editor session and paste places the copy at the current playhead; Cut and drag-duplicate each create one undo checkpoint. The editor owns these operations and routes detached-window requests through its existing validated command channel. Trusted `TimelineBehavior` implementations can deny individual operations with an `operations` map, for example `{ move: false, delete: false }`; omitted operations remain enabled. Soundtrack clips are protected from movement, trimming, copy, cut, paste, duplicate and delete. Ctrl/Cmd+C/X/V/D and Ctrl/Cmd+Z/Shift+Z/Y are handled when focus is not in a text-entry control; Delete/Backspace deletes the selected editable clip. Space toggles playback only from the Timeline work area. Selection remains single-clip; group editing is not implemented.

Seeking does not pause active playback. A paused seek stays paused, and selecting a clip does not start an edit gesture or stop playback. Playback uses the single Remotion transport and does not loop. The **Playback ends** control chooses between the last Timeline clip and the full project duration; seeking into the blank tail then playing continues through the project end. This setting only changes preview playback. Saved project duration and MP4 export duration remain unchanged, preserving intentional blank time. The **Timeline review** disclosure shows visual-track gaps of five seconds or longer, including late isolated clips and empty tails. Each entry identifies its track and time range and provides Locate buttons for adjacent clips. These warnings are non-destructive and do not block export. The renderer retains its own structural gap warnings as a command-line check. Gap analysis uses clip ranges; it cannot inspect rendered pixels inside a component.

## Desktop workspace navigation

The Electron shell uses a fixed-height editor workspace: project browser at left, composition canvas and Inspector in the center/right, and a docked multitrack timeline at the bottom. The document does not scroll; the project browser, Inspector and timeline scroll within their own panels. Drag the panel dividers to resize the project browser, Inspector or timeline; widths and timeline height are remembered locally.

Canvas Fit scales the composition to the available preview area. Zoom in/out and Ctrl+mouse-wheel change only the editor view; 100% uses composition pixel dimensions. Space+drag pans the canvas, Reset view restores Fit and Escape exits the fullscreen canvas. These controls do not alter composition props, timeline timing or render resolution. Timeline has Fit, incremental zoom buttons, a zoom selector and Ctrl+mouse-wheel zoom anchored to the pointer when possible. Horizontal scrolling and playhead positioning use the same time ruler in docked and detached windows.

In the Electron app, **Detach Timeline** opens the controlled Timeline in a resizable native window. The primary editor replaces its interactive timeline with an Attach placeholder and retains the Canvas/Preview, Inspector and single EditorSession. The detached view sends selection, seek, clip, subtitle and undo/redo commands to that owner; it never saves a project itself. Snapshots and full-timeline edit commands are validated and capped at 1 MiB, while window-control messages keep their 4 KiB cap. Stale commands are acknowledged as rejected and refresh from the current session. Closing or attaching the child restores the Timeline in its original bottom area. Browser mode does not provide native detachment.

For physical two-display validation, follow the [multi-monitor acceptance checklist](TIMELINE_MULTI_MONITOR_CHECKLIST.md). Automated checks do not verify operating-system display movement, fullscreen behavior on hardware, or recovery after unplugging a monitor.

## Import/export

- Timing JSON: `{version:1,units:"seconds",segments:[{id,start,end,content}]}`. Segment times are absolute seconds; word times are segment-relative. Appearance is excluded. Apply another style to the same data without alignment again.
- Existing canonical lyrics JSON from the transcription worker is accepted; all words in each imported line must have actual/demo boundaries. Untimed data is rejected rather than placed at invented times.
- SRT: line text and start/end survive; word timing/style/repeat metadata do not.
- LRC: starts and text survive, including multiple timestamps for repeated lines. Since LRC has no ends, import derives ends from the next line and the last from project duration, labels the result unverified and displays a notice. Review those ends.
- `*.timeline.json`: complete editable project data including tracks/appearance. Import requires matching manifest FPS/duration.

Subtitle import replaces subtitle clips while preserving scene clips and using the existing subtitle appearance as a default. A timing import outside project duration is rejected. In the live development editor, **Generate Subtitles** sends the selected Media Registry soundtrack to the existing local Whisper worker and imports valid recognized segments directly as unverified subtitle clips; a lyrics file is not required. Missing or out-of-range segment times are reported rather than invented or truncated. For a separate correction workflow using authoritative lyrics or another timing source, use the Lyrics Sync workbench to inspect/reconcile evidence, then export JSON and import it into the editable Timeline. The workbench does not itself write the editor's saved Timeline. Local transcription is unavailable in the built snapshot.

## Deliberate limits

No arbitrary source-to-timeline conversion, nested component/keyframe inspector, waveform, snapping to beats, transitions between clips, time-stretch, ripple editing, multi-selection, track reordering or audio editing. Resize trims visibility; it does not time-stretch animation/audio. The tested contract supports future project-defined elements but does not claim every React component is automatically editable. Built mode uses compiled component code; changing that code still requires rebuilding. Data/property edits can be previewed and saved in either mode.
