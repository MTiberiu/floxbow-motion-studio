# FloxBow — AI Film Production System (design brief)

**Status:** Product requirements and engineering discovery request; NOT an implemented feature specification.  
**Source:** Product discussions about real AI-assisted film production, recorded 2026-10-27.  
**Target:** External coding agents working in local FloxBow projects; existing Electron / Remotion editor remains the visual surface.  
**Initial base:** `dev` at the time this documentation branch was created. Verify source and open PRs before claiming current capabilities.

**Persistent documentation branch:** `docs/ai-film-production-architecture` — use this branch for Manager/Director product notes; it is documentation-only and separate from `dev` and implementation branches. See [Branch ownership and cleanup](BRANCH-OWNERSHIP.md).\n\n## Start here

The desired experience is strikingly simple: **a canvas, a timed story, and an AI coding agent that can turn the story into a directed film.** Timeline, Inspector, detached panes and manual editing are powerful *optional tools*, not the product's fundamental proposition.

The user tells the story. **FloxBow guides the AI. The AI brings it to life.**

FloxBow is an **AI-native film-production toolkit and process**, not a text-to-video model, AI chatbot, autonomous cloud agent, or an attempt to reproduce every feature of a traditional NLE. One Codex agent may direct, prepare, animate and review the entire film; different agents may independently own those roles using the same durable project files.

Read these files in order:

1. [01 — Product vision, boundaries and non-goals](01-PRODUCT-VISION.md)
2. [02 — Entire-film directing and handoff workflow](02-PRODUCTION-WORKFLOW.md)
3. [03 — Director plan, API and data contracts](03-DIRECTOR-DATA-AND-API.md)
4. [04 — Production scaffold and existing timeline integration](04-SCAFFOLD-AND-INTEGRATION.md)
5. [05 — Director transcript, visual feedback and reusable motion](05-REVIEW-AND-MOTION.md)
6. [06 — Developer investigation, decision questions and acceptance](06-DEVELOPER-REVIEW-TASK.md)\n7. [07 — Current Director-first UI and hybrid shot product direction](07-CURRENT-PRODUCT-DIRECTION.md)\n8. [Branch ownership, known feature branches and cleanup policy](BRANCH-OWNERSHIP.md)

## Verified architecture anchors in `dev` (not new proposals)

- `scripts/project-scaffold.ts` creates `project.json`, `Composition.tsx`, `edit-timeline.json`, `scenes/`, `assets/`, and `timing/`. Project manifest and editable Timeline are distinct files.
- `@motion/sdk/timeline` owns frame-based edit clips; `docs/SCENE_EDITING.md` documents optional Timeline `scenes[]` and `sceneId` membership, already supported. **Do not build a second rendered timeline.**
- `docs/STORYBOARD.md` documents an existing separate Storyboard Designer, project-local `storyboard.json`, Scene/Set/object IDs, timed anchors, reference images, AI Visual Context requests, a Director Brief import/approval concept, local GET/PUT host routes, and `scripts/storyboard-context.ts` read commands. This is an especially important integration candidate; inspect implementation in the current branch.
- `scripts/editor-store.ts` already uses a project write lock, content revisions and atomic replacement; `scripts/storyboard-store.ts` has a parallel safe document contract. Reuse principles, don't blindly reuse code without audit.
- `docs/ARCHITECTURE.md` describes local Vite project watching, reload behavior, a detachable Timeline, Electron isolation and tightly scoped loopback routes.
- `@motion/animations` and the capability registry already provide reusable primitives. There is no mandate to build GSAP from scratch.

## Authority model

- **Narration/source timing:** supplied and saved audio/subtitles when available; do not fabricate their accuracy.
- **Director intent:** film-wide, semantic and artistic plan; versioned, reviewable.
- **Production assets:** reference / production provenance and shot requirements.
- **Implementation:** real project composition code, elements and canonical editable Timeline.
- **Review:** observations/evidence/deltas linked by IDs and frame ranges.
- **Human:** decides acceptance and can intervene at any time.

These are linked but **not silently overwritten by one another**.

## Scope of this branch

Documentation and developer questions only. No runtime, schema, editor, renderer or project data modifications; no merge or PR. The developer should first return an evidence-based analysis and staged recommendation, then request a scoped implementation decision.
