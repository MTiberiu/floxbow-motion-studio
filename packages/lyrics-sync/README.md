# Subtitles and lyrics

`@motion/lyrics-sync/subtitles` adapts editable subtitle data to the shared version-1 frame timeline. `@motion/lyrics-sync/component` exports the Remotion renderer and its Inspector field declarations. Text and timing are stored on each timeline clip; visual appearance stays in `clip.props`.

Start with the [public API](./API.md), the [extension contract](./EXTENDING.md), and the [working timeline example](./examples/subtitle-timeline.tsx). The app-level project format and user workflow are also documented in [`docs/TIMELINE_EDITOR.md`](../../docs/TIMELINE_EDITOR.md).

The API guide distinguishes original lyrics, raw transcription input, proposed timing evidence and the one final editable `edit-timeline.json` source.

The current editor supports clip creation, selection, movement, trimming, declared property editing, JSON/SRT/LRC import and export, preview, persistence and external file reload. It does not transcribe audio or automatically align words. When corrected labels no longer match existing word intervals, karaoke highlighting pauses until matching intervals are supplied.
