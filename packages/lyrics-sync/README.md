# Subtitles and lyrics

`@motion/lyrics-sync/subtitles` adapts editable subtitle data to the shared version-1 frame timeline. `@motion/lyrics-sync/component` exports the Remotion renderer and its Inspector field declarations. Text and timing are stored on each timeline clip; visual appearance stays in `clip.props`.

The subtitles API also exposes pure cue extraction and selection for other project components. `speakerId` identifies a speaker, `presentation` permits a visual text mode, and `consumerIds` routes cues to supplemental consumer instances; these fields do not duplicate subtitle text or timing. Existing content defaults to caption presentation and broadcast routing.

Start with the [public API](./API.md), the [extension contract](./EXTENDING.md), and the [working timeline example](./examples/subtitle-timeline.tsx). The app-level project format and user workflow are also documented in [`docs/TIMELINE_EDITOR.md`](../../docs/TIMELINE_EDITOR.md).

The API guide distinguishes original lyrics, raw transcription input, proposed timing evidence and the one final editable `edit-timeline.json` source.

The current editor supports clip creation, selection, movement, trimming, declared property editing, JSON/SRT/LRC import and export, preview, persistence and external file reload. It does not transcribe audio or automatically align words. When corrected labels no longer match existing word intervals, karaoke highlighting pauses until matching intervals are supplied.

There is no consumer registry, character module, speech-bubble renderer, lip-sync system, or consumer assignment menu. See the [cue API](./API.md#reusable-subtitle-cues) and [extension guide](./EXTENDING.md#sharing-cues-with-consumer-instances) for project-local integrations.
