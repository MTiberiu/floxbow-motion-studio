# Capability and Idea Backlog

This is a **product idea inventory**, not a promise or authorization to implement every item. Consult [ROADMAP.md](ROADMAP.md) for sequencing and [DECISIONS.md](DECISIONS.md) for agreed principles. Technical, evidence-backed changes belong in `improvements/proposals/`.

## Existing foundation — verify actual integration before reuse

| Capability | Current position |
| --- | --- |
| Project loader and project scaffolding | Implemented; single project directory, validated manifest and composition. |
| Timeline / SDK / editable components | Implemented core frame-based timeline and clip editing; not a universal plugin host. |
| Remotion player and renderer | Implemented, with separate preview and CLI render boundaries. |
| Lyrics sync, subtitles, Whisper adapter | Partial tools exist; no complete in-editor song-import-to-timeline workflow. |
| Animation library (text, chat, pop, counter, karaoke, fade) | Reusable code examples; many are composition-level, not individually editable timeline clips. |
| Capabilities Explorer | Implemented creator and developer/AI views; continue improving accuracy as modules mature. |

## Next candidate modules / integrations

| Idea | Status | Purpose / unresolved questions |
| --- | --- | --- |
| Subtitle editor integration contract | Next (TASK 005) | Establish documented, testable timeline, inspector, preview, render and file edit seams. |
| Media Registry | Concept, needed before audio import | Reference local files by stable ID; store paths, types and minimal metadata; no implicit media duplication. |
| Media Resolver | Concept | Resolve linked media for editor, audio analysis and rendering with suitable access/security boundaries; handle missing files. |
| Link / Relink Media UI | Concept | User selects local assets; later reconnects moved sources without losing clip edits. |
| Audio transcription runner | Planned vertical slice | Expose optional local Whisper analysis, failures and model prerequisites through a clear workflow. |
| Lyrics reconciliation / approximate timing | Planned vertical slice | Align authoritative lyric line breaks to imperfect word/segment estimates; carry uncertainty. |
| Copy AI Alignment Task | Planned vertical slice | Generate a concise project-specific prompt with real document paths and task constraints. |
| Canvas/timeline selection → Copy AI Edit Request | Concept | Clip ID, frame/time, selected element, user feedback; optional saved annotations. |
| Module activation configuration (per project) | Concept / design before Lyrics UI | Human toggles available, trusted editor integrations in Settings; external AI can edit the same validated JSON without reading React internals. Configuration is not executable code. |\n| Editor extension slots | Concept / design before Lyrics UI | Stable UI areas such as left tools, inspector, toolbar, timeline actions, and specialized workspaces; modules declare intended contributions; shell owns positioning. |\n| Module catalog / activation boundaries | Concept | Distinguish installed/registered, enabled for project, and visible in UI. Handle unknown IDs, incompatible versions, dependencies and unavailable integrations clearly. |\n| Project-specific editor tool panels | Concept | Support specialized audio/animation/media workflows without embedding everything in one shell. |
| Scalable media browser / batch import | Concept | Hundreds or thousands of media references; performance and indexing require measured tests. |
| Explicit collect/package project | Deferred | Intentionally copy linked assets for portability when requested. |
| Audio waveform and improved word alignment | Concept | Useful for manual adjustments; complexity and accuracy to be measured. |
| Optional character/mascot animation and 3D modules | Deferred | Reusable extensions after core human/AI editing workflow is proven. |

## Questions to revisit

1. How are local absolute paths, project-relative paths and portability handled across Windows/macOS/Linux?
2. How does the desktop securely grant a preview or renderer access to a linked source outside the project directory?
3. Should a media reference optionally have a cache/proxy, and who owns its lifecycle?
4. What does the editor do with a missing source during preview, analysis and rendering?
5. How does a project opt into different editor panels without broad core modifications? Which slots and minimal descriptor are actually needed by the first Lyrics workflow?
6. When are multiple compositions/outputs per project needed?
7. Should application-wide module visibility defaults be inherited by project settings, and how are conflicts resolved?\n8. How should enabling/disabling modules affect existing clips, rendering and project portability? Disabling a UI tool must not delete content or silently break render.\n9. What exact annotation shape is useful for future AI edit requests, without building a notification service?

## Triage rule

Promote an idea to a scoped task only when a concrete user scenario and acceptance test exist. Preserve the distinction between **implemented**, **planned**, and **conceptual**.
