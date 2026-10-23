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


## Future Core scene editing milestone (D-017)

After standard clips and project-data round trips are reliable, add first-class scenes on the **same canonical Timeline**, plus explicit clip-only trim and scene-duration ripple operations. A 10-second scene expanded by 2 seconds moves all following scenes by 2 seconds; elements after a user-selected ripple anchor **inside** the scene also shift, while a subtitle extended within the current scene need not move anything else. Provide clear handle/mode UI, overlap/locked/linked-audio policy, scope preview, transaction/Undo, and AI-callable validated edit operations that save deterministic JSON. Do not implement by making Codex rewrite every clip start frame. Do not silently ripple when merely extending an individual subtitle. Scene/group model must coexist with module-owned layers and external JSON change protection.

**Scheduling:** this is a later Core milestone, not part of the first Media Library + Image/Video PR. Confirm product semantics and timing boundaries in a focused design review before coding.


## Agent interface decision gates — D-018

**Now / during Core clip work:** retain a single canonical JSON model, validated operations, stable IDs, capability schemas, ownership checks, and explicit revision safety. Design each new Core function so it can later be discovered and invoked without reading internal source.

**After Media Library + first Image round-trip is proven:** review a **small Agent Skill and CLI discovery/validation/editing proof** using the existing Core API. Measure whether Codex can discover supported Text/Image properties, edit a saved project, validate/reload, and avoid consulting the app's React implementation. This is a review gate, not automatic approval to implement a general agent platform.

**After reusable Core operations (including structural scene/ripple operations where available) and a real end-to-end external-agent workflow:** assess whether a **thin MCP adapter** offers practical agent interoperability beyond Skills + CLI. It must delegate to the same Core edit engine, expose only narrowly scoped safe tools/resources, and respect human drafts and permissions. Defer a large MCP server, general autonomous module installation and background agent orchestration.

**Continue immediate feature order:** stabilize and merge PR #33 documentation, then plan the Image/Media Library slice. Agent transport work must not delay the editor's missing fundamentals.


## Direct-manipulation Inspector UX gate — D-019

Once Image clips have a validated transform/JSON round trip, prototype an **XY joystick-style position pad** (diagonal movement included) and a **circular rotation dial** in the shared Inspector, with direct Canvas controls where suitable. Keep exact numeric fields, keyboard support and reset. Both UI modes and future AI tools must modify the same canonical transform data. Verify drag gesture = one undoable operation, and JSON/preview/MP4 parity. Evaluate as a focused shared-Transform UX increment, not an Image-import blocker.


### Integration blocker observed before first Image implementation — 2026-10-23

Documentation-only PR #33 remains open, with failing CI at the latest checked HEAD. The Electron smoke on `scripts/smoke.ts` near line 1997 observed saved third-project subtitle text `New subtitle` rather than expected `Caption belongs to project three`. This is a real UI→save mismatch needing root-cause analysis; do not dismiss as flaky or waive the assertion. The failed run may be a race or application state bug; its root cause is **not yet determined**. Previously reported green runs for older commits cannot authorize the current PR HEAD. CI and merge status are volatile: verify the live PR HEAD rather than trusting the SHA in this note.

**Execution gate:** reproduce/fix the subtitle Inspector/persistence regression in a narrow code PR against `dev`, deterministic test without arbitrary sleeps; then refresh/revalidate PR #33 and merge only with successful CI. The Image audit is complete but implementation has **not** started or been approved. Its proposed minimal next slice: PNG asset registration via native picker, stable asset IDs distinct from Image clip IDs, safe host-only path resolution, ordinary Image Timeline clip at 6s, shared Inspector position/scale, external JSON reload/conflict, and preview/MP4 verification. Review implementation scope after the save bug is resolved. Do not let joystick/dial work expand the initial Image PR.


### Canvas manipulation priority (D-019 refinement)

After standalone Image JSON/Inspector/MP4 integration, prioritize a reviewable **shared Canvas Transform overlay**: click/select visual elements, drag to move, resize handles, rotation handle, live preview, fine snapping and keyboard/Inspector fallback. It must apply consistently to standalone Text/Image/Video and opted-in module-owned spatial content; do not attach geometric handles to audio-only clips. Selection must synchronize Timeline, Canvas and Inspector; tiny/offscreen/overlapping items remain selectable from the layer list and adjustable by XY/dial. Editor-only handles must not render into MP4. Validate one drag as one Undo step and identical saved JSON/preview/export values. This takes priority over solely cosmetic Inspector redesign.


### Immediate editor usability gates — Space, Canvas selection and preview transport

**Short-term, separate PR:** audit existing playback focus and keyboard architecture, implement Space to toggle Play/Pause in editor context without interfering with typing, focused buttons, dialogs or system shortcuts; verify docked/detached editor, seeking behavior, and a reproducible playback-resume regression. Investigate intermittent preview/player failures, keeping the current Remotion transport unless real evidence supports replacement.

**Shared transform milestone:** Canvas hit-testing and edit-only handles (move/scale/rotate), synchronized Timeline selection, **multi-select** (modifier-click/marquee as appropriate), selection group transform, coherent Undo/Redo and overlap/lock ownership behavior. The user should be able to visually lay out an entire scene without searching tiny numerical Inspector fields. Keep AI/Core JSON contract and MP4 parity.


### Near-term UI time readability — D-020

Introduce a shared project-FPS-aware UI formatter/parser for seconds/milliseconds on the Timeline ruler, playhead and Inspector time controls, retaining integer frames in canonical JSON. Offer optional frames/timecode display for technical work. Round user input to legal frame positions, prevent time drift, and cover varying FPS, minute rollover, trim, subtitle and seek cases. Deliver as a narrow Core usability PR, separate from Media Library and Canvas selection.


### Primary adoption gate — zero-repeat local agent handoff

Before investing in MCP or a large tooling surface, implement/prototype a minimal repository-local **START_HERE / AGENTS / Skill** entrypoint for developer, manager and animator workflows using existing management docs, actual Git/CI state and live project/capability JSON. Evaluate with a completely fresh agent context: can it answer what exists, what is approved, what's broken, what's next, and how to resume a video project without asking the owner to re-explain? Keep it concise, maintainable and version-matched via Git checkout. This is the core personal productivity purpose of agent integration; CLI and optional local MCP follow demonstrable workflow gaps.
