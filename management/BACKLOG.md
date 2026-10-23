# Capability and Idea Backlog

This is a **product idea inventory**, not a promise or authorization to implement every item. Consult [ROADMAP.md](ROADMAP.md) for sequencing and [DECISIONS.md](DECISIONS.md) for agreed principles. Technical, evidence-backed changes belong in `improvements/proposals/`.

## Existing foundation — verify actual integration before reuse

| Capability                                                  | Current position                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project loader and project scaffolding                      | Implemented; single project directory, validated manifest and composition.                                                                                                                                                              |
| Timeline / SDK / editable components                        | Implemented core frame-based timeline and clip editing; not a universal plugin host.                                                                                                                                                    |
| Remotion player and renderer                                | Implemented, with separate preview and CLI render boundaries.                                                                                                                                                                           |
| Lyrics sync and Whisper adapter                             | Live development editor supports registered soundtrack, shared preview/MP4 audio and direct local Whisper-to-Timeline draft clips through PR #25/#26; external agent comparison and scoped regeneration remain incomplete.              |
| Subtitle editor integration contract                        | Implemented in TASK 005 / PR #6: editable subtitle timeline clips, stable segment timing and IDs, text correction, preview/reload behavior, and documented APIs. This does not provide the complete song-import/transcription workflow. |
| Animation library (text, chat, pop, counter, karaoke, fade) | Reusable code examples; many are composition-level, not individually editable timeline clips.                                                                                                                                           |
| Capabilities Explorer                                       | Implemented creator and developer/AI views; continue improving accuracy as modules mature.                                                                                                                                              |

## Next candidate modules / integrations

| Idea                                               | Status                                               | Purpose / unresolved questions                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media Registry                                     | Concept, needed before audio import                  | Reference local files by stable ID; store paths, types and minimal metadata; no implicit media duplication.                                                                           |
| Media Resolver                                     | Concept                                              | Resolve linked media for editor, audio analysis and rendering with suitable access/security boundaries; handle missing files.                                                         |
| Link / Relink Media UI                             | Concept                                              | User selects local assets; later reconnects moved sources without losing clip edits.                                                                                                  |
| Audio transcription runner                         | Planned vertical slice                               | Expose optional local Whisper analysis, failures and model prerequisites through a clear workflow.                                                                                    |
| Lyrics reconciliation / approximate timing         | Planned vertical slice                               | Align authoritative lyric line breaks to imperfect word/segment estimates; carry uncertainty.                                                                                         |
| Copy AI Alignment Task                             | Planned vertical slice                               | Generate a concise project-specific prompt with real document paths and task constraints.                                                                                             |
| Canvas/timeline selection → Copy AI Edit Request   | Concept                                              | Clip ID, frame/time, selected element, user feedback; optional saved annotations.                                                                                                     |
| Module activation configuration (per project)      | Concept / design before broader module activation UI | Human toggles available, trusted editor integrations in Settings; external AI can edit the same validated JSON without reading React internals. Configuration is not executable code. |
| Editor extension slots                             | Concept / design before broader module activation UI | Stable UI areas such as left tools, inspector, toolbar, timeline actions, and specialized workspaces; modules declare intended contributions; shell owns positioning.                 |
| Module catalog / activation boundaries             | Concept                                              | Distinguish installed/registered, enabled for project, and visible in UI. Handle unknown IDs, incompatible versions, dependencies and unavailable integrations clearly.               |
| Project-specific editor tool panels                | Concept                                              | Support specialized audio/animation/media workflows without embedding everything in one shell.                                                                                        |
| Scalable media browser / batch import              | Concept                                              | Hundreds or thousands of media references; performance and indexing require measured tests.                                                                                           |
| Explicit collect/package project                   | Deferred                                             | Intentionally copy linked assets for portability when requested.                                                                                                                      |
| Audio waveform and improved word alignment         | Concept                                              | Useful for manual adjustments; complexity and accuracy to be measured.                                                                                                                |
| Optional character/mascot animation and 3D modules | Deferred                                             | Reusable extensions after core human/AI editing workflow is proven.                                                                                                                   |

## Questions to revisit

1. How are local absolute paths, project-relative paths and portability handled across Windows/macOS/Linux?
2. How does the desktop securely grant a preview or renderer access to a linked source outside the project directory?
3. Should a media reference optionally have a cache/proxy, and who owns its lifecycle?
4. What does the editor do with a missing source during preview, analysis and rendering?
5. How does a project opt into additional editor panels without broad core modifications? Which slots, if any, are needed beyond the implemented subtitle integration?
6. When are multiple compositions/outputs per project needed?
7. Should application-wide module visibility defaults be inherited by project settings, and how are conflicts resolved?
8. How should enabling/disabling modules affect existing clips, rendering and project portability? Disabling a UI tool must not delete content or silently break render.
9. What exact annotation shape is useful for future AI edit requests, without building a notification service?

## Triage rule

Promote an idea to a scoped task only when a concrete user scenario and acceptance test exist. Preserve the distinction between **implemented**, **planned**, and **conceptual**.

## Committed follow-up requirements — 2026-10-23

These are **agreed product outcomes**, not shipped features. Implementation needs separate technical audit, approvals and regression tests; sequencing lives in [ROADMAP.md](ROADMAP.md), rationale in [DECISIONS.md](DECISIONS.md).

| Requirement                                      | Status                                                                                                                                                                                                                                                             | Concrete acceptance scenario                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline expansion, movement and multi-selection | PR #28 zoom/navigation and PR #29 edge auto-scroll, ordinary clip movement and safe duration extension are implemented. PR #31 adds shared editing commands and non-destructive playback/gap diagnostics. Multi-selection and group movement remain unimplemented. | Select many clips and move them together while maintaining offsets and one Undo step; validate audio seek/export before enabling soundtrack movement.               |
| Module-owned Timeline layers                     | Committed, needs contract audit                                                                                                                                                                                                                                    | Two module instances coexist with owned children; edits scoped to one group cannot overwrite unrelated clips.                                                       |
| Safe Whisper transcription sets                  | Committed, not implemented                                                                                                                                                                                                                                         | Generate a source-linked Whisper original; adding/replacing only a selected transcription set preserves manual captions and other drafts.                           |
| Codex revised subtitle layer                     | Committed, not implemented                                                                                                                                                                                                                                         | External Codex reads validated project JSON/API and creates a separate revision; original stays intact, editor reloads safely.                                      |
| Layer appearance and visibility                  | Committed, not implemented                                                                                                                                                                                                                                         | Apply position/color globally to Whisper layer, optionally override an individual caption, show/hide independently in preview/MP4 and avoid unwanted overlap.       |
| Shared Text capability                           | Committed, needs design                                                                                                                                                                                                                                            | Subtitles and Kinetics/scene consume typography fields and style presets without duplicating editors; each keeps ownership.                                         |
| Multi-view Timeline grouping/filtering           | Committed, not implemented                                                                                                                                                                                                                                         | With ~100 layers, choose Group by Module/Type and Show Only Audio; cross-module audio clips become adjacent **visually** while timing/data/render remain unchanged. |
| Editable image layers/media                      | Committed, needs design                                                                                                                                                                                                                                            | Registered image references can be identified and changed via supported scene/Inspector workflow; imports alone are not claimed editable.                           |
| Stable releases + contribution path              | Committed future policy; not configured                                                                                                                                                                                                                            | Immutable version tags, optional maintained older release line, compatibility/migration docs, protected stable/development branches and contributor PR rules.       |

### Deferred enhancements

Audio waveforms and multiple-track mixing, saved custom Timeline views/pinned rows, broader video/image registry support, automatic external-AI orchestration, generic extension-slot registries, and release automation are future design/implementation options, **not** available behavior.

### Status correction

Earlier tables above capture historical planning and may label Media Registry/Whisper as conceptual or partial. For the live implementation, use [ROADMAP.md](ROADMAP.md), [Project Media](../docs/PROJECT_MEDIA.md) and [Lyrics Sync](../docs/LYRICS_SYNC.md). Do not assume the new committed layer/revision or release features already exist.

## Core Editor V1 capability inventory — agreed direction, not yet implemented

The Core API Contract V1 audit must classify each core responsibility as **implemented and reusable**, **partially implemented**, **missing**, or **deferred**. Do not assume completeness from package/module names.

| Core contract                  | Intended module reuse / product outcome                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Timeline and grouping          | Conventional standalone tracks and optional module-owned groups; scoped operations, multi-selection, snapping and time alignment |
| Text                           | Shared typography, positioning, style presets and per-item overrides for standalone Text, Subtitles, Kinetics and scenes         |
| Audio                          | Reusable asset reference, multiple clips/tracks, correct seeking, mixing, volume/trim/fades and preview/export parity            |
| Image and video                | Media asset references, direct placement, duration and common image/video transform, preview/export parity                       |
| Unified Media Library          | One discoverable UI for import/search/relink and drag-to-Timeline, reusing linked asset IDs                                      |
| Transforms                     | Position, scale, rotation, opacity, anchors and layout for standard clips and modules                                            |
| Animation and effects          | Shared basic keyframes/easing, transitions and compositing where technically justified; advanced cases may remain deferred       |
| Editor commands                | Select, multi-select, move, duplicate, copy/paste, delete, undo/redo and operation permissions                                   |
| Property/Inspector integration | Declared editable fields and shared controls without per-module editor reimplementation                                          |
| Project and render             | Validated module edits, atomic undo, save/reload, schema migration and identical preview/MP4 behavior                            |
| Visibility and filtering       | Hide/lock/mute/solo behavior distinct from Timeline-only group/filter projections                                                |

**Regression example:** two audio clips on different tracks and a Subtitles module transcribing the _selected_ source; standalone image/video/text still work without any module activation. Whisper original and external Codex revision are independently editable and visible. One shared end-to-end fixture must cover save/reload and MP4. Cross-platform development uses fast local targeted tests plus full CI at integration boundaries.


## Explicit near-term Core V1 handoff — PR #32 and beyond

| Item | Verified / intended status | Next evidence required |
| --- | --- | --- |
| Standalone Text on Timeline | **Merged in `dev`** via PR #32 at `bb2402ab115e31974480e52a65189444c3360696` | Preserve documented JSON/Inspector/Remotion round-trip tests; extend reusable Core properties later |
| Core Editor V1 technical audit | Completed and reviewed | Apply its current-state findings; do not re-request the same audit |
| Canonical AI↔JSON↔UI contract | Partially implemented for Timeline; D-016 is mandatory principle | Show real bidirectional changes with dirty-draft protection and MP4 validation for every new built-in |
| Media Library, Image, Video | Planned next: asset registration separate from clip placement | Image at 6 seconds: one asset ID, one clip ID, external JSON change, UI correction, MP4 frame |
| Multi-audio | Missing despite fixed single soundtrack support | Two tracks, overlapping clips, move/volume, decodable correctly mixed MP4 |
| Module hierarchy and Whisper revisions | Committed and unimplemented | Original, manual and Codex sets never overwrite one another; layer-wide appearance and show/hide |
| Core module API | Audit reviewed, no final universal interface approved | Expose only justified, typed, validated module-facing services; reuse EditorSession and Timeline |
| Long-term releases | Agreed policy, no stable release published | Versioned tag/release, compatibility, migration and contributor guidance before first stable release |

**Note:** Grouping/filtering, multi-selection/group movement, snapping, richer Text fonts/presets, transforms, keyframes/effects, waveform and media relinking remain requirements or planned enhancements, **not** capabilities to claim already implemented. The development goal is an AI-editable conventional Core editor with optional module-owned groups on the same Timeline.


## Scene editing and AI timeline operations — planned, not implemented (D-017)

- [ ] Introduce Core scenes with stable IDs, duration/start in frames, and associations to clips/layers on the existing Timeline, compatible with module ownership and save migration.
- [ ] Clip-only duration edit (default): selected item changes without moving scene boundaries or later scene starts; warn when crossing a boundary or colliding.
- [ ] Explicit scene ripple duration: scene delta shifts subsequent scenes and associated elements atomically; optional internal ripple shifts clips after a specified anchor while preserving IDs, duration and linked timing semantics.
- [ ] Explicit handling for boundary-spanning clips, protected/locked tracks, audio sync, cross-scene overlays, negative durations, overlaps and project end; preview scope, safe rollback and Undo/Redo.
- [ ] Shared validated edit operation contract for external Codex and UI: target ID, mode, delta/new duration, anchor/scope, conflict/revision check, deterministic updated JSON; avoid requiring agents to manually adjust every downstream timestamp.
- [ ] Acceptance fixture: scene A 10s and B 8s; extending a caption within A leaves B fixed; expanding A by 2s shifts B and specified in-scene downstream elements by exactly 2s; JSON/UI/preview/MP4 agree after external AI edit and subsequent human correction.


## AI agent discovery and tool interfaces — explicitly deferred (D-018)

- [ ] During Core clip development, make registered capabilities machine-discoverable (type, supported fields/operations, constraints, version and error semantics); do not duplicate editor logic in agent adapters.
- [ ] After successful Media Library/Image bidirectional JSON-to-UI-to-render proof, review a minimal **Agent Skill + CLI** for discover/list, validate, edit, and render using canonical Core transactions.
- [ ] Ensure direct JSON and CLI edits share validation, stable-ID targeting, conflict/revision protection, preview/render results and ownership limits; document safe external-agent write procedure.
- [ ] Once shared Core operations and a real agent workflow are stable, evaluate **MCP as optional thin adapter** over the same API (not the authoritative data store, editing engine or primary documentation).
- [ ] When an effect is missing, capability discovery should return supported alternatives and a scoped SDK extension path; new module code requires explicit development permissions, validation and trust checks.
- [ ] Benchmark context/token overhead, integration usability, security boundaries and maintenance before selecting MCP transport. No general autonomous plugin installation in initial Core Editor V1.


## Shared spatial Inspector UX — planned (D-019)

- [ ] Shared 2D XY pad/joystick for free-direction positioning, including diagonals, with live preview and exact X/Y entry.
- [ ] Shared rotary dial/ring for rotation, with drag-to-angle and exact degree entry; define coordinate, anchor and angle conventions.
- [ ] Direct on-canvas move/rotate affordances where appropriate; snapping, keyboard accessibility and reset.
- [ ] One drag gesture = one atomic, undoable Core transform operation; conflict-safe JSON persistence and preview/MP4 parity.
- [ ] Reuse controls for Text/Image/Video and module-owned clips; prototype after first Image round-trip, not in initial import PR.


### Immediate blocker and Image implementation gate (2026-10-23)

- [ ] Investigate reproducible third-project subtitle save mismatch (`New subtitle` saved instead of `Caption belongs to project three`) from PR #33 Electron smoke; fix underlying state/persistence race in focused PR without weakening assertions.
- [ ] Rebase/refresh PR #33 onto repaired `dev`; require passing CI for its **actual latest HEAD**, not a previously green SHA.
- [ ] Review proposed **PNG-first Image** slice (audit complete, not yet implemented): host-only image path, stable reused media assetId, independent clip IDs, native file picker, Timeline placement at 6s, Inspector position/scale and duration, external AI JSON round trip, dirty draft protection, MP4 representative-frame check.
- [ ] At shared Inspector Transform implementation (after first Image JSON/MP4 proof), make XY pad and rotation dial **selection-first quick controls** usable for small/offscreen/overlapped objects; direct Canvas click must not be required; retain numerical precision, Center/Reset and single-step undo.


### Canvas selection and direct manipulation — high-priority shared Core UX (D-019)

- [ ] Click/select supported visual elements on Canvas; selection synchronized across Timeline/layer list and Inspector, with clear stacked overlap behavior.
- [ ] Shared editor-only selection box, move drag, resize handles, rotation handle; reasonable aspect-ratio constraints, snapping, zoom scaling and keyboard/fine adjustments.
- [ ] Reuse canonical transforms and Core transaction/Undo; ensure drag/rotate/resize commit safely to project JSON and preview/export exactly, not to a visual-only overlay.
- [ ] Modules declare transform support; lock/hidden/off-canvas and audio-only elements have correct special behavior; small targets selectable via layer list and Inspector XY/dial.
- [ ] Prototype after first Image round trip, then extend to Text/Video and module-owned visuals; review scope separately from basic PNG import PR.


### Player and Canvas usability — next prioritized work

- [ ] Space toggles Play/Pause when keyboard focus is in editor, Timeline or Canvas; never hijacks text entry, dialogs or focused native button actions; test docked/detached and seeking/playback state consistency.
- [ ] Investigate intermittent embedded player Play/Pause failures with reproducible traces; retain current Remotion preview transport pending evidence.
- [ ] Click to select visuals in Canvas, display editor-only move/resize/rotation handles, synchronized with Timeline/Inspector; selection via layer list remains available.
- [ ] Multi-select canvas visuals with explicit modifiers and optional marquee; transform selected group consistently with one Undo operation and owner/lock checks; validate JSON and rendered MP4 after saves.
- [ ] Separate small keyboard/playback fixes from Image asset import and broad shared Transform UI changes.


### User-facing time units — prioritized Core UX (D-020)

- [ ] Default to time in seconds/milliseconds (e.g. `00:06.500`) across relevant Timeline/Inspector/playhead/clip/subtitle controls rather than unexplained frame integers.
- [ ] Keep canonical saved times as integer frames; implement shared frame↔time formatter/parser based on project FPS, with explicit frame rounding and no drift.
- [ ] Preserve optional frames/SMPTE-like timecode mode for advanced users, correctly treating non-integer FPS where supported.
- [ ] Test edit/seek/trim/save/reload at multiple FPS and minute boundaries; ensure AI JSON contracts, preview and MP4 remain unchanged.


### Agent handoff and continuity — first-user priority

- [ ] Single concise local agent entrypoint linking role-specific developer / manager / animator starting points, not a new sprawling duplicated documentation set.
- [ ] Fresh-context agent test: read repo, reconstruct current architecture, management decisions, blockers, PR/CI state and next task from authoritative sources, without asking owner to repeat prior conversation.
- [ ] Animator handoff: agent can inspect current video project JSON/assets, installed capabilities and render commands and safely continue an existing animation.
- [ ] Maintain a concise current handoff/next-step note only if source-of-truth precedence and update responsibility are explicit; stale derived status must be checked against Git and project JSON.
