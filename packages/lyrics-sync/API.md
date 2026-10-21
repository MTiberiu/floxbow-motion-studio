# Subtitle API

All imports below use supported workspace package exports; consumers should not import another package's `src/` files.

## Editable component

```tsx
import { subtitleModule } from "@motion/lyrics-sync/component";
```

`subtitleModule` is an `EditableComponent` registration with ID `subtitles`, a Remotion component, and serializable `fields`. The fields are the source for the generic Inspector controls:

| Field             | Storage   | Default   | Meaning                                |
| ----------------- | --------- | --------- | -------------------------------------- |
| `text`            | `content` | empty     | Visible segment text                   |
| `fontFamily`      | `props`   | Arial     | Font family                            |
| `fontSize`        | `props`   | 68        | Size in composition pixels, 12–220     |
| `color`           | `props`   | `#ffffff` | Base text color                        |
| `highlightColor`  | `props`   | `#c5f18a` | Active karaoke word color              |
| `x`, `y`          | `props`   | 50%, 82%  | Text center in composition coordinates |
| `animation`       | `props`   | none      | `none`, `fade`, or `rise`              |
| `animationFrames` | `props`   | 12        | Entrance/exit span, 1–120 frames       |
| `karaoke`         | `props`   | true      | Highlight matching timed words         |

## Editable timeline data

The project's `edit-timeline.json` is the canonical saved timeline. Each segment is a regular `TimelineClip` with `componentId: "subtitles"`, integer `from` and `durationInFrames`, semantic `content`, and visual `props`. The frame range is authoritative for segment start/end. `content.words` optionally stores word intervals in seconds relative to the clip start; moving and trimming use the shared timeline helper to preserve absolute spoken positions.

## Project data stages

These stages have different purposes and do not create competing editable timelines:

1. **Original lyrics** are user-provided text. `fromLyrics(text)` can represent them as `LyricTimeline` words with unknown (`null`) times.
2. **Raw transcription** is imported recognizer output with observed text and optional timestamps. It is input to `reconcile`; it is not the user's corrected lyric text.
3. **Proposed timing evidence** is `LyricTimeline`: original lyric words matched to imported estimates, with confidence, source and review status. It may be stored as project timing data while being reviewed.
4. **Final editable subtitles** are the `subtitles` clips in `edit-timeline.json`. This is the single saved source the editor and renderer consume. Import converts proposed timing into these clips; changing visual props never changes the timing source, and there is no second autosaved subtitle timeline.

The app does not currently persist a raw transcript automatically, call a transcription service, or promote proposed timings into final clips without an explicit import.

```ts
import {
  createSubtitleClip,
  correctSubtitleText,
} from "@motion/lyrics-sync/subtitles";
```

- `createSubtitleClip({id, trackId, from, durationInFrames, content, props?})` creates a validated clip while preserving the supplied stable ID.
- `correctSubtitleText(content, text)` corrects labels without shifting or deleting intervals. When current labels match the text and token counts match, it retains word IDs/times and updates their text. If tokens no longer match their intervals, it retains old intervals as evidence and does not reassign them on a later text change.
- `subtitleWordTimingMatchesText(content)` tells renderers whether per-word intervals still correspond to visible text. The component pauses karaoke highlighting when they do not.
- `subtitleContentSchema` and `subtitleTimingSchema` validate the persisted subtitle payloads.
- `subtitleClips(data, timeline, trackId, props?)` converts seconds-based timing JSON into frame clips, rejecting out-of-project ranges.
- `exportSubtitles(timeline)` exports subtitle semantics and timing without visual props.

## Timing interchange

`SubtitleTiming` has `version: 1`, `units: "seconds"` and ordered `segments`. Segment `start`/`end` are absolute seconds; optional word `start`/`end` values are relative to the segment. Import/export functions are `importSubtitles(text, format, durationSeconds)`, `subtitlesToSRT(data)` and `subtitlesToLRC(data)`. JSON preserves IDs, sections, repeats and word intervals. SRT preserves segment boundaries and text. LRC preserves starts and text; its ends are inferred on import.

Repeated choruses are separate segments with their own IDs and times. `content.repeatOf` points to the earlier segment; it is descriptive metadata and does not link or synchronize the clips.

## Rendering and dependencies

`Subtitles` renders in Remotion's frame context; `subtitleModule.component` is registered by the project composition and is shared by preview and renderer. Runtime dependencies are React, Remotion, `@motion/sdk/timeline`, and the lyric timing package. Subtitle text is white by default with a subtle shadow; the component stays transparent so it can overlay video. A containing composition can use a black background for the simple white-on-black starter appearance.

There is no transcription or forced alignment here. A word-count-changing text correction retains old timing as evidence and pauses karaoke highlighting until matching intervals are supplied. SRT/LRC cannot carry all JSON metadata. Import and export are explicit editor actions.
