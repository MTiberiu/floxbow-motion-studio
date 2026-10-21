# Roadmap

Planning snapshot: 2026-10-21. Milestone status must be verified against the latest `dev` and open PRs before changing.

## Current baseline — Golden Starter

**Implemented in `dev`:**

- Modular React/Remotion + Electron workspace, reusable player, renderer, SDK, timeline, editor shell, project loader, animation/audio/lyrics packages.
- Professional fixed editor layout with timeline, canvas, inspector, and project discovery (PR #1).
- Clean Golden Starter, Capabilities Explorer, neutral technical examples rather than preloaded user-demo videos (PR #2).
- Public module integration blueprint and documented package boundaries (PR #3).
- Project isolation: user projects ignored by Git by default, tests for multiple projects, saved edits, external change reload, and conflict protection (PR #4).

**Important limits:** A working module API is not necessarily a fully integrated editor tool. The current lyrics workbench/CLI are not yet an end-to-end song-import/transcription/timeline workflow. Large media libraries, project-specific custom editor shells, and general-purpose plugin discovery are not validated capabilities.

## Milestone sequence

| Stage | Status | Target / acceptance |
| --- | --- | --- |
| M0 — Stable Golden Starter and project isolation | Implemented | Empty launch, independent projects, safe disk persistence, tests, documented capabilities. |
| M1 — Subtitle module integration (TASK 005) | Next / verify task progress | One canonical editable subtitle timeline; inspect, edit, move, resize, save, reload, preview, and render. Reuse existing APIs; test boundaries. |
| M2 — Media reference contract | Next, needs design review | Import local media as **links by default** rather than copying; stable asset IDs, validation, missing-media reporting and relink. File access depends on runtime and agent permissions. |
| M3 — Audio + Whisper + Lyrics vertical slice | Next, after M1/M2 | Select linked song, provide correct lyrics, run local audio analysis, preserve raw transcript and estimated timings, reconcile to lyric lines, save editable subtitle clips. |
| M4 — Human + external AI end-to-end validation | Next, after M3 | Copy an AI task with real project paths; new agent adjusts approximate subtitle text/segments from transcript and original lyrics; editor reloads; human fine-tunes timing on black background with white text. |
| M5 — Generalized visual feedback | Concept | Select a clip/frame and capture a structured edit request; copy a context-aware AI task. |
| M6 — Larger workspace/plugin integration | Concept | Configurable project-specific tools/panels, scalable asset browsers, other creative domains; develop only as demonstrated requirements arise. |

Do not start M3 before validating how local media references are resolved by preview, render and the Whisper worker.

## Definition of success for the first real test

Given a local song and correctly formatted lyric lines, a user can run the existing audio-analysis capabilities through a documented workflow; the raw estimates and authoritative text are separate; an external coding agent can read the same project and refine editable subtitle clips; the desktop UI can preview synchronized captions, allow frame-level corrections, and save them without overwriting concurrent changes. Accuracy remains subject to listening and manual review.

## Work deliberately excluded until demonstrated

No autonomous agent backend, required cloud service, magical perfect audio alignment, premature general-purpose plugin loader, compulsory media copying, 3D/mascot system, or full video-editor feature parity.
