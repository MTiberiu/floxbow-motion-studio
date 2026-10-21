# Verification

This file records checks for the current Golden Starter baseline. Results are added only after the command has been run successfully.

## Current acceptance checks

Executed on 2026-10-21 for the Golden Starter branch:

- `npm run typecheck` — passed, including technical examples.
- `npm test` — passed, 10 tests covering project loading, lyric timing, timeline contracts, capability metadata/references, and the blank project scaffold.
- `npm run validate` — passed; reported that the user-project workspace is clean.
- `npm run test:smoke` — passed in Electron; checked the clean starter, real Explorer preview, docs, project creation, subtitle text edit and saved timeline.
- `npm run build` — passed; built the shell with no user projects. Vite reported a nonfatal large-chunk warning and removed two dependency comment annotations.
- `npm run test:built` — passed in Electron; checked the built clean starter, real Explorer preview, docs and read-only project creation state.

## Current limitations

This is an experimental editor foundation. The timeline supports basic tracks, clip selection, horizontal movement, trimming, property editing, and frame seeking. It does not yet provide keyframes, multi-selection, snapping, ripple editing, or a render job panel. The live development workspace creates projects; the built snapshot is read-only. Lyrics reconciliation is lexical and order-preserving, not semantic forced alignment, and the editor does not run transcription or alignment automatically. Rendering and lyric synchronization remain CLI workflows.

Examples under `examples/capabilities/` are technical references and are not user video projects. Capability descriptions and example references are sourced from `packages/animation-library/registry.json` and validated by contract tests.
