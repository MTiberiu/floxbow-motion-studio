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
