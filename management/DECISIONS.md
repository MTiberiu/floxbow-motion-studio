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

**Status:** approved direction under discussion; the referenced media registry/resolver and UX are **not yet implemented**. Referenced paths can be machine-specific. An external agent must have real filesystem permission/access to read the media; path knowledge alone is insufficient.

## D-005 — Correct lyrics are authoritative; audio timing is evidence

For song subtitles, the user's provided lyrics (including intended line breaks) are authoritative text. Whisper or comparable analyzers provide approximate transcripts and time boundaries, not guaranteed truth for singing. Reconciliation matches known lyric text to estimated segments, preserving repeats and uncertainties. Where word times exist, use them; otherwise estimate splits within observed boundaries. Manual timeline adjustment is expected.

**Data distinction:** original lyrics, raw analyzer output, tentative alignment evidence, and canonical editable timeline clips are separate kinds of data; do not create two competing final timelines.

## D-006 — First integration test is intentionally visually minimal

The first complete module exercise is **Audio + Whisper + Lyrics + Timeline**: linked song, correct lyrics, approximate subtitles, black background and white captions, editable clip timing, saved state, preview/render, and optional external AI refinement. Do not add decorative animations to prove the architecture.

## D-007 — Capability Explorer is a human/AI discovery surface

Capabilities are reusable implementations; examples are neutral technical demonstrations; projects are user creations. Explorer entries should communicate creator usage, supported API, limitations, integration status, and a working example when applicable. Descriptions must not promise integrations that do not exist. Technical docs and examples remain readable outside the UI.

## D-008 — Controlled development workflow

Scoped branches from `dev`, tests, PR review, explicit user approval before merge; `main` is not casually modified. Technical API/format changes require accompanying tests/docs. Product management notes are maintained in English for the public repository.

## Open choices — not decisions

The exact future media registry schema, portable/relative path policy, optional proxy/cache handling, model installation UX, multiple compositions per project, and extensibility of editor panels remain open. Do not treat these as settled architecture.
