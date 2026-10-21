# Editable project contract, version 1

The two original demos now declare project-owned clips. No new animation framework is used. Arbitrary React source cannot safely be reverse-engineered into a timeline: editable components must opt into this small data contract.

## Author a project

`npm run create:project -- my-video` creates an editable six-second subtitle project. For existing projects, add `"editTimeline": "edit-timeline.json"` to the manifest. The file is JSON validated by `@motion/sdk/timeline`; its FPS and duration must exactly match the manifest.

```json
{
  "version": 1,
  "fps": 30,
  "durationInFrames": 180,
  "tracks": [{"id":"visuals","name":"Visuals"},{"id":"captions","name":"Subtitles"}],
  "clips": [{
    "id":"line-1","trackId":"captions","componentId":"subtitles","label":"Opening",
    "from":0,"durationInFrames":180,
    "content":{"text":"An idea in motion.","status":"unverified"},
    "props":{"fontSize":68,"color":"#ffffff","x":50,"y":82,"animation":"fade"}
  }]
}
```

Clip start is `from`; exclusive end is `from + durationInFrames`. All timeline boundaries are integer frames. Lower tracks in the editor render on top of earlier tracks. Within a track, later entries render on top. Overlap is allowed, not automatically rippled or collision-resolved.

```tsx
import {TimelineComposition, type EditableVideoProps} from '@motion/sdk/editor';
import {parseEditTimeline} from '@motion/sdk/timeline';
import {subtitleModule} from '@motion/lyrics-sync/component';
import data from './edit-timeline.json';
export const editorComponents = [subtitleModule];
export default function Video({timeline}: EditableVideoProps) {
  return <TimelineComposition timeline={timeline ?? parseEditTimeline(data)} components={editorComponents}/>;
}
```

The optional `timeline` prop carries live editor state. The imported JSON is the saved default used by standalone preview and rendering. **Do not ignore this prop or maintain a second hard-coded timeline.** Saving writes only the manifest's project JSON file. Render after saving to use those edits. Existing code-only projects still play but do not acquire editable elements automatically.

## Declared properties, not editor-specific controls

`EditableComponent` contains `id`, `name`, a React `component({clip})`, and a JSON-serializable `fields` list. Each field declares `key`, `label`, `target` (`content` or `props`), `type`, `default`, and optional min/max/step/options. Supported UI controls: text, number, color, select and boolean. The editor receives only metadata from the isolated preview; it never executes a project's UI functions.

For example, a project-owned component can declare:

```tsx
const title = {
  id: 'my-title', name: 'Project title', component: MyTitle,
  fields: [{key:'headline', label:'Headline', target:'content' as const,
    type:'text' as const, default:'Hello'}]
};
// MyTitle reads clip.content.headline; export it in editorComponents.
```

No editor changes are needed for the field to appear. Components must actually consume the declared values; metadata cannot make an arbitrary hard-coded value editable. The existing tutorial scenes expose timing only. Their internal animation code remains in the project; this milestone does not pretend to introspect nested JSX.

## The one reusable module: Subtitles / Lyrics

Import `subtitleModule` from `@motion/lyrics-sync/component`. Content is separate from appearance:

- `content.text`: semantic text. `section` and `repeatOf` optionally describe chorus occurrences. Each repeated occurrence has its own clip ID and timing.
- `content.status`: demo, unverified or reviewed; demos remain explicitly synthetic.
- `content.words`: optional `{id,text,start,end}` entries in **seconds relative to clip start**. Negative offsets or offsets beyond the visible end can occur after trimming; they preserve the original spoken positions.
- `props`: fontFamily, fontSize, color, highlightColor, x/y percentage position, animation (`none`, `fade`, `rise`), animationFrames and karaoke boolean. Defaults/ranges live in `subtitleFields`, which generates the panel.

Changing styling does not change synchronization data. Moving a clip shifts its words with the clip. Trimming moves only the visible boundary: word offsets adjust at the left edge so absolute word positions stay fixed. Text editing clears only that clip's old word timing, with an explicit notice; it never fabricates replacement timestamps. Duplicate creates an independent repeat with `repeatOf` metadata. Deleting or editing one occurrence does not silently change another.

## Editing and persistence

Select a clip, drag its body horizontally, or trim using either edge handle. The ruler scrubs the playhead; frame input and ±1 controls provide exact seeks. Play/pause and player events keep the timeline synchronized. Properties are next to the preview and apply immediately without recompiling Electron. Add tracks, move a selected clip between tracks, duplicate/delete clips, and undo/redo.

Save project writes to the project JSON. Unsaved drafts survive switching/reloading in local storage. External file changes refresh clean documents; if the user has a draft, revision conflicts block saving until the user exports it or reloads from disk. Reload from disk discards the current draft. Saves use validated project paths, a 2 MB request cap, shell-origin checks, serialized writes, revision checks and atomic replacement. Code remains behind the existing Electron/browser sandbox boundaries.

## Import/export

- Timing JSON: `{version:1,units:"seconds",segments:[{id,start,end,content}]}`. Segment times are absolute seconds; word times are segment-relative. Appearance is excluded. Apply another style to the same data without alignment again.
- Existing canonical lyrics JSON from the transcription worker is accepted; all words in each imported line must have actual/demo boundaries. Untimed data is rejected rather than placed at invented times.
- SRT: line text and start/end survive; word timing/style/repeat metadata do not.
- LRC: starts and text survive, including multiple timestamps for repeated lines. Since LRC has no ends, import derives ends from the next line and the last from project duration, labels the result unverified and displays a notice. Review those ends.
- `*.timeline.json`: complete editable project data including tracks/appearance. Import requires matching manifest FPS/duration.

Subtitle import replaces subtitle clips while preserving scene clips and using the existing subtitle appearance as a default. A timing import outside project duration is rejected. Use the old Lyrics sync tab to inspect/reconcile raw source timing, then export JSON and import it into the editable timeline. That source inspector does not directly modify the saved editable project.

## Deliberate limits

No arbitrary source-to-timeline conversion, nested component/keyframe inspector, waveform, snapping to beats, transitions between clips, time-stretch, ripple editing, multi-selection, track reordering or audio editing. Resize trims visibility; it does not time-stretch animation/audio. The tested contract supports future project-defined elements but does not claim every React component is automatically editable. Built mode uses compiled component code; changing that code still requires rebuilding. Data/property edits can be previewed and saved in either mode.
