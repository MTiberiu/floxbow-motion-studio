# Editable project contract, version 1

The two original demos now declare project-owned clips. No new animation framework is used. Arbitrary React source cannot safely be reverse-engineered into a timeline: editable components must opt into this small data contract.

## Author a project

`npm run create:project -- my-video` creates an editable six-second subtitle project. For existing projects, add `"editTimeline": "edit-timeline.json"` to the manifest. The file is JSON validated by `@motion/sdk/timeline`; its FPS and duration must exactly match the manifest.

Optional scene grouping uses `scenes` and `clip.sceneId` in this same Timeline v1 file. See the [scene editing contract and current workflow](SCENE_EDITING.md); projects that omit these fields remain compatible.

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

The Canvas format is a project setting stored as `width` and `height` in `project.json`. The editor offers 16:9 (1920×1080), 9:16 (1080×1920), 1:1 (1080×1080), and 21:9 ultra-wide (2560×1080). Changing the format updates the canonical manifest with a revision check; Timeline frames and clip properties are preserved. Existing custom dimensions remain valid.

Clip start is `from`; exclusive end is `from + durationInFrames`. All timeline boundaries are integer frames. Overlap is allowed, not automatically rippled or collision-resolved. Within one track, later clips in the JSON render on top of earlier clips.

Tracks may add `kind: "visual" | "audio"`, `visible`, and `locked`. Legacy v1 files omit these fields; tracks containing the built-in soundtrack (and the legacy `audio` ID) are treated as audio, and other legacy tracks are visual. Omitted `trackOrder` preserves the historical JSON-array rendering order exactly. A user action that creates or reorders a visual track converts the order without changing the current rendered result and records `trackOrder: "top-down"`; in that mode, the top visual row renders above lower visual rows. Hidden visual tracks are absent from Canvas, preview and MP4. Locked tracks still render but reject clip edits. Track order and visibility are canonical Timeline data, so they survive save, reload, Undo and Redo.

Dragging an editable visual clip between visual tracks preserves its clip ID, media reference, timing and transform properties. During the drag, the clip label follows the pointer and a valid destination track is highlighted. Dropping onto a hidden track is allowed but the drag preview warns that its clip will remain absent from Canvas, preview and MP4. Video clips keep their registered source and render from their new visual track; audio-only soundtrack clips remain on audio tracks and retain their separate fixed-at-zero contract.

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

The core standalone Text clip is available through **Add Text** without activating a specialized module. PNG assets can be registered in **Media** and placed as first-class Image clips with separate asset/clip IDs. Their JSON fields, Canvas/Inspector controls and external-agent workflows are documented in [Standalone Text](STANDALONE_TEXT.md), [Standalone Image](STANDALONE_IMAGE.md), and [Core Canvas](CANVAS_CORE.md).

The left Media Library's **Organize** workspace stores named image groups and ordered pose/alternative references in optional `assetGroups` metadata on the same canonical Timeline JSON. Character groups with pose members can be placed as one Character clip, with pose changes edited in Inspector and shared Canvas transforms. Scene Moments bookmark scene-local frames and active Character pose-event IDs. See the [Visual Asset Organizer contract](VISUAL_ASSET_ORGANIZER.md) and [Scene editing](SCENE_EDITING.md).

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

Select a clip, drag its body horizontally or vertically to a compatible track, or trim using either edge handle. Dropping above or below the visual stack creates a visual track and moves the clip there. The Inspector Track control can explicitly move a clip to another track of the same type. Add visual/audio tracks, rename them, reorder them with the row arrows, hide or lock visual tracks, and undo/redo these edits. The fixed soundtrack stays at frame zero and spans its full source, but can be moved between unlocked Audio tracks or deleted from the Inspector/Timeline; deleting it is undoable. The Timeline ruler labels readable time in minutes and seconds, uses major marks at 10 seconds with quieter 5-second marks when the current zoom allows, and expands the interval on long fitted projects. Time controls display seconds/milliseconds and convert through project FPS to canonical integer frames. ±1 frame controls remain available for exact stepping. Play/pause and player events keep the Timeline synchronized. Properties are next to the preview and apply immediately without recompiling Electron. Selecting multiple clips with Shift/Ctrl/Cmd or a marquee keeps Canvas, Timeline and Inspector selection synchronized. Group Canvas operations apply only where each selected component declares support; Inspector fields remain per-clip.

Save project writes to the project JSON. Unsaved drafts survive switching/reloading in local storage. External file changes refresh clean documents; if the user has a draft, revision conflicts block saving until the user exports it or reloads from disk. Reload from disk discards the current draft. Saves use validated project paths, a 2 MB request cap, shell-origin checks, serialized writes, revision checks and atomic replacement. Code remains behind the existing Electron/browser sandbox boundaries.

The shared Timeline command set is selection, move/trim gesture, copy, cut, paste, duplicate, delete, undo and redo. Copy is kept in the active editor session and paste places the copy at the current playhead; Cut and drag-duplicate each create one undo checkpoint. Ctrl/Cmd-drag duplicates a Timeline clip and moves the copy; Alt-drag remains an alternate duplicate gesture. When several clips are selected, dragging any selected clip moves the whole selection by one shared time offset and keeps the group selected. Clicking a different clip replaces the selection; clicking empty Timeline space clears it. Shift has no extra movement axis to constrain on the one-dimensional time ruler. The editor owns these operations and routes detached-window requests through its existing validated command channel. Trusted `TimelineBehavior` implementations can deny individual operations with an `operations` map, for example `{ move: false, delete: true }`; omitted operations remain enabled. The fixed soundtrack cannot be shifted in time, trimmed, copied, cut or duplicated; it can be deleted and restored with Undo. Ctrl/Cmd+C/X/V/D and Ctrl/Cmd+Z/Shift+Z/Y are handled when focus is not in a text-entry control; Delete/Backspace deletes the selected editable clips. Space toggles Play/Pause when editor keyboard focus is outside text-entry and control elements. Detached Timeline selection and commands remain routed to the single primary EditorSession.

Seeking does not pause active playback. A paused seek stays paused, and selecting a clip does not start an edit gesture or stop playback. Playback uses the single Remotion transport and does not loop. The **Playback ends** control chooses between the last Timeline clip and the full project duration; pressing Play or Space when the playhead is at or beyond the final content frame restarts from frame 0. Seeking into the blank tail then playing continues through the project end. This setting only changes preview playback. Saved project duration and MP4 export duration remain unchanged, preserving intentional blank time. The **Timeline review** disclosure warns only about intervals with no visual clips on any track, including late isolated content and empty tails. A background or any other visual clip covering an interval suppresses warnings for subtitle spacing beneath it. Each entry identifies the empty time range and provides Locate buttons for adjacent clips. These warnings are non-destructive and do not block export. The renderer retains the same composition-wide visual gap warnings as a command-line check. Gap analysis uses clip ranges; it cannot inspect rendered pixels inside a component.

Timeline duration handles appear only on the primary selected clip, so adjacent unselected clips cannot steal an edge drag. Their hit area is wider than the visible grip; hovering provides a subtle preview without changing selection.

## Desktop workspace navigation

The Electron shell uses a fixed-height editor workspace: project browser at left, composition canvas and Inspector in the center/right, and a docked multitrack timeline at the bottom. The document does not scroll; the project browser, Inspector and timeline scroll within their own panels. Drag the panel dividers to resize the project browser, Inspector or timeline; widths and timeline height are remembered locally.

Canvas Fit scales the composition to the available preview area. Zoom in/out and Ctrl+mouse-wheel change only the editor view; 100% uses composition pixel dimensions. Space+drag pans the canvas, Reset view restores Fit and Escape exits the fullscreen canvas. These controls do not alter composition props, timeline timing or render resolution. Timeline Fit uses the current saved/draft project duration and measured viewport width, so it recalculates after duration changes or resizing and can show the full supported project. Incremental zoom and Ctrl+mouse-wheel remain available, with pointer-anchored zoom where possible. Horizontal scrolling and playhead positioning use the same time ruler in docked and detached windows.

Right-clicking a clip in the docked Timeline or a selectable Canvas object opens a movable context panel. The panel stays open until its close button or Escape is used. It keeps item-specific controls and a full, editable Timeline view scoped to that item's track; other tracks stay hidden while all edits still use the complete project document. Zoom, horizontal navigation, clip move/trim, duplication, play/pause, seek and centering operate on the shared editor session. Text and subtitle items expose their actual text for editing; Image items expose the horizontal flip control.

In the Electron app, **Detach Timeline** opens the controlled Timeline in a resizable native window. The primary editor replaces its interactive timeline with an Attach placeholder and retains the Canvas/Preview, Inspector and single EditorSession. The detached view sends selection, seek, clip, subtitle and undo/redo commands to that owner; it never saves a project itself. Snapshots and full-timeline edit commands are validated and capped at 1 MiB, while window-control messages keep their 4 KiB cap. Stale commands are acknowledged as rejected and refresh from the current session. Closing or attaching the child restores the Timeline in its original bottom area. Browser mode does not provide native detachment.

The track header can add visual or audio rows. Empty rows keep the two track groups separate. Dragging a visual clip into the top or bottom insertion strip creates a new visual row there. The fixed soundtrack can be moved vertically between unlocked audio rows by dragging or choosing **Audio track** in Inspector; its frame-zero start and full-source duration do not change. Selecting a Video clip offers **Separate video audio** when its registered MP4 contains an audio stream. FloxBow creates a separate `video-audio` clip on an Audio track at the same start and source in-point, then mutes the audio inside the Video clip. The new audio clip can be moved, trimmed or deleted independently. Both clips reference the same registered video asset and have separate Timeline clip IDs. The Canvas toolbar's **Application preview volume** control changes all preview audio together and is a local editor preference; it does not change canonical project data or rendered MP4 volume.

For physical two-display validation, follow the [multi-monitor acceptance checklist](TIMELINE_MULTI_MONITOR_CHECKLIST.md). Automated checks do not verify operating-system display movement, fullscreen behavior on hardware, or recovery after unplugging a monitor.

## Import/export

- Timing JSON: `{version:1,units:"seconds",segments:[{id,start,end,content}]}`. Segment times are absolute seconds; word times are segment-relative. Appearance is excluded. Apply another style to the same data without alignment again.
- Existing canonical lyrics JSON from the transcription worker is accepted; all words in each imported line must have actual/demo boundaries. Untimed data is rejected rather than placed at invented times.
- SRT: line text and start/end survive; word timing/style/repeat metadata do not.
- LRC: starts and text survive, including multiple timestamps for repeated lines. Since LRC has no ends, import derives ends from the next line and the last from project duration, labels the result unverified and displays a notice. Review those ends.
- `*.timeline.json`: complete editable project data including tracks/appearance. Import requires matching manifest FPS/duration.

Subtitle import replaces subtitle clips while preserving scene clips and using the existing subtitle appearance as a default. A timing import outside project duration is rejected. In the live development editor, **Generate Subtitles** can use either the Media Registry soundtrack or a video clip on the Timeline. For video, the host extracts audio only from the clip's source in-point and duration; generated cue times are offset by the clip's Timeline start, while word offsets remain relative to their segment. The renderer receives no host path. Recognized segments become unverified editable subtitle clips; a lyrics file is not required. Missing or out-of-range segment times are reported rather than invented or truncated. A video without decodable audio reports an error. For a separate correction workflow using authoritative lyrics or another timing source, use the Lyrics Sync workbench to inspect/reconcile evidence, then export JSON and import it into the editable Timeline. The workbench does not itself write the editor's saved Timeline. Local transcription is unavailable in the built snapshot.

## Deliberate limits

No arbitrary source-to-timeline conversion, nested component/keyframe inspector, waveform, snapping to beats, transitions between clips, or time-stretch. The selected soundtrack remains full-duration at frame zero and cannot be shifted in time or trimmed. Detached video audio uses the same MP4 source and can be moved or trimmed independently; it does not create a copied media file. Spatial Canvas manipulation currently applies to components that declare the shared validated visual contract; Text, Image, Video and subtitles opt in. Other React components are not automatically selectable or transformable until they declare supported geometry and operations. Resize trims clip visibility in the Timeline; it does not time-stretch animation/audio. Built mode uses compiled component code; changing that code still requires rebuilding. Data/property edits can be previewed and saved in either mode.
