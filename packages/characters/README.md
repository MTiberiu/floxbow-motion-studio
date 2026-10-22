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

## Motion Composer experiment
`composeMascotDance(timeline, {idPrefix,trackId,startFrame,steps,props})` creates one ordinary editable mascot clip per step. Steps accept `motion` (`idle`, `walk`, `jump`, `dance`, `spin`, `wave`), `durationInFrames`, optional X/Y position, speed and label. Agents can compose dances without modifying JSX or the shell. Clip IDs are deterministic (`prefix-1`, `prefix-2`, etc.); validation rejects duplicate IDs, missing tracks and out-of-range durations. The returned document is immutable. X/Y are per-step positions, not continuous interpolated paths; scene-to-scene transitions currently cut. Edit resulting clips with the existing inspector, drag/trim and save. The example project intentionally ships only a baseline dance: a coding agent must author any requested multi-step choreography into its project-owned JSON.

## Position paths (experimental)
A mascot clip optionally declares `startX`, `endX`, `startY`, `endY` (percent of scene; -40 to 140 allows entry/exit outside the frame) and `easing: 'linear' | 'ease-in-out'`. When absent, legacy `x/y` remain static. Motion is interpolated deterministically over frames 0..duration-1, while the motion preset animates the limbs. `composeMascotDance` accepts a step `endX/endY` and carries its final destination forward to the next step; optional step `x/y` deliberately overrides the inherited start. To make a scene: walk from x=-20 to 40; jump in place; walk to 65; dance; walk to 130. All data lives in the *project's JSON*, not in shared module code. The demo project intentionally remains a single dancing clip so an external AI agent can build the story. No physics/path curves or automatic seamless blending of limbs are claimed.

## Shared subtitle API consumer
When `consumerId` is provided, the mascot selects cues through `getSubtitleCues(timeline)` and `selectSubtitleCues(cues,{kind:'consumer',consumerId})` from `@motion/lyrics-sync/subtitles`. Its bubble draws only `presentation: 'bubble'|'both'` cues; `hidden` cues may be selected but are not displayed. It respects word timing only when `wordTimingStatus` is `matches-text`. When no `consumerId` is provided, the older `speechClipId` link remains a compatibility fallback. The project must provide the same live timeline to the composition. The generic editor does not yet offer consumer assignment via right-click.

## Clip transition experiment
`sampleMascotPose` (internal) now applies an eight-frame-or-shorter easing envelope to procedural arm, leg, head tilt and vertical jump/bounce motion at both ends of a clip. This allows adjacent walk/jump/dance/wave clips to meet with a neutral pose while X/Y endpoints stay continuous via the existing path properties. This is not full skeletal crossfading; spinning orientation and overall rhythm are still experimental. The sample demo's JSON animation remains unchanged.
