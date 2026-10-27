# 02 — Whole-film direction and accountable handoffs

## The workflow is film-wide planning followed by incremental execution

### Stage A — Source, narrative and timing intake

Read the **entire** author's story, script, relevant discussion decisions, available reference images and saved project timing. Know story truth, identities, perspective, relationships, reveal sequence, audience, emotional progression, constraints and FPS. When subtitles exist, link semantic beats to real clip/word IDs and exact source intervals. Segment boundaries are **not automatically shots**.

Output: production brief, reference inventory, source-evidence map, unresolved questions and timing confidence. If missing sources, continue with explicitly editorial estimates rather than invented verified timing.

### Stage B — AI Director plans the **whole film**

Identify narrative units of meaning and evolving motifs. Define **all** scenes and shots, how transitions bridge adjacent scenes, visually consequential actions, camera viewpoint, composition, depth, visual start/end states, targeted effects, required separated layers, art direction, and relative timings. Scene/shot starts and ends use full-project frame coordinates, end-exclusive, plus traceable narration anchors. Event timing belongs to a shot, but may be deliberate anticipatory/lingering action.

**An entire-film review is mandatory *as a methodological step*, not an editor hard gate:** look for missing visual proofs, meaningless shot transitions, inconsistent protagonists, redundancy, overcrowding and final reveals not foreshadowed earlier. Revise early scenes in light of later scenes. Complete whole-film direction **before production structure generation** in the guided workflow.

### Stage C — Prepare the production

From the reviewed plan, derive a whole-film code scaffold *once*, safely repeatable. Identify or prepare clean background plates, isolated transparent subjects, alternative close-up source images (avoid enlarging low-resolution cutouts), overlays, masks, procedurally generated elements, character consistency references and licensing/provenance as applicable. Reuse assets across scenes where visually correct. An asset request is a requirement, not proof the asset exists.

### Stage D — AI Animator implements shot by shot

Use scene/shot identity and event identity from the Director's plan, the existing SDK and canonical Timeline. Produce working, frame-deterministic animation; employ reusable abilities where verified, create local components for unique behavior, report missing shared capabilities rather than fake them. The Animator can refine **execution** event durations for breathing and legibility, as long as narrative anchors, scene boundaries and later beats are respected. Record reasoned deltas; never silently rewrite source subtitles, audio or approved creative intent. After each meaningful unit, check moving frames, not only screenshots.

### Stage E — Reviewer checks the actual film

Compare planned intention with observable output, frame by frame when necessary, and review transitions + entire export. For deviations produce exact scene/shot/event IDs, global frame ranges, current execution times, screenshot / source path references, observed failure, desired behavior and severity. Differentiate technical failures, incomplete coverage, artistic issues and approved reinterpretations. Return actionable correction to Animator or, for genuine intent conflicts, to Director/human.

## Handoff contract: every role must know why it exists

| Role | Receives | Must produce for next role | Acceptance |
| --- | --- | --- | --- |
| Director | Entire story, references, time evidence, Bible, verified capability context | Film-wide reviewed plan, detailed shot/event timing and mandatory visual outcomes; asset & continuity specs | Whole-film coverage and intent validated, open decisions marked |
| Producer | Reviewed plan and actual assets/capabilities | Safe code scaffold, asset inventory, missing asset requests and mapping registry | Every planned scene/shot addressable without claiming visuals exist |
| Animator | Scaffold, plan IDs, assets, real SDK | Renderable implementation + event coverage claims + timing deltas | Technical checks and representative playback performed |
| Reviewer | Director plan, implementation, playable result | Time/shot-linked findings and concrete corrections | Each observation points to reproducible evidence |
| Human | All of the above | Approval or specific notes | Only human acceptance makes an artistic outcome approved |

Each handoff may be performed by the **same** external agent; it must still leave durable state so a different agent can take over. Do not make roles into separate services or mandatory UI wizards.

## The distinction between temporal concepts

- **Narration anchor:** documented saved speech/caption interval, which may be uncertain.
- **Narrative unit:** a connected semantic thought; may span many subtitles.
- **Shot:** a coherent cinematic view; may contain multiple narrative units and actions.
- **Event:** light rises, actor reacts, tree grows, shadow crosses mountain; may overlap with other events.
- **Hold / dwell:** perceptual room to understand a result; ambient motion can continue.
- **Scene:** a larger dramatic or editorial group of shots, which may be a canonical Timeline scene *after* production scaffold sync.

**No minimum compulsory shot duration.** Heuristic warning for clusters of sub-2–3-second narration shots, or one shot/event per subtitle, especially if each introduces competing full-frame content. Typical 4–6s is a *starting thought exercise*, not a validator hard rule. Short cuts remain acceptable if they serve energy, point-of-view or continuity.

## Concrete example

Narration: “The waters trembled, flowers bloomed, and birds rose to the sky.”  
Bad automatic treatment: three independent slideshow screens and three camera zooms.  
Directed alternative: *one establishing shot of a valley*, water ripples locally, flowers grow in foreground, birds rise deeper in frame, each event follows or overlaps speech and result is held. If a new emotional perspective is needed, then cut to a new shot, not just to show a new noun.

Narration: “A tree grew from his heart; its shadow crossed the mountains.”  
Likely requires distinct coherent views: heart glow and growing branch anchored to the character's chest; then a wider landscape with an independently composited tree-shadow overlay. Require a clean landscape plate, separated transparent character/tree or procedural components, a closer-source variant where resolution demands it, and source-consistent perspective. Frame timing is anchored to saved narration and visually refined by Animator.

## Required film-wide checks

Does the ending pay off the beginning? Are shot entrances/exits visually motivated? Are visual identities and rules stable? Is something new visible beyond a camera move? Is each result readable? Is asset quality adequate at planned scale? Have all critical events and timing conflicts been surfaced? Can a weaker Animator execute each shot without inventing the Director's cinematographic choices?
