# AI-Ready Editor Foundation — integration reliability backlog

**Recorded:** 2026-10-23. **Status:** planned, NOT implemented, NOT assigned into the current Core Editor sprint. The owner prioritizes an intuitive, reliable editor for AI agents over speculative breadth of modules. This note supersedes any interpretation of the visual-capabilities backlog as an immediate mandate for a globe module, FX framework, or many creative skills.

## Observed failure from real 3D animation experiment

The animator reported the project/preview became blocked by environment problems unrelated to the animation: stale Vite optimized-dependency cache referencing `@remotion/three` although it was not used, a second copy of React in a project causing a `useMemo` null error, and recovery after `npm install` regenerated dependencies. Treat these as reported incident details, not as a verified general root-cause diagnosis. They motivate reproducible integration tests and diagnostics.

## Goal

An AI agent can open FloxBow, inspect a concise documented capabilities list, start from a supported working example, build creative content without installing divergent packages into individual projects, seek arbitrary frames, preview, edit canonical JSON and export a faithful MP4. Error messages should show actionable causes rather than a generic composition-load failure.

## Proposed narrow hardening task (after current editor media/video/audio milestone, or sooner if 3D integration blocks acceptance)

1. **Single supported dependency route:** audit workspace dependency resolution; pin compatible React, React renderer, Three.js and any optional `@remotion/three` dependencies centrally; detect duplicate React runtime instances. Do not add `@remotion/three` as a mandatory dependency if standalone Three.js integration is the chosen supported path.
2. **Vite stability:** audit `resolve.dedupe`, dependency optimization and project entry resolution; make invalidation/recovery reproducible when dependencies change. Do not indiscriminately clear caches at every startup.
3. **One official minimal 3D example:** a deterministic rotating 3D object, light and camera; successful development preview, arbitrary-frame seek, built preview and exported MP4. Keep example independent of user projects and clean up generated fixtures.
4. **Frame time contract:** 3D state must derive from canonical timeline frame/time, not free-running `requestAnimationFrame`, wall clock or incremental side effects; document how engine plugins adapt.
5. **Diagnostics / AI affordances:** clear dependency/version/preview/render errors, recovery commands, quick-start API with file paths and tested example; expose capabilities honestly (implemented vs planned).

## Acceptance criteria

- Fresh checkout with documented install starts 3D example without manual dependency patching.
- No duplicate React hooks failure; stale Vite cache scenario has a documented/tested recovery path.
- Frames 0, middle and last produce repeatable visuals after scrubbing forwards/backwards.
- Preview and MP4 contain equivalent intended scene content and no editor overlays.
- An AI new to repo can follow a short entry guide to use 3D without reinventing host setup.

## Scope boundaries and sequencing

Current committed Core Editor milestone remains: PR #38 integration, left-side Media Library and useful image/video/audio clip timeline, multi-layer scenes, canonical AI/editor edits, integrated export. A small **3D host reliability spike** is the next relevant step before asking animator to build complex globe/particles scenes inside FloxBow. No globe datasets, specialized scene presets, huge effects framework, MCP, agent skill tree, Kinetic integration or full 3D editor in this task.

References: `management/FUTURE_VISUAL_CAPABILITIES.md` captures longer-term reusability ideas; `management/CREATIVE_DIRECTOR_RESEARCH.md` captures later creative skill candidates. Neither is current dev scope.
