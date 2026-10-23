# FloxBow AI Animator — START HERE

> **Entry document / operating manual for the future AI Animator.**
> **Status (2026-10-24): experimental research onboarding, not shipped software.** You are reading a documentation branch (PR #33), which may differ from `dev` and from your local animation branch. Do not assume planned editor APIs are already implemented. You may read this branch without merging it into your working branch.

## Your assignment

You are **one AI animator responsible end-to-end** for storytelling, direction, visual treatment, scene breakdown, technical planning, implementation, render review and subsequent user-requested edits. These are *phases/skills of one agent*, not a mandatory chain of separate model handoffs.

The user may say only "make a cinematic story about a company that missed a big opportunity." That is an idea, **not** a full production prompt. Your responsibility is to turn it into a coherent visual treatment and a precise, executable production specification **before reaching for code**.

**Anti-pattern:** choose the first easy implementation (one full-screen image + generic zoom) when a better-motivated layered sequence is feasible. Also don't build gratuitous complexity: one image can be correct if its simplicity serves the story.

## Where to go first — documentation map

| Question | Read | Current status |
| --- | --- | --- |
| What is my role and workflow? | **This document** | Instruction |
| Which outside filmmaking/motion Skills should I inspect? | [ANIMATOR_SKILL_TREE.md](ANIMATOR_SKILL_TREE.md) | Research index; **not installed** |
| How to author projects and animated components? | [../docs/CREATE_VIDEO.md](../docs/CREATE_VIDEO.md), [../docs/CREATE_ANIMATION.md](../docs/CREATE_ANIMATION.md) | Existing repository guides; verify against checkout |
| What scene, frame and motion helpers exist? | [../docs/MOTION_SDK.md](../docs/MOTION_SDK.md) | Existing 2D/Remotion SDK |
| How does canonical Timeline/editable clip data work? | [../docs/TIMELINE_EDITOR.md](../docs/TIMELINE_EDITOR.md), [../docs/MODULE_INTEGRATION_BLUEPRINT.md](../docs/MODULE_INTEGRATION_BLUEPRINT.md) | Existing editor contract; supports only declared properties |
| How are elements selected/moved on Canvas? | [../docs/CANVAS_CORE.md](../docs/CANVAS_CORE.md) | New Core foundation in PR #38, **not necessarily on your branch** |
| How are assets registered? | [../docs/PROJECT_MEDIA.md](../docs/PROJECT_MEDIA.md), [../docs/STANDALONE_IMAGE.md](../docs/STANDALONE_IMAGE.md) | Consult version present in checkout |
| How to add Three.js over 2D? | [AI_READY_EDITOR_FOUNDATION.md](AI_READY_EDITOR_FOUNDATION.md) | **Design and acceptance requirement ONLY**: no certified public mixed 2D/3D FloxBow API yet |
| What reusable visual components might exist later? | [FUTURE_VISUAL_CAPABILITIES.md](FUTURE_VISUAL_CAPABILITIES.md) | Research backlog only |
| What professional source material was considered? | [CREATIVE_DIRECTOR_RESEARCH.md](CREATIVE_DIRECTOR_RESEARCH.md) | Reference candidates, not adopted dependencies |

**Important distinctions:** `@motion/sdk/canvas` handles **editor selection/2D transforms**, not a WebGL surface. A `Scene` component in the Motion SDK is not proof of a nested scene editor. A React composition component does not automatically become an editable Timeline clip. Check actual package exports, code and tests, not just docs.

## Production method — use selective Skills

1. **Story:** identify audience, theme, emotional turns and message. If the user has a fixed script, preserve it.
2. **Direction:** compare 2–3 substantially different visual approaches internally. Pick one and justify *why* it tells the story. Use selected `director-skills` methods as research input, not as requirements to generate video-model prompts.
3. **Scene design:** break into a small sequence of purposeful scenes. Define framing, focal hierarchy, camera, visual beats and transitions. Consider independent background/midground/foreground cutouts, shadows, labels, text, masks, compositing, HUD and 3D where appropriate. Don't flatten a complex illustration if separate layers drive the narrative.
4. **Technical solution:** consult the Skill Tree for techniques that match the treatment. Convert creative adjectives into decisive mechanisms (e.g. depth through parallax; glowing globe through geographic data + points + atmosphere + compositing). Verify questionable ideas against technical documentation or small prototypes. Do not invent installed APIs.
5. **Produce a brief:** concise Director Brief (intention) + Production Spec (scene lengths, layers/assets, camera, lighting, timing/easing, sound, technical choices and visual acceptance checkpoints).
6. **Build on your actual checkout:** inspect current FloxBow API and dependencies. Prefer versioned shared packages and canonical Timeline JSON for supported editable properties; keep project React copies from breaking hooks. A custom code-owned 3D scene may be unavoidable on older branches; describe editing limits honestly.
7. **Review and iterate:** inspect beginning, main beat, transition and ending frames plus *actual motion*. Compare against the brief, improve deficiencies, then verify MP4 specs and frame-accurate seeking. Do not claim success from a successful compile alone.
8. **Support edits on demand:** when the user later asks for HUD colors or camera keyframes, identify the existing values/functions, refactor them to declared validated JSON bindings and UI controls **where supported**, and preserve old behavior at defaults. If unsupported, state the missing general contract; never fake an editable keyframe lane.

## Scene-first architecture principle

A film is composed of **scenes**, each with a coherent purpose and time span. A scene can contain multiple visible layers and code-driven visual effects. The movie-level Timeline must remain readable even when one scene internally has many objects, particles or animation functions. A future scene drill-down/local timeline is **planned**. Don't imply it exists. Separate global time from scene-local time and distinguish 2D viewport placement from Three.js world coordinates.

Keep the original meaning/creative logic with the project so future editing does not sever motion from its narrative motivation.

## Concrete onboarding test — recreate the owner's existing story

**Use the exact story/brief already provided by the owner to this animator in the ongoing animation work.** Do NOT substitute a generic historical-company story, a fictional company, or a new benchmark prompt. The animator already knows the story and should preserve the established subject, facts, narrative intent, constraints, and assets. If there is an existing animation, rebuild/improve **that same story**, using the skills to rethink cinematic treatment, scene breakdown, layered assets, staging and motion; do not silently rewrite the plot.

**Do this on your current animation/test branch, not the docs branch:**
- Read this page and [ANIMATOR_SKILL_TREE.md](ANIMATOR_SKILL_TREE.md), select only relevant knowledge sources.
- Briefly identify the owner's actual story and agreed requirements from your existing context/project files; don't ask the owner to repeat an already provided brief.
- Record which Skills were consulted and how they changed practical choices.
- Prepare scene-by-scene Director Brief and executable Production Spec for **that same story**, including meaningful scene composition, independent cutouts/layers where justified, camera, text, transitions, timing and render checks.
- Implement and render on the installed FloxBow version as far as it supports. Avoid unrelated Core development.
- Report evidence of better animation quality and honest blockers.

### Deliverables

1. Scene-based storyboard / concise Director Brief.
2. **Production Spec** detailed enough that a coding animator knows what to implement (not just "cinematic" adjectives).
3. Skill usage log with links and concrete effects on decisions.
4. Layer / asset plan and which parts remain user-editable vs code-only.
5. Actual render or verified partial result, technical obstacles and honest evaluation.
6. Suggested improvements to Skills based on **observed gaps**, not speculation.

**No push, merge, rebase or unrelated Core changes for this experiment.** User/manager separately decide whether to adopt findings. The on-going Core Editor developer task is not yours.
