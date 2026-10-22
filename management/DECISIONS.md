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

**Status:** the first linked-audio registry and development-shell registration flow are implemented in `dev` through PR #8. TASK 008 adds explicit removal of one registry entry and documents safe external-agent edits. The schema uses absolute host paths, so references can be machine-specific. Preview, render, timeline, playback, relinking and Whisper adapters remain unimplemented. An external agent must have real filesystem permission/access to read the media; path knowledge alone is insufficient.

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

## D-010 — Shared Timeline editing commands

Selection, clip operations, playback transport, and undo/redo belong to shared editor infrastructure. Components provide content, declared properties, identity through stable clip IDs, and optional operation constraints through trusted timeline behavior metadata. The EditorSession remains the only document and save owner; docked and detached Timeline views issue the same validated intents. Timeline v1 remains unchanged. The current implementation is single-selection; group operations are future work. Soundtrack remains fixed and protected until moving audio is verified through both preview and MP4 rendering.

**Duration policy:** the saved project duration remains the preview/export boundary and is never inferred down from clip content. Playback stops at that boundary rather than looping. Long empty intervals are reported before render with adjacent clip IDs, while intentional blank time and project duration remain untouched.

## Open choices — not decisions

The media registry's first schema is documented in `docs/PROJECT_MEDIA.md`; portability and relative-path policy, relinking, optional proxy/cache handling, model installation UX, multiple compositions per project, and the exact activation/visibility schema and editor extension slot API remain open. Do not treat these as settled architecture.
