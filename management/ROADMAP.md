# Roadmap

Planning snapshot: 2026-10-22. Milestone status must be verified against the latest `dev` and open PRs before changing.

## Current baseline — Golden Starter

**Implemented in `dev`:**

- Modular React/Remotion + Electron workspace, reusable player, renderer, SDK, timeline, editor shell, project loader, animation/audio/lyrics packages.
- Professional fixed editor layout with timeline, canvas, inspector, and project discovery (PR #1).
- Clean Golden Starter, Capabilities Explorer, neutral technical examples rather than preloaded user-demo videos (PR #2).
- Public module integration blueprint and documented package boundaries (PR #3).
- Project isolation: user projects ignored by Git by default, tests for multiple projects, saved edits, external change reload, and conflict protection (PR #4).

**Important limits:** A working module API is not necessarily a fully integrated editor tool. The live development editor now supports a linked soundtrack on the Timeline, synchronized preview playback and MP4 rendering, plus direct local Whisper generation of unverified editable subtitle clips. The built snapshot does not expose registry editing or local transcription. Large media libraries, project-specific custom editor shells, and general-purpose plugin discovery are not validated capabilities.

## Milestone sequence

| Stage                                                 | Status                                         | Target / acceptance                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Stable Golden Starter and project isolation      | Implemented                                    | Empty launch, independent projects, safe disk persistence, tests, documented capabilities.                                                                                                                                                                |
| M1 — Subtitle module integration (TASK 005)           | Implemented in `dev` through PR #6             | One canonical editable subtitle timeline; inspect, edit, move, resize, save, reload, preview, and render. Reuses existing APIs and has contract/regression coverage.                                                                                      |
| M2 — Media reference contract                         | Implemented                                    | Version-1 project-local registry for linked MP3/WAV, stable IDs, host-side validation, missing-media reporting, native selection, safe entry removal and external-edit conflict protection. Media collection and automatic relinking remain future work.  |
| M2b — Project module activation & editor slots design | Concept                                        | Define which modules are trusted/available, how project settings enable their editor tools, and which UI slots accept contributions. Validate schema, defaults, missing module behavior, and agent-editable JSON; do not require a dynamic plugin loader. |
| M3 — Audio + Whisper + Lyrics vertical slice          | Implemented in `dev` through PR #25 and PR #26 | Select linked song, show its fixed Audio clip on Timeline, play it through the shared preview transport, render audio with captions, and generate unverified subtitle clips directly from local Whisper without requiring lyrics.                         |
| M4 — Human + external AI end-to-end validation        | Next, after M3                                 | Copy an AI task with real project paths; new agent adjusts approximate subtitle text/segments from transcript and original lyrics; editor reloads; human fine-tunes timing on black background with white text.                                           |
| M5 — Generalized visual feedback                      | Concept                                        | Select a clip/frame and capture a structured edit request; copy a context-aware AI task.                                                                                                                                                                  |
| M6 — Larger workspace/plugin integration              | Concept                                        | Configurable project-specific tools/panels, scalable asset browsers, other creative domains; develop only as demonstrated requirements arise.                                                                                                             |

M3 implementation is complete. Current user workflows and limits are documented in [Project Media](../docs/PROJECT_MEDIA.md), [Lyrics Sync](../docs/LYRICS_SYNC.md), [Create a video](../docs/CREATE_VIDEO.md), and [Timeline Editor](../docs/TIMELINE_EDITOR.md). This status correction does not reorder the remaining product priorities or imply a general plugin system.

PR #6 ([subtitle integration](https://github.com/MTiberiu/floxbow-motion-studio/pull/6)) is merged into `dev` at `bf1f0bfd0ec4e956e6ca86bd2b740d30e78bceb4`.

## Original M3 acceptance context

The first acceptance draft below asked for authoritative lyric lines before timing generation. PR #26 changed the implemented initial workflow: Whisper can generate an unverified first draft without supplied lyrics. Lyrics remain useful for a separate correction/review workflow; external AI correction is not automatic.

Given a local song and correctly formatted lyric lines, a user can run the existing audio-analysis capabilities through a documented workflow; the raw estimates and authoritative text are separate; an external coding agent can read the same project and refine editable subtitle clips; the desktop UI can preview synchronized captions, allow frame-level corrections, and save them without overwriting concurrent changes. Accuracy remains subject to listening and manual review.

## Work deliberately excluded until demonstrated

No autonomous agent backend, required cloud service, magical perfect audio alignment, premature general-purpose plugin loader, compulsory media copying, 3D/mascot system, or full video-editor feature parity.
