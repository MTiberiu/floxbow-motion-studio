# Extending the subtitle module

Keep semantic text and timing in `clip.content`; keep type, color, position and other visual choices in `clip.props`. Do not put appearance in the timing interchange format. The frame-based project `edit-timeline.json` remains the one saved, editable subtitle timeline; seconds-based import data is only an interchange representation.

## Sharing cues with consumer instances

Use `getSubtitleCues(timeline)` to derive cues from the same `EditTimeline` passed to `TimelineComposition`. In an editable project composition, derive from the live `timeline` prop when present and use the project's saved timeline only as its standalone-preview/render fallback. Pass the resulting cue list to each consumer; do not create another timing file or copy cue text into consumer clips. See [`examples/subtitle-timeline.tsx`](./examples/subtitle-timeline.tsx) for two instances reading the same cue data.

Keep `speakerId`, `presentation`, and `consumerIds` distinct. `speakerId` identifies a speaker, `presentation` sets visual text permission, and `consumerIds` routes supplemental consumers. The built-in caption renderer uses `caption`/`both` regardless of consumer routing. Consumers receive routed `hidden` cues for nonvisual animation and must not draw their text. Missing `consumerIds` means broadcast; `[]` means no supplemental recipient; a list is an instance allow-list. Use stable, project-local instance IDs, not a module type ID. Unknown IDs are valid and preserved, so temporarily unavailable modules do not erase project assignments.

There is no consumer registry or assignment UI yet. Project code or an AI agent may author these semantic fields directly; do not claim the editor can assign consumers. JSON preserves the fields; SRT/LRC cannot. `wordTimingStatus` reports missing timing or label correspondence only; it does not certify real-world alignment. Automatic Whisper import may create proportional word estimates when direct word timing cannot be used; preserve `wordTimingSource` and clearly disclose these estimates to users.

When adding a visual editable field, declare it in `subtitleFields`, validate its supported value in `packages/motion-sdk/src/timeline.ts` if it needs a new field type, and make the `Subtitles` renderer consume it. The editor builds controls from `EditableComponent.fields`; do not add a subtitle-specific Inspector widget for a field that the existing field schema can express. Speaker and consumer-routing fields are semantic content, not visual props or generic Inspector controls.

When changing text/timing behavior, keep stable clip and word IDs where possible. Never infer word timestamps from corrected text. If words no longer correspond to text, retain existing timing evidence and do not highlight it as though it matched. Add tests for correction, segment movement/trimming and timing import/export.

For direct Whisper ingestion, call `whisperResultToSubtitleTiming` with raw adapter output and the current project duration, then use `subtitleClips` against the current editable timeline. Keep the returned skip and unusable-word counts visible. Do not run transcription from a project composition or renderer; the host resolves registered media IDs and invokes the local worker. The generated clips are `unverified` and must remain editable through the existing session/save workflow. Do not reconcile against supplied lyrics unless the user separately asks for that correction workflow.

For an additional module, register its own `EditableComponent` in the project composition and use the existing timeline clip and field contracts. Keep module-specific parsing and transforms in the module package. The editor shell currently has dedicated subtitle import/export buttons; do not generalize them into an executable plugin system until another concrete module needs the same integration contract.

Run `npm run typecheck`, `npm test`, `npm run validate`, `npm run build`, `npm run test:smoke`, and `npm run test:editor` for changes that cross the package/editor boundary. The example in [`examples/subtitle-timeline.tsx`](./examples/subtitle-timeline.tsx) is the smallest full composition integration.
