# AI Documentation & Human–AI Collaboration Architecture

**Status:** Proposal only. This document describes a documentation system to implement in later, separately reviewed changes. It does not introduce an API, module, workflow service, or project format.

**Audited against:** `dev` commit `127418d762668b6f00ada602c22bfd36b520e45e` on 2026-10-21.

> **Historical audit notice:** Statements below about Media Registry audio not reaching preview, rendering, Timeline clips or Whisper, and about requiring supplied lyrics before transcription, describe the audited 2026-10-21 state. PR #25 and PR #26 later implemented the live-development soundtrack and direct Whisper-to-Timeline workflows. For current behavior, follow [Create a video](../../docs/CREATE_VIDEO.md), [Project Media](../../docs/PROJECT_MEDIA.md), [Lyrics Sync](../../docs/LYRICS_SYNC.md), [Timeline Editor](../../docs/TIMELINE_EDITOR.md), and the [module index](../../docs/MODULES.md). This proposal is preserved as an engineering record; its original audit and example are not current operating instructions.

## Purpose and boundaries

FloxBow documentation should let a person or coding agent start with a small map, find the one subsystem relevant to a task, and then use that subsystem's real public contract. The repository should distinguish reusable implementations, technical examples, user video projects, experiments, and proposals. Documentation must describe the implementation that exists at the reviewed commit; a design proposal or backlog row is not an available feature.

This proposal does not reorganize existing documentation, update the root `README.md` or `AGENTS.md`, add placeholder module files, alter project data, or implement the planned Review & Annotations capability. Follow-up PRs should make those changes in small steps after this architecture is reviewed.

## Current-state audit

The repository already has useful pieces: package export maps, a structured animation capability registry, real example compositions, contract tests, and a local documentation set. The gaps are ownership, routing, and freshness rather than a lack of prose. One verified API mismatch is already present: the `narration-audio` registry entry declares both `Narration` and `AudioReference` under `@motion/audio`, but that package exports only `Narration`; `AudioReference` comes from `@motion/sdk`. The existing registry test checks the package subpath, not its named symbols, so it does not detect this error. Correct the entry in a separate, scoped registry update rather than expanding this proposal-only PR.

| Area inspected                                                                                                  | Concrete finding                                                                                                                                                                                                                                               | Consequence                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`README.md`](../../README.md)                                                                                  | Gives setup, project privacy, major boundaries, Lyrics Sync, and links to central guides. It also includes detailed feature and limitation summaries.                                                                                                          | Keep its first-run and user-facing role; move detailed API and subsystem behavior toward owned module guides over time.                                                          |
| [`AGENTS.md`](../../AGENTS.md)                                                                                  | Contains project safety rules and a video workflow, and directs every video task to several guides plus the capability registry. It also contains module boundary details and a statement about the initial foundation task.                                   | The entry point asks agents to load more context than every task needs. Separate durable repository constraints from workflow preferences and route by task intent.              |
| [`docs/`](../../docs/ARCHITECTURE.md)                                                                           | Architecture, creation, SDK, animation, timeline, lyrics, and media guides overlap in examples, limitations, and integration descriptions. The Timeline guide retains detailed editing/API content.                                                            | Central documents need clear cross-system responsibilities; module-specific detail can move near source only in later PRs.                                                       |
| [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) and [`management/ROADMAP.md`](../../management/ROADMAP.md) | Verification records a Golden Starter run with 10 tests; the current registry tests and later workspace work postdate that snapshot. The roadmap still describes TASK 008 as in progress and cites an old PR #6 merge SHA.                                     | Status and execution records need an explicit “verified at commit/date” scope and owners must refresh stale status when a related implementation changes.                        |
| Package exports                                                                                                 | `@motion/sdk` exposes root, `./timeline`, and `./editor`; `@motion/lyrics-sync` exposes root, `./subtitles`, and `./component`; player, project-loader, animations, audio, and renderer have the export maps in their package manifests.                       | The export map, not an internal `src/` path, is the authority for import instructions. These workspace package names are not a promise that packages are published externally.   |
| Module documentation                                                                                            | `packages/lyrics-sync/` is the only package with a README and focused API/extension guides. Other package responsibilities are described mainly in central docs.                                                                                               | Documentation ownership is inconsistent; a small module can use one README, while separate files should be justified by distinct tasks.                                          |
| [`packages/animation-library/registry.json`](../../packages/animation-library/registry.json)                    | Holds stable capability IDs, descriptions, prompts, API path/symbol, parameters, integration notes, limitations, documentation paths, and example references. It contains both creative components and core capabilities.                                      | Reuse it as the detailed source for individual capabilities; do not duplicate those descriptions in a second catalog. Add a separate subsystem index for routing across modules. |
| Registry checks                                                                                                 | `tests/foundation.test.ts` validates the registry schema, package export path, documentation-file existence, and example-file existence. It does not verify that each declared symbol is exported or validate Markdown links throughout the repository.        | Keep existing checks and close the symbol/link gap with the smallest maintainable validation in a later PR.                                                                      |
| [`examples/capabilities/`](../../examples/README.md)                                                            | Examples are real, typechecked technical integrations and are distinct from user projects. `visual.tsx`, `subtitle.tsx`, `lyrics.ts`, `timeline.ts`, `player.tsx`, `renderer.ts`, `projects.ts`, and `audio.tsx` demonstrate current seams.                    | Index examples by module and label synthetic timing; never use them as evidence of real audio alignment.                                                                         |
| [`docs/PROJECT_MEDIA.md`](../../docs/PROJECT_MEDIA.md) and source                                               | The host registry links MP3/WAV files and resolves them in Node. It does not connect those external paths to preview, rendering, timeline clips, or Whisper. The lyric CLI accepts project-relative audio/lyrics files and writes estimates under `out/<id>/`. | Agents must not imply that registering an external file automatically makes it playable or available to the lyric worker.                                                        |
| Shell/workspace                                                                                                 | The shell has a static panel registry in `apps/desktop/src/WorkspaceManager.tsx`; it is not dynamic package discovery. Editor is currently a composite panel.                                                                                                  | The module index should describe actual shell integration without claiming a general plugin system.                                                                              |

The current exports also ground an important creative example: `@motion/animations` exports `KineticText`, `ChatBubble`, `ComicPop`, `Counter`, and `KaraokeWords`; `@motion/audio` exports `Narration`; `@motion/lyrics-sync/component` exports `subtitleModule`; the SDK exports composition and timeline contracts; and `@motion/renderer` exports `renderProject`. There is no character rig, lip-sync, text-to-speech, waveform editor, or media-registry-to-preview adapter. A project may implement a one-off visual character in its own composition, but that is project-local code, not a reusable FloxBow module.

## Proposed documentation levels and ownership

| Documentation surface                                      | Owns                                                                                                                                    | Read it when                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `README.md`, `AGENTS.md`, and central `docs/` guides       | Application behavior, repository-wide safety/compatibility rules, cross-system architecture, and navigation                             | First run, ordinary video creation, or any task needing system-wide context                                     |
| Module guide and its concise roadmap                       | One module's implemented capabilities, limitations, APIs, examples, workflows, extension contract, compatibility, and next improvements | The task has been routed to that module                                                                         |
| `management/ROADMAP.md`, `DECISIONS.md`, and `BACKLOG.md`  | Cross-module product priorities, durable product decisions, and candidate ideas, respectively                                           | Application planning or when a relevant product decision/priority is needed                                     |
| `improvements/proposals/`, `experiments/`, and `accepted/` | Detailed engineering designs, investigations, acceptance criteria, and recorded technical decisions                                     | Application/core development that needs the relevant design history; never required for ordinary video creation |

### Navigation by task

For ordinary video creation, read the root entry guidance, use the module index to select the relevant implemented capability, and open only that module's workflow/API guide plus the project-creation instructions. Do not require reading management records, experiments, or engineering proposals. For application or core development, start with the same concise entry guidance, then read the architecture overview, the affected subsystem guide, and only the relevant engineering record under `improvements/`; consult management records only when the change affects product sequencing or an established product decision.

### Level 1 — Application map and rules

Keep the root [`README.md`](../../README.md) user-oriented: what FloxBow currently does, installation/first run, project privacy, and links to the next guide. Keep [`AGENTS.md`](../../AGENTS.md) short and action-oriented: repository safety/compatibility constraints, project-versus-shared-code boundaries, and a route to the relevant task guide. Neither should repeat complete API tables, module roadmaps, or implementation internals.

Use a small central set of cross-system guides:

- `docs/ARCHITECTURE.md` explains how the shell, project loader, modules, timeline, player/preview, media, and renderer connect, with security and compatibility boundaries.
- `docs/CREATE_VIDEO.md` gives the human-facing create, preview, validate, and render path, linking to only the module guides required for the chosen work.
- `docs/MODULES.md` is the concise subsystem and capability discovery index described below.
- `docs/AI_WORKFLOW.md` explains task routing, required human inputs/reviews, and how to keep work project-local or propose shared changes. Module-specific workflows remain module-owned.

Existing guides such as `CREATE_ANIMATION.md`, `STYLE_CATALOG.md`, `TIMELINE_EDITOR.md`, `LYRICS_SYNC.md`, and `PROJECT_MEDIA.md` remain in place until separate migration PRs decide whether their content belongs in a module README or remains a cross-system contract. Do not create another central guide that restates all of them.

### Level 2 — Module discovery index

`docs/MODULES.md` should answer “where should I look for this task?” in a short table. Each row contains a stable ID, category/responsibility, brief task-intent keywords, implementation status, and direct documentation path. Keep descriptions to one sentence. Group actual modules/subsystems separately from experiments and proposals.

Initial rows should cover the current source boundaries: desktop shell/workspace, project loader and media registry, SDK/composition, timeline/editor contract, lyrics synchronization and subtitle clips, animation capabilities, audio composition component, preview player/bridge, and renderer. Link package-owned documentation when available; until a module guide is migrated, link its current central guide and label that location accurately.

For individual implemented components, link to the existing animation registry rather than copying its detailed data. The registry already owns stable capability IDs, API paths/symbols, parameters, prompts, integration status, limitations, docs, and example IDs. It remains limited to implemented capabilities; proposed capabilities such as Review & Annotations belong in a clearly marked proposal/backlog section and must not be added as if they were runnable registry entries. Experiments link to `improvements/experiments/`; proposals link to `improvements/proposals/` or the management backlog.

Suggested index fields:

| Field                     | Rule                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| ID                        | Stable lowercase identifier; retain it across documentation moves.                         |
| Category / responsibility | Name the actual subsystem boundary, not a product aspiration.                              |
| Find this for             | A few natural-language intents or search terms, not a second full description.             |
| Status                    | Use the controlled terms below and state the evidence date/commit where needed.            |
| Docs                      | Link directly to the module-owned guide, or to the current central guide during migration. |

### Level 3 — Module-owned documentation

The module owns its documentation next to the implementation: ordinarily `packages/<module>/README.md`, or `apps/desktop/README.md` for a shell subsystem without a package. A small module can keep purpose, use, limitations, and extension guidance in one README. Add `API.md`, `WORKFLOWS.md`, `EXTENDING.md`, or `ROADMAP.md` only when the content has a distinct audience or is long enough to impede the main guide. Existing Lyrics Sync documentation is a working precedent, not a required file-count template.

The module guide should include the applicable parts of this contract:

- Purpose and responsibilities; implemented capabilities and explicit non-capabilities.
- Public imports verified against the package export map and actual exported symbols; parameters, defaults, serialized formats, and integration points.
- One minimal working example that runs or typechecks, and links to additional examples where useful.
- Dependencies, prerequisites, and required human-provided inputs.
- Human–AI workflow: AI actions, human choices, uncertainty handling, and review/approval checkpoints.
- Safe extension instructions, compatibility/version constraints, and tests to run.
- Current implementation status, known issues, proposed/approved next work, and concise relevant history.

Do not copy a capability's detailed parameters or limitations out of the capability registry into the module index. A module guide can explain the shared contract and point to registry entries for per-component details. The module owner updates its guide and examples in the same PR when behavior, exports, prerequisites, or user workflow changes. The central index owner updates routing/status links when a module is added, renamed, reclassified, or retired.

## Status, roadmap, and history conventions

Use a small controlled vocabulary, always with evidence scoped to a commit or review date when it can change:

- **Implemented** — the described behavior exists at the documented public boundary and has a working example or test appropriate to its type.
- **Partial** — some stated behavior exists, but named integration steps or limitations remain. List both explicitly.
- **Experimental** — code exists for investigation, but support or compatibility is not established; keep it out of normal reuse guidance unless marked.
- **Proposed** — design intent only; no claim of a usable implementation or API.
- **Deferred** — intentionally not scheduled for implementation.
- **Retired** — no longer supported; provide a migration or replacement path where one exists.

Use the same status words in module guides and the discovery index. A module guide is the source of truth for the implementation status and roadmap of that module. `management/ROADMAP.md` owns cross-module milestone order and application-level progress; it links to module guides for capability status and must not restate their detailed implementation state or plans. `management/DECISIONS.md` owns durable product/working decisions, and `management/BACKLOG.md` owns cross-cutting candidate ideas, not implementation status. An engineering proposal owns the status of its design/review/implementation record, not the status of a shipped capability. An API is not “implemented” merely because a proposal describes it. Capability registry membership means a concrete capability is represented there; it does not certify that every broader integration is complete. For example, `Narration` being implemented does not mean linked Media Registry audio is wired to preview or rendering.

When a PR completes, update the affected module guide in the same implementation PR with the current behavior, limitations, compatibility, and a short history link. Mark a related engineering proposal as implemented/decided and link the PR while retaining its detailed rationale and evidence. Update `management/ROADMAP.md` only if cross-module sequencing or milestone progress changes; update `DECISIONS.md` only when a durable product rule changes. Link to the authoritative record instead of copying its history or technical plan. The discovery index holds only routing, status, and links.

## Human–AI workflow and task routing

Document workflows as a compact sequence: **inputs → AI work → human decisions/review → validated output**. Explicitly identify required inputs and confidence. Unknown audio, lyrics, licensing, visual direction, or timing must be requested or left unknown; text alone is not timing evidence. When the editor can expose a precise action, guide the person to select/import/review the actual asset or clip rather than asking for a vague description.

For a task, the agent should:

1. Read the short entry guidance and `docs/MODULES.md`; do not preload unrelated module guides.
2. Select only the relevant module docs and verify source/export details when a public contract or implementation is in question.
3. Choose the narrowest route: reuse an implemented capability; put one-off composition/visual logic in the user's `projects/<id>/`; propose a reusable module change when more than one real use case needs it; change application infrastructure only when current contracts cannot support the request and the user authorizes that shared scope.
4. Explain material prerequisites and limitations in creator-facing language. Ask for missing essential input or a decision only when the work depends on it; continue independent work meanwhile.
5. Preview, validate, and report checks that actually ran. Preserve project and public format compatibility; never describe a proposal as available.

Repository-wide safety and compatibility rules belong in `AGENTS.md` and applicable subsystem contracts. User-specific workflow preferences—such as when to request architecture review, preview frequency, or merge approval—are not technical API requirements and must not be silently rewritten by a coding agent. Follow the human's explicit current instruction. A proposed improvement to established preferences is a separate suggestion requiring the human's approval before changing repository rules. Do not add a settings system for preferences as part of documentation work.

## Future Review & Annotations discovery

Review & Annotations is **planned, not implemented**. This proposal defines only its future documentation route: once a real module and versioned project-data contract are approved and implemented, give it a stable module ID, an owned guide covering references, persistence and compatibility, an example using real stored data, and a module-index entry marked `Implemented` only after tests and UI/API evidence exist. Before then, link the idea from the backlog/proposal as `Proposed`; do not add a runtime capability entry, project schema, import path, or pretend workflow.

## Documentation maintenance and validation

Every PR that introduces a module, changes a public API or format, changes a user workflow, completes a limitation, or changes module status should update the owning guide and any affected examples. Update the discovery index only when routing or status changes. Avoid copied roadmaps and duplicate API tables. Keep examples small and task-specific; prefer linking an existing example over embedding it again.

Use current tooling first: `npm test` validates registry schemas and referenced import paths/doc/example files; `npm run typecheck` checks workspace and technical example code; Prettier checks changed Markdown; `git diff --check` catches whitespace errors. The current registry test checks that an import path is exported but does not validate its named symbol, and there is no repository-wide Markdown-link checker. A follow-up may extend the existing lightweight test to verify declared symbols and local documentation/example links; add no new dependency unless real coverage needs it. A documentation PR should state exactly which checks ran and distinguish a check failure from an unexecuted check.

To limit context and stale links, use one-way navigation: README/AGENTS → central map → selected module guide → source/example only when needed. Module guides may link upward to the map and sideways to shared contracts; the central map must not reproduce module internals. Prefer stable relative paths over branch-specific URLs, and validate links when moving docs. Mark snapshots with a date/commit instead of calling old results current.

## Historical end-to-end discovery example (2026-10-21 audit)

The example below records the workflow assumptions at the time of the original audit. Use the current creator and implementation guides linked in the historical audit notice above for present-day tasks.

Request: **“Create a vertical cartoon video with a speaking character, synchronized audio, animated subtitles and comic dialogue bubbles.”**

1. Start at `README.md` and `AGENTS.md`, then use the proposed `docs/MODULES.md` to find project creation, audio, lyric timing, subtitle clips, animation, preview/timeline, and render. Read only the applicable module guides and the current [project creation](../../docs/CREATE_VIDEO.md), [lyrics synchronization](../../docs/LYRICS_SYNC.md), [timeline contract](../../docs/TIMELINE_EDITOR.md), and [media registry](../../docs/PROJECT_MEDIA.md) guidance while package-owned guides are introduced later.
2. Confirm the human's target project, vertical resolution/FPS, licensed audio, and authoritative lyrics. If audio or lyrics are missing, ask the human to supply/select them; do not invent lyric text or aligned timestamps. The existing Media panel can link MP3/WAV for registry tracking, but that external file is not currently playable in the composition or wired to transcription. The optional `npm run sync:lyrics -- <id> <project-relative-audio> <project-relative-lyrics.txt>` worker needs audio and lyrics accessible inside the project and produces estimated timings under `out/<id>/`; those estimates require listening/review.
3. For visuals, reuse `Canvas`, `Scene`, `ChatBubble`, `ComicPop`, and `Narration` from their actual exports. `ChatBubble` is a message treatment, not a speaking character; FloxBow has no character rig, lip-sync, or text-to-speech module. If the human wants a simple original cartoon character, implement it inside that project's composition with frame-driven code and supplied/approved artwork. Propose a reusable module only if the user wants that behavior shared beyond the project.
4. Use reviewed lyric timing to create/import editable `subtitleModule` clips. Keep subtitle text/timing separate from their appearance; uncertain word timing remains unknown or visibly unverified. The same validated timing can be styled through subtitle properties; do not imply automatic alignment from the Media registry.
5. Preview at representative frames in the Editor, adjust clip timing and properties with the human, save the editable timeline, run project validation/typecheck as applicable, and render with `npm run render -- <id>` only when requested. Report what was estimated, what the human reviewed, and any unsupported audio/character behavior.

This route is intentionally honest about the current gap between linked media metadata, composition-local audio playback, and lyric timing. The module index and owned docs should make such gaps visible before an agent writes code.

## Independently reviewable follow-up PRs

1. **Entry-point and navigation update:** after review, shorten README/AGENTS and add the central task router and module index, preserving current safety constraints and stable IDs.
2. **Documentation ownership migration:** add or move documentation only for modules being actively clarified, starting with SDK/animation, player/renderer, project-loader/media, and desktop shell. Keep Lyrics Sync as the first existing module-owned reference; remove duplicate central details only after links and examples are verified.
3. **Workflow/status update:** add human–AI workflow and implementation-status conventions to the affected module docs and reconcile stale roadmap/verification snapshots against merged `dev`.
4. **Lightweight validation:** extend existing tests for registry symbols and local references, then add only the minimal Markdown-link validation justified by the repository's link patterns. Keep each validation change independently reviewable.

Each follow-up should update only the relevant docs and examples, preserve public APIs and project formats, run formatting plus applicable typecheck/tests, and leave unrelated module documentation untouched.
