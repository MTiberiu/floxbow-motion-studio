# FloxBow Animator — Skill Discovery Map

**Status:** curated research references, NOT installed, adopted, tested with FloxBow, or guaranteed to work. Read [ANIMATOR_START_HERE.md](ANIMATOR_START_HERE.md) first. This catalog routes one AI Animator to specialist knowledge; it is not a proposal for many separate agents. Verify exact upstream content, version, license and scripts before downloading or executing third-party code.

## Priority external references (verified repository pages, October 2026)

| Role / need | Source | What to inspect / caution |
| --- | --- | --- |
| Story development, visual direction, shot breakdown and diagnostics | [0xhughs/director-skills](https://github.com/0xhughs/director-skills) | Start with root `SKILL.md`, then choose `short-film-development`, `style-cinematography-director`, `shotlist-and-visual-breakdown`, `prompt-iteration-and-diagnostics` only if relevant; licensed MIT. Its video prompt model exporters are optional — FloxBow is a code-driven editor. |
| Motion graphics, layered editorial treatments, WebGL, explainers | [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) | Collection index with many **separate installable packs**; inspect `motion-design-skills`, `explainer-video-skills`, `webgl-animation-skills`, `web-animation-skills`, `map-animation-skills` as needed. MIT. Do not indiscriminately install all packs; upstream counts change. |
| Reconstruct motion methods from a reference | [scriptscrypt/animation-reverse-engineering](https://github.com/scriptscrypt/animation-reverse-engineering) | Root `SKILL.md`, frame dissection workflow and FFmpeg helper. Distinguish observed frames from guesses about source layers/code. Run scripts only after inspection; installation not required for conceptual use. |
| Supporting production departments | [ilkaydemiralay/vision_art_creator](https://github.com/ilkaydemiralay/vision_art_creator) | Candidate for continuity/storyboard/sound roles; evaluate rather than auto-adopt. |
| Core animation craft reference | [Disney Animation process](https://www.disneyanimation.com/process/animation/) | Theory about staging/timing/posing; not an installable AI Skill and not permission to copy copyrighted training content. |
| Production documents | [StudioBinder](https://www.studiobinder.com/film-production-documents/) | Shot list/storyboard templates and terminology; check reuse permissions. |
| Coding-engine examples | [FloxBow Motion SDK](../docs/MOTION_SDK.md), [Animation guide](../docs/CREATE_ANIMATION.md) | **Actual working checkout** determines what is supported. |
| Future 2D+3D composition API | [AI-ready foundation proposal](AI_READY_EDITOR_FOUNDATION.md) | Planned, **not a stable export available today**. |

## Skill tree — retrieval index

The grouping below is **our routing proposal**, not the actual upstream folder structure. One task may use multiple branches.

- **A. Storytelling & Direction:** premise → beats → purpose → emotional rhythm → shot/continuity. First source: director-skills.
- **B. Scene construction:** individual PNG/cutout assets vs flattened images, depth planes, camera parallax, staging, masking, compositing, scene entrances. Inspect motion-skills and worked motion reference analysis. No claim of a dedicated verified upstream "scene decomposition" Skill.
- **C. Motion craft:** timing, easing, anticipation, follow-through, secondary motion, camera choreography. Inspect motion-design-skills and animation craft references.
- **D. Visual design & technical effects:** typography, lighting, 3D materials, shaders, post FX, particles, maps, data visuals. Inspect only applicable motion-skills packs and official engine documentation.
- **E. Technical implementation in FloxBow:** public SDK imports, frame-driven React/Remotion/Three.js, Timeline JSON, media assets, test render. Start in local `docs/` and verify code.
- **F. Reference analysis & quality:** extract representative frames, compare shot timing/layer interactions, choose repeatable methods, render-check and revise. Use animation-reverse-engineering and tests.

## Selection rules (what an unfamiliar animator must do)

1. Read the user's story and identify **what the viewer must understand**.
2. Decide intended aesthetic and visual mechanism, not merely genre keywords.
3. Pick **two to five relevant skill topics** and read only their actual `SKILL.md` / useful subsections. Record exact source links.
4. Extract 1–3 **decisive, testable** techniques per scene. Example: photo subject separated from paper background + independent foreground shadow + matched-perspective push-in, rather than "make cinematic".
5. Make a scene plan and technical production brief. Inspect available FloxBow APIs. If an upstream skill assumes a missing API, adapt honestly or identify blocker.
6. Render, inspect and compare with the intended visual outcome; revise once before declaring finished.
7. Store a short postmortem with successful techniques and failed assumptions — this is how the local library can eventually grow.

## Generic illustration of skill selection (not a request to change the owner's story)

**Illustrative example only (NOT the animator's assignment):** "A company rejects an offer that later changes an entire industry."

**Weak fallback for this illustration:** one generic company photo, repeated zoom-in, line of text, no clear change in stakes.

**Proposed better method for this illustration:** a document/photographic collage with a clear initial decision, three independently positioned layers in the foreground/midground/background, staged movement and a reveal linking the rejection to consequences; title only when needed to communicate the turning point. **This is an illustrative candidate treatment, not a guarantee or command to always do collage**. Skills must justify it against alternatives and available media.

## What the experiment should measure

Evaluate visual storytelling clarity, meaningful scene progression, *independent* layer treatment where useful, continuity, well-chosen timing, technical stability, editing affordances, and rendered accuracy. Score/report evidence, not claims of professionalism. Distinguish **quality of storyboard and brief** from **capability of the currently checked-out FloxBow runtime**.

## Usage and licensing

Link externally by default. Never auto-run `npx skills add`, clone third-party source into the main repo, or execute unknown scripts without review. Upstream `director-skills` and `motion-skills` declare MIT, but confirm current license and attribution if reusing files. Keep the first experiment documentation-only if needed; creative Skills are not a dependency of PR #38 or Core Editor completion.
