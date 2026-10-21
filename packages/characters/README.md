# @motion/characters — Mascot 2.5D

**Module ID:** `mascot-2p5d`. A reusable, SVG-based Remotion `EditableComponent` with deterministic idle, walk, jump and dance poses, body/accent color, position, scale, movement speed and optional comic speech bubble.

## Public API
Import `mascotModule` and `MascotTimelineComposition` from `@motion/characters`. Use the wrapper instead of `TimelineComposition` for compositions with linked speech: it provides the authoritative live `EditTimeline` to the mascot. Register `mascotModule` alongside `subtitleModule` in `editorComponents`. Keep `timeline ?? parseEditTimeline(data)` as source of truth.

From `@motion/characters/actions`: `addMascot(timeline,{id,trackId,from,durationInFrames,label?,props?})`, `removeMascot(timeline,id)`, `mascotPropsSchema`, `speechAtFrame(timeline,subtitleClipId,absoluteFrame)`. Both operations return validated copies, never mutate the source. IDs/tracks and ranges must satisfy timeline v1.

## Editor / AI extension
A clip has `componentId:"mascot-2p5d"`, empty `content`, and `props` including `motion:"dance"`, `color:"#76d4ec"`, `accent:"#f8c86d"`, `x:50`, `y:58`, `scale:1`, `speed:1`, `speechClipId:"hello"`, `bubble:true`. The editor's existing generic inspector handles all fields. Agent workflow: read the module index and registry, call `addMascot` against the project timeline or author an equivalent validated clip, register module explicitly, then save; never inject shell UI or fabricate audio/subtitle times.

### Speech timing
`speechClipId` points to an existing `subtitles` clip ID. The speech interval is exactly `[subtitle.from, subtitle.from+durationInFrames)`, using absolute project frames. If word timing is present, the active word additionally drives the mouth. With only segment timing, an intentionally stylized mouth oscillation is used. A missing reference leaves the mouth closed and bubble hidden. The text shown is subtitle content, not copied into mascot props. Editing/moving the subtitle updates rendering without duplicating timestamps. Demo timing is synthetic and marked as such.

### Limits
SVG motion is deliberately stylized rather than skeletal 3D, with no walk-path keyframes, facial phonemes, audio hookup, automatic new-clip button, per-limb editor controls or agent chat UI. Clip bounds and generic undo/redo/saving are inherited from SDK v1. Only one speech reference per character clip; multiple simultaneous lines require separate clips or a future resolver. No new timeline schema or bridge messages.
