# Product Decisions and Working Principles

This document contains product directions agreed in discussion. They are **design intent**, not evidence of already implemented features.

## D-001 — Modular toolkit first

FloxBow is an AI-first creative coding toolkit with a reusable desktop editor, not a single fixed consumer video editor. The timeline, player, renderer, lyrics tools, animation components, and future modules must have documented responsibilities and supported public imports.

**Implication:** no large rewrite or plugin framework without a concrete integration need. A capable external agent may build project-specific components or a specialized editor UI using available modules.

## D-002 — Human and coding agent share project files

The visual editor and an external local AI coding agent work on the **same canonical project data**, not independent copies. UI saves must be readable from disk; valid external edits should be reloadable. Preserve stable clip IDs, persisted schemas, and conflict protection.

**Clarification:** the AI agent is **not** automatically notified and does not need to be built into FloxBow. Users communicate via their existing agent interface; editor affordances can generate precise **Copy AI Task** prompts pointing to files/clip IDs.

## D-003 — User projects belong to users

Personal projects and media are not published to the framework repository by default. The `projects/` directory is Git-ignored with `.gitkeep` retained (PR #4). Users decide whether to version projects locally, privately, publicly, or in separate repositories.

**Clarification:** a Git ignore rule is not an access-control or encryption mechanism. Users must review intentional publication.

## D-004 — Link media by default (future import behavior)

Importing existing local audio/video/images should ordinarily record **references to source files**, not duplicate them into every project. Keep originals in place. Preserve stable asset identifiers and source locations in project data. When a file moves or disappears, retain edit data and offer a future **Relink Media** flow. An explicit **Copy/Collect/Package Project** operation may be added later.

**Status:** the first linked-audio registry and development-shell registration flow are implemented in `dev` through PR #8. TASK 008 adds explicit removal of one registry entry and documents safe external-agent edits. The schema uses absolute host paths, so references can be machine-specific. Preview, Timeline playback, MP4 render, and live-development Whisper transcription were subsequently implemented through PR #25 and PR #26; relinking and broader media management remain future work. An external agent must have real filesystem permission/access to read the media; path knowledge alone is insufficient.

## D-005 — Correct lyrics are authoritative; audio timing is evidence

For song subtitles, the user's provided lyrics (including intended line breaks) are authoritative text. Whisper or comparable analyzers provide approximate transcripts and time boundaries, not guaranteed truth for singing. Reconciliation matches known lyric text to estimated segments, preserving repeats and uncertainties. Where word times exist, use them; otherwise estimate splits within observed boundaries. Manual timeline adjustment is expected.

**Data distinction:** original lyrics, raw analyzer output, tentative alignment evidence, and canonical editable timeline clips are separate kinds of data; do not create two competing final timelines.

## D-006 — First integration test is intentionally visually minimal

The first complete module exercise is **Audio + Whisper + Lyrics + Timeline**: linked song, correct lyrics, approximate subtitles, black background and white captions, editable clip timing, saved state, preview/render, and optional external AI refinement. Do not add decorative animations to prove the architecture.

## D-007 — Capability Explorer is a human/AI discovery surface

Capabilities are reusable implementations; examples are neutral technical demonstrations; projects are user creations. Explorer entries should communicate creator usage, supported API, limitations, integration status, and a working example when applicable. Descriptions must not promise integrations that do not exist. Technical docs and examples remain readable outside the UI.

## D-008 — Controlled development workflow

Scoped branches from `dev`, tests, PR review, explicit user approval before merge; `main` is not casually modified. Technical API/format changes require accompanying tests/docs. Product management notes are maintained in English for the public repository.

## D-009 — Proposed project-controlled editor modules (design intent)

The visual editor should eventually expose **Settings → Modules**, allowing users to enable available tools for their current video project. An external AI coding agent should be able to make the same change in a documented, versioned, validated project-local JSON file rather than editing the editor's React code.

**Responsibility split:** the application registers and authorizes trusted integration implementations; a project configuration names which available integrations are enabled; the editor owns placement in predefined UI extension slots (e.g. left tools, inspector, timeline actions, toolbar, specialized workbench). Human-facing visibility may differ from runtime dependence.

**Important constraints:** switching `enabled` to true cannot install code, import arbitrary packages, or grant filesystem permissions. Unknown or unsupported module IDs must fail safely and be explained. Turning a tool off must not delete its existing project data or silently alter rendering. Keep the current `editorComponents` mechanism and preview sandbox boundary intact until a concrete integration requires extension.

**Status:** discussed product direction, **not an implemented setting or approved schema**. No `editor.config.json` format, slot descriptor, or editor-module loader is standardized yet. TASK 005 provides a concrete subtitle inspector integration, but does not implement project module activation or a general slot system. Use that integration as evidence when deciding whether more configuration is needed; do not design a universal plugin system in advance.

## Open choices — not decisions

The media registry's first schema is documented in `docs/PROJECT_MEDIA.md`; portability and relative-path policy, relinking, optional proxy/cache handling, model installation UX, multiple compositions per project, and the exact activation/visibility schema and editor extension slot API remain open. Do not treat these as settled architecture.

## D-010 — One canonical Timeline with module-owned content (approved product direction)

The editor must allow multiple module instances to coexist on **one canonical Timeline**, with stable ownership of groups/layers/child elements. A module operation may modify only its explicitly targeted content; a generic component type or shared Captions track is not sufficient authority to replace unrelated clips. Module instance identity, layer identity, and provenance must be distinguishable from UI grouping and content/media type. External coding agents and the UI must read/write the same validated project data (D-002).

**First proof:** the Subtitles module, with independently identifiable manual captions, a Whisper transcription associated with an audio asset, and a Codex-created revision. Preserve existing project data and public contracts wherever possible. Hierarchy shape, storage format, migration, and editing APIs require an implementation audit; this decision does **not** approve a new schema or generalized plugin framework.

## D-011 — Preserve and compare transcription versions (approved requirement)

Local Whisper output is an **unverified draft**, not authoritative lyrics. Generating or regenerating subtitles must not silently replace manually authored captions, a separate transcription, or an external agent's revision. A transcription set should retain source-audio association, stable identity, and derivation/provenance. An external Codex agent should be able to read documented JSON/APIs and create a **separate revised set** without overwriting the Whisper original; no in-editor chatbot is required.

Both sets must be discoverable as separate layers under Subtitles. Each layer needs independent editor visibility and layer-wide appearance controls (at least position and color), while individual clips may override shared appearance. Canvas/MP4 visibility must be deliberate and consistent; hiding a group **only for Timeline organization** must never implicitly hide content from the render. Workflow must support explicit add-new, replace-selected-set, and cancel actions. Exact schemas and migration remain open.

**Acceptance:** source MP3/WAV → Whisper original → Codex revised layer → independent compare/show/hide/style → safe save/reload/Undo → matching preview and MP4. Never fabricate missing acoustic timing.

## D-012 — Reusable Text foundation without ownership confusion (approved direction)

A common Text capability should define reusable typography and Inspector controls: font, size, color, alignment, position, named presets such as H1/Body/Caption, and per-instance overrides. Subtitles owns timing/transcriptions, Kinetics owns motion and bubble behavior, and scene modules own their visual composition; **each consuming module retains ownership of its text layers**. A dedicated Text tab may manage styles, but modules use stable data/component interfaces, **not the tab's UI implementation**. Do not force all text into subtitle clips or reimplement typography in every module. Audit present editable-field/renderer contracts before designing storage or APIs; migrate existing modules incrementally, not through wholesale rewrites.

## D-013 — Timeline views are projections, not alternative project data (approved direction)

With many layers, users must be able to group by module/instance or by content category (audio, text, image, video), filter to e.g. **Show Only Audio**, and edit elements belonging to different modules against a shared time ruler. These are **UI projections of the same canonical elements**, not copied clips or separate Timelines. Filter/group visibility must not change media playback, Canvas output, saved content, or MP4 rendering. Future saved views, pinned layers, and waveform-assisted audio alignment remain deferred. Investigate performance for projects with ~100+ layers.

## D-014 — Reproducible public releases and compatibility (approved direction)

Open-source users must be able to base custom projects/modules on a **specific immutable tagged release** rather than track `dev`. Intended workflow: `main` represents stable code, `dev` integrates future work via reviewed feature PRs, GitHub Releases/tags identify exact versions; maintain `release/1.x` only when support for older versions is warranted. Compatible patch versions and explicit migration guidance protect versioned JSON/public APIs. User-owned projects/media must not be silently overwritten by application updates. Upgrades of modified core source cannot be promised conflict-free. Future community contributions use forks/PRs/review/CI and protected branches. **No V1 release, release branch, GitHub setting change, or specific support term is authorized by this direction.**

## Additional open architecture choices

Determine minimally sufficient layer/instance identifiers and scoped edit commands; how groups and inherited text styles are represented and migrated; editor-only versus render visibility; transcription comparison UX; safe external-agent edit/reload workflow; multi-audio tracks/mixing; image asset registration versus scene image usage; release compatibility matrix and migration tooling. These remain design questions, not shipped features.

## D-015 — Core editor first, specialized modules second (approved product direction)

FloxBow must remain a **single conventional video editor** for users, with an extensible core behind it. Ordinary Text, Audio, Image and Video clips can be placed directly on standard Timeline tracks **without requiring a specialized module**. Specialized module instances (e.g. Subtitles, Kinetics, Travel Scenes) own their groups/layers and module-specific logic, **but share the same canonical Timeline model, time ruler, selection, editing commands, project persistence and preview/render pipeline**. Do not create a second Timeline or a separate duplicate media editor for modules.

Core capabilities and their consumer-facing contracts are: Timeline/tracks/grouping; text/typography; media registry/import/relink and image/video placement; multi-audio playback/mixing; transforms/layout; animation/keyframes; compositing/effects; Inspector/property declarations; selection/copy/paste/duplicate/delete and Undo/Redo; project schema/validation/migration; time synchronization; playback/export; and clip/group visibility, lock, solo or mute where applicable. **This list defines intended ownership and API investigation, not a claim that all capabilities exist today.** Core owns reusable mechanisms; modules provide specialized behavior, validate their data and declare supported operations. Rendering and project edits must obey module ownership and explicit user scope.

**Unified Media Library:** one visible library should handle audio, images and video using stable asset IDs, with drag-to-Timeline placement on compatible existing or newly created tracks. The same media may be referenced by multiple clips without copying the source file. The existing single, fixed soundtrack and hidden Use as soundtrack flow are intermediate implementations, not the intended final workflow. Multi-audio clips require proven seek, mix, trim/volume and MP4 parity, not just extra UI rows.

**Core API contract first:** audit existing `@motion/sdk/*`, EditorSession, media registry, Electron IPC, Remotion player/render, Inspector and module integrations. Produce a versioned draft **Core API Contract V1** documenting existing/reusable versus missing APIs, ownership and permissions, declared capabilities, error handling, undo/atomic transactions, persisted identifiers, migrations and parity tests. API names are provisional until audited; avoid inventing public methods prematurely. Prove the API with both (a) an ordinary standalone Text/media clip and (b) a module-owned Whisper/Codex subtitle layer, across edit/save/reload/preview/MP4. No implementation is authorized merely by recording this decision.

**Delivery strategy:** organize foundation work as one integrated Core Editor V1 milestone and one shared end-to-end acceptance project, but use reviewable increments and fast targeted checks during development; retain full CI and cross-system regression checks at integration boundaries. Do not postpone all validation until the end or promise a release named v1.0.0 before release readiness.


## D-016 — AI-first bidirectional project data is the primary Core acceptance contract

FloxBow is a **JSON-driven video editor with an external AI coding-agent workflow**, not a React composition editor with optional JSON export. A new project's canonical files (possibly multiple versioned JSON documents) are the source of truth for every **supported** editable value. The UI and external agents must operate on the same validated clip/asset/property identities. A visual Inspector edit is persisted into that data on explicit save or documented autosave; an external, valid, atomic edit refreshes a clean editor without losing selection or rendering fidelity. Dirty human drafts must not be silently overwritten, and external changes must not be silently discarded. Each value has one persisted owner; React may maintain a temporary draft but must not hide a competing creative source of truth.

**Concrete first test:** create standalone Text in UI, save, edit its X/Y/text/color in project JSON as Codex, see new values in Canvas/Inspector, adjust them in UI, save and verify JSON plus MP4. **Next test:** import image once into Media Library (asset ID), place at six seconds as a separate clip ID, edit placement via JSON and UI, and verify the same round trip. A module-owned Whisper/Codex subtitle layer must eventually follow the identical contract. File layout and API naming are audit-driven; do not preapprove a new schema or unsafe plugin execution.

Supported existing module animations may be instantiated/configured by agent-authored data without modifying React; unknown types must fail clearly while preserving original data. Agent access is through documented data/contracts, never arbitrary executable project JSON.


## D-017 — Scenes, explicit ripple editing, and AI-safe timeline operations

**Intent:** A video is naturally planned as a sequence of **scenes** with stable IDs, start/duration in integer frames, and associated clips/layers. Scenes are a **Core timeline organizing and timing concept**, not an isolated Timeline per module. They may include ordinary Text/Audio/Image/Video clips and module-owned layers; scene membership must not erase clip identities, module ownership or the canonical JSON source of truth. Scene schema and API names are **proposals pending implementation audit**, not shipped features.

**Two different operations must never be confused:**

1. **Trim/extend selected clip only:** change a subtitle/image/text/other clip's duration within the existing scene, without changing scene duration or shifting later clips/scenes. Show a bounded conflict/overlap warning if needed. A clip crossing the scene end requires an explicit resolution, not silent scene growth.
2. **Expand/contract scene with ripple:** explicitly change a scene's duration by `deltaFrames`. Shift every **following scene** by the delta. Within the edited scene, optionally ripple only the elements after the specified edit boundary/anchor by the same delta, while preserving relative offsets and clip IDs. Elements before that boundary stay where they are. Clearly define policies for clips crossing the boundary, linked audio, locked tracks, and project duration; reject or preview ambiguous operations rather than silently corrupt synchronization.

A scene handle may trigger the explicit scene-ripple operation; an ordinary clip trim defaults to **clip-only**. UI must display which mode is active and preview what moves. Changes are a single validated, atomic, undoable transaction with save/reload/render parity.

**AI contract:** Codex should preferably call or author a **declarative validated Core edit operation** (target scene/clip ID, requested duration/frame delta, mode, boundary and scope), rather than manually recompute dozens of JSON timestamps. Core evaluates the operation and persists its resulting canonical project JSON; JSON is still the source of truth. An agent may edit documented JSON directly for simple changes, but must use the same invariants and validation for structural/ripple changes. Provide capability discovery, precise errors and conflict checks. No automatic AI interpretation of ambiguous user intent as ripple.

**When:** record and design this now, but implement scene ownership/ripple once Core clip types, shared editing transactions, and Timeline foundations are stable. Not a blocker for the initial Image Media Library slice.


## D-018 — Agent integration is protocol-independent: Core API + Skills + CLI, optional MCP

**Decision (2026-10-23):** FloxBow's canonical versioned project JSON and validated Core edit operations remain the source of truth and execution authority. Agent-specific adapters must **not** duplicate editing algorithms, invent hidden state, bypass revision/conflict checks, or require an agent to reverse-engineer React code for supported tasks. All human UI controls and AI-facing methods consume the same capability/property schemas and Core transactions.

**Discovery:** Core/module capability registry must describe installed clip kinds, effects/animations, editable fields, constraints, supported operations, version compatibility, ownership and permissions; unsupported capabilities return actionable errors without silently destroying data. An agent can inspect project JSON directly for simple edits, or use atomic validated operations for structural edits such as scene ripple, linked timing, clip creation and ownership-aware changes.

**Preferred layered access:** (1) canonical JSON and Core library/API first; (2) concise, versioned **Agent Skills** for discoverable workflow guidance and module-authoring instructions, loaded only when relevant; (3) a thin **CLI** (and optionally local API) for capability discovery, validated edits, lint/validate and renders; (4) a thin **MCP server** only when interoperability with supported agents has a demonstrated use case. Skills teach, CLI/API/MCP perform actions, and JSON persists state. Avoid dumping a large list of tools or all documentation into every AI context.

**Extensibility:** If an installed module already supports the requested animation, an agent discovers its declared interface and configures it in project data. If not, an agent with appropriate development permissions may use SDK and targeted guidance to propose/build a module; project JSON cannot execute code or install arbitrary modules, and MCP does not grant code-execution permissions automatically. Module/plugin loading and trust are separate decisions.

**Timing gates:** document these interfaces *now*; implement only necessary Core capability discovery as the Text/Image/Video/Audio/scene APIs stabilize. Revisit a minimal Skill + CLI proof **after** the first reliable Media Library/Image AI↔JSON↔UI↔MP4 slice. Decide whether to implement MCP **after** stable shared Core operations and at least one real external-agent automation scenario, weighing token/context cost, security and maintenance. No MCP implementation is authorized by this decision.


## D-019 — Direct-manipulation Inspector controls for a modern FloxBow UI

**Direction (2026-10-23):** The Core Editor should favor intuitive spatial controls, not require users to hunt through separate numeric fields for routine placement. For position, offer a compact **2D joystick/XY pad** that supports continuous movement in all directions, including diagonals, plus direct Canvas dragging/gizmos. For rotation, offer a **circular dial/ring** that the pointer can rotate naturally, plus an editable exact angle. Preserve numeric X/Y/angle entries for precision, keyboard accessibility, reset and advanced workflows; graphical controls supplement rather than replace accurate input.

All interactions update the **same validated canonical transform properties** exposed through Inspector, project JSON, Core API and future CLI/Skills/MCP. Reuse these controls across standalone Text, Image, Video and module-owned elements. Avoid creating UI-only animation/transform state or component-specific competing values. Support visual focus feedback, drag preview, commit/cancel, Undo/Redo and a single undoable gesture/transaction rather than dozens of undo steps. Coordinate system, percentage/pixel conversion, anchors, snapping and angle conventions must be specified before implementation.

**Timing:** Document UI/UX behavior now. Prototype the XY control and circular rotation dial when implementing **shared Core Transform/Inspector controls**, ideally alongside Image placement once basic Image JSON/Canvas/MP4 parity is proven. Do not expand the initial Image PR solely to create a full visual control redesign. No implementation authorized by this decision.


### D-019 UX clarification — selection-first quick controls (2026-10-23)

The XY joystick and rotation ring are **quick Inspector controls for an already-selected Timeline/layer item**, particularly when text is small, overlapped or off-canvas and hard to hit with a pointer. The user selects the item in the Timeline/layer list; the controls immediately manipulate that item without requiring canvas hit-testing. Continuous diagonal XY movement, rotary pointer movement, live Canvas feedback, exact optional fields, Center/Reset and fine/coarse adjustment should share canonical JSON properties and a single undoable gesture. Keep direct Canvas manipulation optional rather than a prerequisite. Design/prototype at the shared Transform Inspector phase after the Image round-trip, not in the first Image PR.


### D-019 priority refinement — direct Canvas manipulation is a Core requirement

**Observed usability need (2026-10-23):** Selecting an element only through tiny Inspector inputs makes manual video layout unnecessarily difficult. All **visual, spatially transformable** Core elements (Text/Image/Video and module-owned visual content) must be selectable in the Canvas and expose a consistent overlay: move by dragging, resize using corner/edge handles with appropriate aspect-ratio behavior, rotate by a rotation handle, plus visible selection bounds. A user should be able to position and size an element without searching through the Inspector. This must work for small, overlapping or out-of-frame content via a synchronized Timeline/layer selection and the quick Inspector XY/rotation controls. Non-spatial elements (e.g. audio) and locked/hidden items need intentional, type-appropriate selection behavior; not every clip literally gets spatial handles.

**Architecture:** Core owns the canvas hit testing, selection overlay, drag gesture, pointer coordinate conversion, snapping/bounds, shared transform data and single undoable transaction. Modules declare whether and how their visual elements support transforms rather than reimplementing handles. Canvas drag, quick XY/dial, numerical Inspector edits, AI JSON and MP4 must all use the same validated canonical values. Handle UI overlays appear in editor only and must never be exported into video. Protect timeline/playback selection and existing project behavior.

**Priority:** treat foundational select/move/resize/rotate Canvas UX as a near-term **Core Transform milestone**, reviewed after the Image clip round-trip or alongside shared transform work; it ranks ahead of cosmetic Inspector redesign and advanced effects. Do not silently expand the first PNG import PR without explicit scope review.


### D-019 interaction refinement — Canvas playback and multi-selection

The existing embedded Remotion-based player is a **preview transport**, not a reason to defer direct Canvas selection and transform manipulation. Preserve the current preview/render integration for now; investigate unreliable Play/Pause using concrete reproduction steps rather than replacing the player speculatively. **Space toggles Play/Pause** when focus is in the editor/Timeline/Canvas (not a text input, textarea, editable content or modal control where Space has another purpose). Playback controls and keyboard state must remain synchronized, including after seeking and dock/undock.

Core Canvas selection must progress from single to **multi-selection** of transformable visual elements via Shift/Ctrl/Cmd-click and, where appropriate, marquee selection. Selection synchronizes with Timeline and Inspector. Apply move/resize/rotation to the selected group through shared validated transforms, with consistent relative positions, one Undo transaction and explicit lock/module-ownership constraints. Canvas click targets, editor-only overlays and keyboard shortcuts must not appear in MP4. Preserve selection via Timeline/layer list for tiny or overlapping elements. Design exact modifiers for Windows/macOS consistently before implementation.

**Priority:** basic keyboard Play/Pause and player reliability are near-term standalone usability fixes; Canvas selection/handles and multi-selection are shared Core UI milestones after the first Image clip or sooner if a safe focused slice is feasible. Avoid bundling them into the Image import PR.


## D-020 — Human-readable time display; frames remain canonical

**Decision (2026-10-23):** FloxBow's persisted Timeline and Core APIs retain **integer frame positions/durations** for deterministic synchronization, migrations and rendering, but the ordinary editor UI should show and accept **seconds and milliseconds** (for example `00:06.500`) instead of exposing raw frame counts everywhere. This applies consistently to Timeline ruler/tooltips, playhead, clip start/end/duration, scene duration, subtitle timings and Inspector fields when practical. Advanced frame/timecode display may remain an explicit option for precise frame editing, not the mandatory default.

**Conversion:** use each project's real FPS (including non-integer frame rates where supported). Time edits must snap/round to representable frames with an obvious displayed result; never imply sub-frame accuracy when video can only land on a frame. Avoid cumulative drift by computing from canonical frames rather than repeatedly converting displayed floats. Specify formatting for durations above one minute and inputs, keyboard edits, boundaries and locale before implementation. External agents still see frame-based versioned JSON plus documented conversion helpers; do not change the existing JSON schema merely for UI formatting.

**Timing:** prioritize as near-term editor usability work, ideally a focused reusable time-input/formatter PR after existing stability gates; implement independently from PNG Image and Canvas transform overlays.
