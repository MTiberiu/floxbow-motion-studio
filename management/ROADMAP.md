# Roadmap

Planning snapshot: 2026-10-23. Milestone status must be verified against the latest `dev` and open PRs before changing.

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

## Next committed product outcomes (2026-10-23)

These requirements are agreed **product targets**, not implemented features or permission to modify code. Each delivery is a scoped, reviewed PR from `dev`; preserve project compatibility and test in the actual Electron editor.

| Priority                                                        | Outcome                                                                                                                                                                                                                                                                                                                                                                            | Acceptance / boundary                                                                                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — Timeline usability                                         | PR #28 delivered zoom/navigation; PR #29 delivered edge auto-scroll and safe movement/duration extension for ordinary clips; PR #31 delivered shared editing commands and non-destructive playback/gap diagnostics. Remaining: marquee/modifier multi-selection and group movement preserving offsets. Soundtrack movement stays disabled pending preview/MP4 timing verification. | Docked/detached views, Undo/Redo, save/reload, audio preview and MP4 stay consistent; no time before frame 0. Existing duration cap remains unless explicitly revised.                                |
| P1 — Canonical module-owned layers                              | Audited contract for multiple module instances, owned groups/layers and child elements on the existing Timeline; separate logical ownership from alternate display views.                                                                                                                                                                                                          | A module operation never destroys another module's items. Compatible with existing clips, contracts and projects; architecture designed from real Subtitles use case.                                 |
| P2 — First complete proof: Subtitles + Whisper + external Codex | Keep an identifiable Whisper-original transcript tied to soundtrack and a separate Codex-revised layer; manual captions untouched; layer hide/show and common layer-wide typography/position.                                                                                                                                                                                      | User can compare both in Canvas and Timeline, adjust appearance, save/reload and render; regenerate only a chosen transcript set; Codex edits through documented JSON/API, no in-editor AI assistant. |
| P3 — Shared Text foundation                                     | Common typography fields/styles (H1/Body/Caption), per-layer defaults and per-clip overrides, reusable controls; consuming modules own their content.                                                                                                                                                                                                                              | Subtitles and at least one Kinetics/scene example reuse the same contract with correct Inspector, preview, render and project round-trip.                                                             |
| P4 — Extend remaining modules and image workflow                | Incrementally adapt Kinetics, visual scenes and other modules; distinguish importing/registering image assets from placing/replacing visual image layers.                                                                                                                                                                                                                          | Existing projects continue to load; users can locate and edit promised text/images individually, with unsupported UI abilities disclosed.                                                             |
| P1 cross-cutting — Find relevant layers                         | Group Timeline by module or type, filter e.g. Show Only Audio, keep shared ruler and cross-module editing.                                                                                                                                                                                                                                                                         | Two audio elements from different modules can be shown together amid ~100 layers; filtering affects only Timeline presentation, never playback/render.                                                |
| Release readiness                                               | Immutable tagged stable releases, optional older release maintenance lines, compatible API/JSON changes, migration and contributor guidance.                                                                                                                                                                                                                                       | A user can pin a release, understand supported update paths, and retain user projects; no release or branching reorganization before separate approval.                                               |

**Near-term focus:** deliver a working end-to-end human + external Codex subtitle correction/comparison experience, not abstract infrastructure with no user-facing proof. Technical design and PR sequencing require separate audit/approval. PR #29 and subsequent Timeline tasks remain separately scoped.

**Existing baseline:** PR #25 implemented soundtrack preview/export; PR #26 implemented direct local Whisper-to-Timeline transcription; PR #27 updated creator instructions; PR #28 added Timeline zoom. Whisper music accuracy and end-to-end external-agent correction are **not** yet validated.

## Core Editor V1 — integrated architecture and acceptance plan (new direction, 2026-10-23)

**Next planning deliverable after existing reviewed PRs:** an evidence-based **Core API Contract V1** audit; **not** a speculative bulk rewrite. The audit must inventory what already exists in SDK, EditorSession, media registration, player/renderer, module behaviors, schema and Inspector, and precisely identify missing module-facing contracts.

**One integrated product milestone, reviewable engineering increments:**

1. Finish essential Timeline operations and group editing, with one canonical timeline and conventional standalone tracks.
2. Make Text, Audio, Image and Video first-class core content types on standard tracks, accessible without specialized modules; implement unified Media Library plus media drag-to-Timeline placement.
3. Build reusable core service contracts for transforms/layout, basic animation/keyframes, effects/compositing, common text styles, selection/commands, layer visibility/lock/mute, project persistence/migration and preview/render. Separate essential MVP from ambitious advanced capabilities based on actual audit.
4. Add module-owned groups/layers on the **same Timeline**, reusing shared core APIs and obeying edit ownership boundaries. Support alternative Timeline group/filter views without altering playback/export.
5. Validate the first end-to-end module: selected audio → Whisper original → independent external Codex correction layer → compare, style, save/reload and correct MP4.
6. Adapt other existing modules incrementally; verify no old project data is destroyed.

**Acceptance fixture:** a real user-facing project with at least two overlapping/independent audio clips, image, video, standalone text, reusable transforms, a simple animation, and separate Whisper/Codex caption sets, plus module-owned layers. User can import/place/edit/move/copy, preview/seek, persist/reload and export the same composition. Validate audio mixing and timing in MP4. Do not claim completion for behavior only simulated in UI. Existing soundtrack-only limits remain explicit until proven lifted.

**Test strategy:** fast focused tests per change; required automated CI and targeted Electron/render regression at reviewable integration points; one comprehensive end-to-end acceptance scenario for the integrated milestone. This aims to reduce redundant human test cycles, not remove safeguards.

**Sequencing:** review/merge PR #31 separately when approved, then reconcile open documentation PR #30 with current `dev`. Execute the Core API audit before authorizing a large implementation. The already approved Transcript/Timeline/Release requirements remain in force.


## Operational handoff — 2026-10-23 (for a new developer or AI agent)

**Source of truth:** start by reading [DECISIONS.md](DECISIONS.md), [BACKLOG.md](BACKLOG.md), [Core Text JSON contract](../docs/STANDALONE_TEXT.md) **once PR #32 merges**, [Timeline guide](../docs/TIMELINE_EDITOR.md), and the real `dev` code. Verify GitHub PR states before stating a capability is merged. Historical planning notes above can be stale.

**Merged milestones confirmed:** PR #29 Timeline extension and PR #31 universal editing/Play/seek are integrated in `dev`; PR #30 integrated documentation, latest verified merge `f09a52dc10c36103f1a2cfc85d876c7700b27cb`.

**Merged Core Text milestone:** PR #32, [Standalone editable Text clips](https://github.com/MTiberiu/floxbow-motion-studio/pull/32), merged into `dev` at `bb2402ab115e31974480e52a65189444c3360696`. Standalone Text now has JSON-backed text, X/Y, font size, color and alignment in Inspector/Canvas and saved Remotion output. This is an initial narrow contract, **not** the complete Core project model.

**Core Editor V1 technical audit completed** (developer report received). Findings: Timeline v1/EditorSession/media MP3-WAV registry/subtitle tooling/Remotion provide partial foundations; React composition can still own creative content, there is no comprehensive standalone image/video/multi-audio Core, no module-owned layer schema, and Whisper regeneration can replace unrelated subtitle clips after confirmation. Audit proposed a versioned canonical model, stable ownership, typed built-ins, protected external edits and a single integrated acceptance project. Audit was accepted **with modified implementation sequence**: verify AI↔JSON↔UI round-trip immediately through standalone Text (PR #32), rather than delivering only abstract infrastructure.

**Next approved planning direction (not automatic code authorization):**
1. PR #32 has merged: retain and regression-test Text JSON→Inspector/Canvas→save→MP4 parity as the baseline.
2. **Next implementation proposal:** unified Media Library and first-class Image/Video registration **separate from** placement on ordinary Timeline tracks. Stable asset IDs, individual clip IDs, image at 6s, agent JSON edit, Inspector correction, save/reload, representative rendered frame; assess video decoding/security and avoid fake UI-only support.
3. Extend multi-track audio with movable clips, volume/mix and proven preview/MP4 parity; soundtrack remains locked until verified.
4. Complete common Core services and module-facing validated contracts: typed properties, shared text/fonts/styles, transforms, basic animation, Inspector, selection/group editing, visibility and ownership.
5. Deliver module-owned Whisper Original and Codex Revised sets for explicitly selected audio, with safe scoped regeneration and independent styling/visibility, preserving manual captions.
6. Run one end-to-end acceptance project (standalone text, image, video, at least two audio tracks, module subtitle layers) with external Codex round-trip and MP4 verification.

**Non-negotiable workflow:** AI agent does most edits via documented project data; human reviews and adjusts via UI. Changes must be bidirectional, validated, conflict-safe, and persist through export. Build reviewable PRs with tests; do not start new work automatically after any merge. `main` and user-owned projects/media remain untouched.
