# Mai Departe — White stage

Scene 2 (13.033–55.200 s) is implemented as nine project-local Timeline action clips. Pure white stage, complete contained figures, restrained cool shadows and amber accents. Financial problems remain unresolved.

## Scene 2
- 13.03–20.13 s: hesitation
- 20.13–27.27 s: step
- 27.27–33.97 s: promise
- 33.97–37.70 s: bills
- 37.70–41.10 s: cannot-call
- 41.10–44.57 s: answer
- 44.57–48.33 s: silence
- 48.33–51.87 s: consent
- 51.87–55.20 s: lost-time

The sequence combines full-resolution acted poses with deterministic 2D object animation: attempted rise and return, forward travel and footprints, writing that stops, falling/gathering bills, avoided phone, ringing/answering, smile release and lowering the phone, another paper joining the burden, and passing time. Character transitions use short pose dissolves; this is limited pose animation, not a skeletal rig or interpolated live-action performance. Inserts are vector graphics, not magnified bitmap crops.

Six new 1536×1024 photos were edited from the same seated master with the built-in image tool, preserving the four-legged chair, desk and identity. Prompt provenance: scenes/asset-prompts-v3.json. Images use contain and remain below source pixel dimensions in the 1920×1080 composition. The obsolete contact sheet and v2 alternatives remain on disk but are not used in scene 2.

Story action and Shadow strength are Inspector controls. Internal gesture timing and paper trajectories remain code-defined. Saved word anchors control the forced smile, the end of the smile at apoi, and phone lowering after tac. Saved music events drive bill release; missing accents use explicitly authored staggering. Curves are not treated as emotion measurements.

## Preservation and checks
All subtitle objects (text, cue timing, word timing, status) and all clips outside scene 2 were deep-compared before/after, including after editor Save/reload. Source analyses and timing/lyrics.json were not edited. No shared application code changed.

Validation and TypeScript passed. Preview inspected at 23, 29, 35, 43, 47.3, 50 and 54 seconds; complete figures/furniture and subtitle separation checked. Inspector action change updated Canvas and was restored, saved and reloaded. No video or still render was run.

Repository tests: 193 passed, 2 failed with EPERM: operation not permitted, rename in temporary storyboard.json saves (local animator handoff and storyboard atomic save/reload). Reproduce: npm test; expected: temporary storyboard file rename succeeds and 195 tests pass. Exact diagnostics: scenes/check-results.txt. Starting npm run dev encountered EADDRINUSE on 127.0.0.1:5174; preview used the already-running editor on port 5173.

## Files
Composition.tsx registers scenes/BurdenScene.tsx. scenes/prepare-film.mjs regenerates edit-timeline.json and director-shot-plan.json; it does not write the project manifest or lyric sources. Other scenes retain their previous blocking.
