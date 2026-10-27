# 06 — Developer review task (READ THIS AFTER THE OTHER FILES)

## Assignment — analyze first, DO NOT implement yet

**Repository:** `MTiberiu/floxbow-motion-studio`  
**Documentation branch:** `docs/ai-film-production-architecture`  
**Purpose:** decide how to extend the existing local FloxBow application to support a complete, structured AI film-production workflow without duplicating working systems.

This branch contains a **product design**, not approved implementation details. Review all `docs/ai-film-production/01`–`05` documents and the existing code. Report recommendations **before writing application code or mutating user projects**.

## Mandatory source audit

1. `AGENTS.md`; `docs/AI_WORKFLOW.md`; `docs/MODULES.md`; `docs/ARCHITECTURE.md`; `docs/MODULE_INTEGRATION_BLUEPRINT.md`.
2. `docs/STORYBOARD.md`, `docs/SCENE_EDITING.md`, `docs/TIMELINE_EDITOR.md` and the current Storyboard, Scene, Moment, and AI Visual Context UI implementation.
3. `scripts/project-scaffold.ts`, `scripts/projects.ts`, `scripts/editor-store.ts`, `scripts/storyboard-store.ts`, `scripts/storyboard-context.ts`, project loader contracts and tests.
4. `@motion/sdk`, `@motion/sdk/timeline`, `@motion/sdk/editor`, `@motion/animations`, capability registry, renderer and actual preview bridge.
5. `management/DECISIONS.md`, `management/ROADMAP.md`, relevant open PRs and newer `dev` changes.
6. App workspace panels, detach/re-attach flows, saved audio/subtitle contexts, visual capture mechanics, security restrictions and build-vs-dev behavior.

Reference file/line numbers in your analysis. State what is **implemented**, **partial**, **documented only**, **proposed**, or **unsupported**.

## Architectural decisions for YOU to make recommendations on

### A — Reuse Storyboard or introduce a linked Director record?
We already have `storyboard.json`, Scene/Set/object identities, action plans, references, AI requests, timing context and Director Brief. Is that sufficient to extend with shot semantics and global film plan, or do we need a new `director/plan.json`? How do we avoid two versions of the same direction?

### B — How does an external Codex mutate plans safely?
Prefer project-local typed library/CLI if sufficient. Is a local API needed for UI refresh, or do existing watchers and endpoints already suffice? Define exact authorization, validation, revision/conflict handling, project path containment and live reloading behavior. **No embedded chatbot.**

### C — How do we generate the whole code structure from a reviewed film plan?
Describe deterministic function/file names, Scene/Shot wrappers, code-only versus Timeline-editable parts, safe repeat runs, dry run, source revision links and a plan-to-code registry. Protect previously authored TSX. Investigate integrating canonical Timeline scenes created **after** directing rather than recreating audio/subtitles.

### D — How do we represent narrative units, shots, events and 'breathing'?
Give fields and validation semantics for global start/end frames, evidence sources, overlapping actions, anticipation/action/hold and `locked/preferred/flexible` constraints. No per-subtitle automatic cutting; no hard-coded minimum shot duration.

### E — How does human review select and copy Director context?
Outline a minimal Director Transcript attached to existing Canvas/edit tools. Multi-select shot/events, actual playhead location, plan vs execution times, project-local source refs, visual capture and clipboard payload. Identify what is already implemented (especially current AI Visual Context) and what requires new code.

### F — FloxMotion, existing capabilities, GSAP?
Identify current usable animation APIs, safe extension points and whether any GSAP use has a clear benefit beyond Remotion frame-driven primitives. Ensure output determinism and real editability promises.

### G — Phase boundaries / migration
Does the guided plan create fresh data, extend existing Storyboard v1 with migration, or link new data with backward compatibility? How do plans created in the current Storyboard UX continue working? How do we avoid changing manifest v0.1.0 or Timeline v1 unnecessarily?

## Report format

Deliver a concrete **engineering analysis** in the agent response or a separate proposal doc as appropriate under `improvements/proposals/` (do not modify this requirements branch unless explicitly requested):

1. Current architecture inventory: source links / evidence.
2. Conflicts, overlap and exact reusable features.
3. Recommended design & why; at least two alternatives for data model/transport where meaningful.
4. Interfaces/contracts proposed, explicitly marked not implemented.
5. Incremental milestones with scope, risks, tests and acceptance criteria.
6. First small end-to-end prototype: whole-film sample plan → generate three scenes/eight shots → use existing Preview/Timeline → visual-context correction → no code overwrite.
7. Open questions requiring the human's decision.
8. Explicit statement of what you did **not** implement or verify.

### Decision checkpoint

**Stop after analysis.** Ask for review of the recommended architecture before making shared app-code changes. Do not open a PR, merge or publish a release without explicit authorization.

## Critical product non-negotiables

- Free project creation and experiments remain unrestricted; timed narration is a recommended guided input, not an unconditional technical gate.
- A Director reviews the **entire film** before systematic scaffold/production.
- Director intent, source timing, actual Timeline and review evidence are distinct.
- Existing Storyboard, Scene/Timeline, Visual Context and rendering contracts must be audited for reuse.
- No implicit audio/subtitle overwrite, duplicate Timeline, AI model integration or generic localhost command executor.
- Scene/shot code links back to stable Director IDs. Re-running scaffolding preserves Animator work.
- One external agent can perform all stages; stage contracts permit different agents to take over.
- A weaker agent gets precise asset/layer/timing requirements and validation feedback.
- Human can ultimately work with a **Canvas and timed story**, opening detailed tools only when wanted.
