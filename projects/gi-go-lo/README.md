# GI GO LO

A 12-second music-video starter, not a synchronized recording. No song audio, verified lyrics or actual timestamps were supplied. The three syllables are sample content. Every timestamp in `timing/lyrics.json` is **illustrative demo data**, confidence zero, and is visibly labeled in the composition.

The canonical timeline has two separately identified chorus occurrences; the second has `repeatOf: "chorus-1"`. Each occurrence has unique word IDs and its own times. Unmatched real words should use null start/end and source unmatched, never inferred reliable timing.

Dependencies: @motion/sdk, @motion/animations, @motion/lyrics-sync. No external visual assets/fonts. To add licensed audio, place it in assets/, import it in Composition.tsx and render Narration from @motion/audio. Optionally declare the audio path in project.json for validation.

Generate an unverified timeline with `npm run sync:lyrics -- gi-go-lo assets/song.wav assets/lyrics.txt` if the optional Python backend is available. Inspect/export through the Lyrics sync tab, then replace timing/lyrics.json. Update duration and scene logic to fit the real recording. Demo chorus timing is not evidence of alignment accuracy.
