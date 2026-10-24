# Creative Director / Motion Director — research candidates

**Status:** research inventory only, 2026-10-23. Not implemented, not approved for adoption. Verify repository activity, exact contents, licenses, attribution and fitness before copying or installing third-party material. This is not part of the current Core Editor PR #38.

## Why this matters

The owner has strong animation/storytelling ideas but should not need professional cinematography or motion-design training to express them. A local AI **Creative Director** should devise the visual narrative (why shots, motions and cuts happen), a **Motion Director** translates that into production guidance, an **AI Animator** implements via the available FloxBow/Remotion/Three.js tools, and a **Creative Reviewer** assesses rendered results against the stated intent. This is distinct from the **AI Project Manager**, who coordinates application development. The owner retains artistic approval.

A film that merely animates text is not automatically coherent storytelling. Before technical frames/easings, ask: what should viewers understand/feel, what motivates each transition, where should attention go, what rhythm is appropriate, and how do sound and movement serve the message?

## External sources to evaluate (not dependencies)

| Candidate | URL | Potential use / caveat |
| --- | --- | --- |
| director-skills | https://github.com/0xhughs/director-skills | Agent skill workflows from idea/story through visual direction and review; inspect source and license before reuse |
| vision_art_creator | https://github.com/ilkaydemiralay/vision_art_creator | Creative production roles and continuity approach; assess whether multi-agent overhead is warranted |
| Disney Animation process | https://www.disneyanimation.com/process/animation/ | Animation principles and craft reference; link to learn, do not copy proprietary material |
| StudioBinder production documents | https://www.studiobinder.com/film-production-documents/ | Storyboard/shot-list/script-breakdown templates; verify template usage rights |
| Google DeepMind Veo prompt guide | https://deepmind.google/models/veo/prompt-guide/ | Vocabulary for shot, camera, lighting, motion, sound; oriented to generative video, not deterministic timeline editing |
| OpenFilm | https://openfilm.dev/ | Related AI/coding-driven video workflow to study, not a prerequisite or endorsed dependency |

## Minimal local proof — before building a framework

1. Read and compare a few actual skill files from the first two repositories; extract only useful *methods*, not their full documentation trees.
2. Draft one small local creative workflow: **intent → director brief → storyboard/shot plan → animator execution → critique of actual frames/video**.
3. Director brief for each scene states narrative purpose, emotional/visual progression, composition, rhythm, transition motivation, sound intention and objective success criteria. The Motion Director adds timing and execution details later.
4. Test the same 15–30 second idea **with** and **without** the director workflow. Compare clarity, continuity, purpose of movement and owner preference, not amount of generated text.
5. Keep the result as an optional bundled local Skill/guide, versioned alongside FloxBow, with no hosted services or automatic new model training.
6. Capture specific critiques such as "source object was not consumed; decorative flames were simply overlaid" so subsequent agents distinguish technical implementation from intended artistic outcome.

**Gate:** Do not interrupt the current Text/Canvas/Image Core sprint or import third-party skill code automatically. Report a small research/prototype proposal to the AI Manager before integrating any creative skill into ordinary animation workflows.
