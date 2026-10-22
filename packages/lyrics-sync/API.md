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
- `whisperResultToSubtitleTiming(result, durationSeconds)` converts the existing Whisper response's `segments` into `SubtitleTiming`. It returns `{ timing, skippedSegments, outOfRangeSegments, unusableWordTimings }`. Segment text and valid absolute segment boundaries are retained as received; valid Whisper word boundaries are converted to clip-relative seconds. Generated content is always `unverified`. This pure function does not run Whisper, reconcile lyrics, repair timestamps, or verify recognition.

## Reusable subtitle cues

The cue API derives read-only data from the project's authoritative `EditTimeline`. It has no React, Electron, EditorSession, persistence, or registry dependency.

```ts
import {
  getSubtitleCues,
  selectSubtitleCues,
  type SubtitleCue,
  type SubtitleCueSelection,
} from "@motion/lyrics-sync/subtitles";
import type { EditTimeline } from "@motion/sdk/timeline";

const cues = getSubtitleCues(timeline);
const heroCues = selectSubtitleCues(cues, {
  kind: "consumer",
  consumerId: "hero-01",
});
```

Public types are `SubtitlePresentation` (`caption | bubble | both | hidden`), `SubtitleConsumerId`, `SubtitleCueWord`, `SubtitleCue`, and `SubtitleCueSelection`. A cue contains the source clip `id`, text, absolute segment `start`/exclusive `end` in seconds, review `status`, optional `speakerId`, resolved `presentation`, optional `consumerIds`, optional absolute word times, and `wordTimingStatus` (`absent | matches-text | text-mismatch`). Cues are returned chronologically; overlaps and repeated segments stay independent.

`getSubtitleCues(timeline: EditTimeline)` includes every subtitle clip, including hidden cues. `selectSubtitleCues(cues, {kind: "caption"})` returns only `caption` and `both` cues. `selectSubtitleCues(cues, {kind: "consumer", consumerId})` applies supplemental routing and returns all presentation modes, including hidden cues for nonvisual animation. Consumer code must honor `presentation` before drawing text.

The routing fields have separate meanings:

| Field | Meaning |
| --- | --- |
| `speakerId` | Stable project-local identity of who is speaking; it does not select recipients. |
| `presentation` | Which visual text modes are permitted. The built-in renderer draws `caption` and `both`; bubble consumers may draw `bubble` and `both`; `hidden` permits no visual text. |
| `consumerIds` | Supplemental consumer instance allow-list. Omitted means broadcast to any consumer selecting cues; `[]` routes to none; a populated list routes only to matching IDs. |

Explicit `consumerIds` never suppress ordinary caption delivery. Caption selection depends only on `presentation`. For example, `presentation: "both", consumerIds: []` still renders a caption and routes to no supplemental consumers. A `hidden` cue can still be selected by a routed consumer for nonvisual animation, but this API cannot enforce that consumer's rendering behavior.

Consumer IDs are stable, project-local instance IDs, not module type names. Two instances of one module can use IDs such as `hero-01` and `hero-02`. IDs must match `[A-Za-z0-9_-]+`, be at most 100 characters, and be unique within a cue. A cue supports at most 32 consumer IDs. IDs are not checked against a registry; unknown or unavailable IDs are preserved and simply do not match a different consumer's selection. Invalid IDs, duplicate IDs, or excess assignments fail subtitle validation.

For legacy content without `presentation`, cues resolve to `caption`. Missing `consumerIds` resolves to broadcast. Word times are converted from clip-relative offsets to absolute project seconds by adding the clip's absolute start. Trimming may leave a word outside the visible segment range; the API preserves that timing and never clamps or fabricates it. `matches-text` means the stored word labels correspond to visible text, not that synchronization was independently verified. `text-mismatch` preserves the intervals as evidence but tells consumers not to use them for word-synchronized behavior. Malformed word intervals fail schema validation; absent timing is reported as `absent`.

JSON timing import/export preserves speaker, presentation and routing fields. SRT and LRC do not encode these fields and retain their existing metadata-loss limitations. Timeline v1 and project persistence are unchanged.

## Timing interchange

`SubtitleTiming` has `version: 1`, `units: "seconds"` and ordered `segments`. Segment `start`/`end` are absolute seconds; optional word `start`/`end` values are relative to the segment. Import/export functions are `importSubtitles(text, format, durationSeconds)`, `subtitlesToSRT(data)` and `subtitlesToLRC(data)`. JSON preserves IDs, sections, repeats and word intervals. SRT preserves segment boundaries and text. LRC preserves starts and text; its ends are inferred on import.

Repeated choruses are separate segments with their own IDs and times. `content.repeatOf` points to the earlier segment; it is descriptive metadata and does not link or synchronize the clips.

### Direct Whisper import

`whisperResultToSubtitleTiming` accepts the raw object returned by the existing OpenAI Whisper adapter. A segment is skipped if it has no usable text and finite `start`/`end` values, if `end <= start`, or if it extends beyond the supplied project duration. Overlong results above 3,000 segments fail instead of being truncated. No replacement timing is inferred. If a segment's word list contains invalid or out-of-segment intervals, its segment caption is kept and that segment's word timings are omitted; the returned count makes this visible. If Whisper supplies no words, the word-timing issue count stays zero. The caller can pass the returned `timing` to `subtitleClips` and must surface the counts to the user.

The editor's **Generate Subtitles** action selects only the asset ID from the existing soundtrack clip. The host resolves that ID through the Media Registry and runs Python/Whisper; local paths never enter the renderer. The response is bounded and validated before use. The editor converts it to frame clips and applies one EditorSession edit, so Undo and the existing save path remain authoritative. Existing subtitle clips require confirmation before replacement; other tracks and clips are preserved. Whisper output is a draft, including on successful transcription. Music recognition accuracy is not verified by this API.

## Rendering and dependencies

`Subtitles` renders in Remotion's frame context; `subtitleModule.component` is registered by the project composition and is shared by preview and renderer. It draws text for `caption` and `both`, and returns no text for `bubble` or `hidden`. Runtime dependencies are React, Remotion, `@motion/sdk/timeline`, and the lyric timing package. Subtitle text is white by default with a subtle shadow; the component stays transparent so it can overlay video. A containing composition can use a black background for the simple white-on-black starter appearance.

There is no forced alignment or AI lyric correction here. A word-count-changing text correction retains old timing as evidence and pauses karaoke highlighting until matching intervals are supplied. SRT/LRC cannot carry all JSON metadata. Transcription runs only when the user starts it in the live development editor and uses the locally installed Whisper model; it does not download a model.

The cue API does not provide a consumer registry, assignment UI, speaker directory, speech-bubble renderer, character animation, lip-sync, confidence scoring, or synchronization verification. Projects or AI agents can author `speakerId` and `consumerIds` in subtitle semantic content; an editor assignment menu is future work.
