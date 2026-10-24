# FloxBow — Technical and creative research index
Updated: 2026-10-24. Paths reflect documented conventions and owner/animator reports; availability differs across branches.

| Question | Read | Scope / status |
| --- | --- | --- |
| What is happening now? | [CURRENT_STATUS.md](CURRENT_STATUS.md) | Manager handoff, reported vs approved vs pending |
| Which design principles and ideas have we explored? | [PRODUCT_CONCEPTS.md](PRODUCT_CONCEPTS.md) | Product direction + explicitly unapproved explorations |
| Canonical AI-ready editor and mixed 2D/3D concerns | [AI_READY_EDITOR_FOUNDATION.md](AI_READY_EDITOR_FOUNDATION.md) | Core architecture/reliability backlog, NOT all implemented |
| Future visual assets, 3D, globe, data | [FUTURE_VISUAL_CAPABILITIES.md](FUTURE_VISUAL_CAPABILITIES.md) | Long-term research |
| Story/director and skill research | [CREATIVE_DIRECTOR_RESEARCH.md](CREATIVE_DIRECTOR_RESEARCH.md) | Research inventory |
| Animator onboarding / technique index | [ANIMATOR_START_HERE.md](ANIMATOR_START_HERE.md), [ANIMATOR_SKILL_TREE.md](ANIMATOR_SKILL_TREE.md) | Workflow and skill research |
| Timeline/Canvas/media SDK details | `docs/TIMELINE_EDITOR.md`, `docs/CANVAS_CORE.md`, `docs/MOTION_SDK.md`, `docs/PROJECT_MEDIA.md`, `docs/MODULE_INTEGRATION_BLUEPRINT.md` | Verify APIs against chosen branch and live tests |
| Animator's Visual Inspection research | `research/visual-scene-inspection/README.md`, `PROGRESS.md`, `FINDINGS.md` | Animator experimental branch journal; check current checkout |
| Animator's multi-snapshot / Codex portal review | `research/visual-scene-inspection/MULTI-SNAPSHOT-REVIEW.md` | Reported reviewed, no application change during analysis |
| Snapshot artifacts | `projects/ai-video-origin-story/.floxbow/visual-inspection/<capture-id>/frame.png` + `inspection.json` | Local project files; historical capture data, not current truth |

## Summary of Visual Inspection research handoff
- Existing snapshot identifies frame, active Timeline clip(s), visible nodes and component source refs; AI may still search internally to locate procedural behavior and temporal sequence.
- Example: global frame 161 / local frame 33, `thumbnail-no-editing` → `ClickbaitThumbnail`. Old opacity behavior belonged to the capture revision; later `expandOnClick=false` was reported.
- Proposed and **approved** R&D: read-only **Codex-callable** capture-ID resolver; compact initial summary with targets, revision, global/local time, source ownership, editable fields and nearby timeline events; lazy source/schema/wider-time retrieval. Source range precision and currentness must be explicit. Editing stays on existing path. No automation claim until tested.
- Later, not yet approved: multi-snapshot grouping, snapshot editor/overlays, revision history UX, contextual token efficiency benchmarking.

## What the next Manager should verify
1. Research journal changes in the animator's actual experimental branch, **not assumed present here**.
2. Branch, worktree, current PR status and whether resolver was implemented/tested after owner approval.
3. Core developer's latest status before proposing new assignments.
4. Whether an idea is a user brainstorm, a documented proposal, approved experiment, or verified shipped functionality.

Do not mistake research prose for runtime evidence.
