# FloxBow Motion Studio — Manager Current Status
Updated: 2026-10-24. This is a management handoff, not a runtime-verified release report.

## Working relationships and branch separation
- **Owner / Manager:** discusses product direction, analyzes experiments and explicitly approves implementations.
- **Core Developer:** works on modern editor integration, Timeline v1, Canvas Core, media/video/audio tracks, layer/track handling, preview/export, save/reload and editor reliability. Verify latest branch, PRs and progress before assigning work.
- **AI Animator / R&D:** works on an independent older experimental branch with the owner's existing `ai-video-origin-story` animation. May build experimental app capabilities and test them against that animation. Do not merge/cherry-pick into `dev` by default.
- **Management docs branch:** `docs/core-v1-handoff-after-pr32`, historically PR #33. Do not assume merged. Documents in this branch can be newer than animator's checkout.
- User recently reported a Git worktree in `feat/mascot-2p5d-timeline|MERGING` with unresolved conflicts. This is a *historical report*, not proof of current worktree state. Always inspect `git status` before Git operations.

## Current animator R&D: Visual Inspection → AI Context Resolver
Owner tested Visual Inspection on the real animation. Saved captures provide a screenshot, inspection JSON, active Timeline elements, source refs and editability declarations. This helped Codex find an element but still required manual code investigation and temporal reconstruction.
- In the animator's reported example, `thumbnail-no-editing` at **global frame 161, local frame 33** resolved to `ClickbaitThumbnail`. The expanding card and separate exit fade explained the visible transparency in the **captured historical revision**. The later Timeline value `expandOnClick=false` means captures must not be mistaken for current state.
- The animator reviewed the manager's proposed improvements in `research/visual-scene-inspection/MULTI-SNAPSHOT-REVIEW.md` and logged work in `PROGRESS.md`, according to the report provided to the owner. The journal's exact branch content should be checked in the animator checkout; it may not be present in this docs branch.
- **Explicitly approved next experiment (not yet confirmed completed):** a **read-only, Codex-callable context resolver keyed by capture ID**. Small first response: project/capture revision and staleness, global/local frame, visible target→owning clip/component, editability, known source symbol/range and bounded nearby Timeline events. On-demand source excerpt, field schema or wider time window. Existing canonical edit pathways remain responsible for changes. Test against `thumbnail-no-editing` and composite `tutorial-promise`; measure observed retrievals, time, target correctness, and actual token usage only if available. Do not modify animation just for test. No `dev` integration authorized.
- The agent's term **portal** means **machine-callable access to editing context for Codex**, NOT another user-facing UI. A bare copyable path is not sufficient if it doesn't enable direct access.
- Known limitation: arbitrary procedural expressions cannot reliably be matched to visual effects merely from a screenshot. Symbol/range links can be provided, exact behavior links need explicit metadata or agent analysis. Verify source/revision freshness.
- No resolver performance improvement or implementation success should be claimed until tested.

## Core editor current priorities (confirm with developer)
Canonical Timeline v1, scene/layer editing, visual track contracts and correct front/back stacking, track rename/reorder/hide/lock, Timeline Fit for full current duration, media library thumbnails/import, usable video/audio clips, save/reload, preview and MP4 export. Linked audio/waveforms were discussed as later work. Avoid displacing this milestone with animator R&D, 3D effects, Kinetic or broad skills work.

## Decisions vs explorations
**Accepted architecture:** Timeline v1 canonical JSON; stable asset IDs separate from clip IDs; scenes as meaningful high-level units; React/Three.js own procedural internals; Remotion is compositor/export; Inspector exposes only declared canonical fields, with on-demand code→editable-field refactoring; no second independent scene/timeline state.
**Approved experiment:** Codex-callable read-only context resolver on animator branch.
**Discussed only:** multi-snapshot requests, per-snapshot instructions, active-revision/history UX, interactive editing in saved screenshots, automatic temporal sampling, rich scene drill-down, full generic 3D editing, broad creative skill library. These are NOT implementation orders.

## Handoff procedure for next Manager
1. Read this file, `PRODUCT_CONCEPTS.md` and `TECHNICAL_RESEARCH_INDEX.md`; then existing architecture docs.
2. Verify live branches, active PRs, Core developer status and animator research journal; separate reports from verified runtime facts.
3. Preserve experiments on older animator branch until owner explicitly requests integration.
4. Discuss and approve new work with owner; do not silently change documents, architecture or developer assignments.
