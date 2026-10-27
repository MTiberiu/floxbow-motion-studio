# 01 — Product vision, principles and boundaries

## The user problem we are solving

An AI coding agent can write visually impressive motion but may misunderstand what is being told, illustrate every subtitle as a separate animation, use stock zooms rather than depicting actions, forget narrative continuity, or require hours of repeated correction. A cinema-oriented process must guide even a weaker agent to (a) understand the whole film, (b) describe exactly what must be shown, (c) prepare adequate assets, (d) implement modularly, and (e) compare outcome to intent.

The application UI is **not the differentiator**; countless video editors have timelines. FloxBow's differentiator is **a reproducible production workflow for external AI agents that preserves an author's intent from story to screen and makes targeted correction possible**.

The ideal first-run experience, for a timed narrative, is: create/open a project → supply the story and saved time references → external agent plans the whole film according to the Director Bible → the system prepares the code/workspace based on that plan → the agent produces the film → the human views it in Canvas and gives precise shot/time/visual feedback. The same agent may switch roles internally, using durable contracts between phases.

## Two compatible workflows — no universal lock

**Free creation:** An agent may write React/Remotion code, create Timeline scenes, test a 5-second shot or produce a silent animation by any supported means. The user must never be forced to import audio, subtitles or a Bible just to use the editor.

**Guided film production:** An *opt-in method* applied when the creator wants structured, whole-film regie. Timed audio and subtitles are the **preferred evidence** in this mode, because scene length and event timing otherwise become estimates. No system-level requirement blocks experimentation; when sources are absent, timing is expressly marked `proposed` / `demo`, not verified narration timing.

No forced mode-switching UI is required. The system may recognize a plan being worked on and provide progressive guidance; preserve all existing creative paths.

## Role clarity

- **Storyteller / human:** supplies intent, story, references, music/narration as available; decides whether it feels right.
- **AI Director:** owns *what, why, where, when* across the **entire film**, including continuity and production-ready shot specifications.
- **Producer / asset preparer:** translates the plan into assets and executable structure; never quietly substitutes creative decisions.
- **AI Animator:** owns technical realization, reusable actions, layer animation, and refined visual timing while protecting the Director's intent.
- **Reviewer:** watches the result, compares it to the plan and gives time-stamped, visual evidence and actionable corrections.
- **AI Developer:** develops FloxBow's shared application/APIs; distinct from an Animator merely writing code under `projects/<id>`.

These are **roles, not separate required agents or embedded chat personas**. The same Codex may carry all roles, but must persist deliverables and handoffs for the next role or session.

## Four product principles

1. **Visual meaning before decoration.** Removing camera zoom and decorative effects must not remove the essential visual information. An action described in the story needs an action on screen.
2. **Film-wide direction before systematic production.** The Director must inspect the ending before locking the beginning. Scenes are narratively connected, not independent prompt responses.
3. **Space to perceive.** A word, subtitle, semantic unit, visual event, shot and scene are distinct. Group successive concepts within coherent shots; overlap related actions thoughtfully and hold a readable result.
4. **A canvas can be enough.** Only reveal specialized boxes when the creator needs them. The actual FloxBow interface already supports richer Timeline, Inspector, Canvas interaction and a detachable Timeline; preserve rather than replace that flexibility.

## What FloxBow is not

Not a built-in AI chatbot; not a model-provider backend; not a mandatory agent orchestrator; not a cloud dependency; not another rendering/timing engine; not a rigid film-length or shot-duration enforcement system; not a duplicate storyboard or Timeline; not a tool that automatically validates *artistic quality* from metadata.

## Project constraints / truthfulness

A source clip is not automatically a correctly aligned word transcript. The plan must reference the actual granularity of timing evidence available (word, caption/segment, audio duration, editorial estimate). Do not label unverified Whisper outputs as accurate. Do not change narration/subtitle timing implicitly to fit an animation. Do not assert hypothetical cameras, layer editors, API endpoints or generated controls already exist; document which capabilities are verified and which are proposed.

## Relation to existing FloxBow

Read `docs/STORYBOARD.md`, `docs/SCENE_EDITING.md`, `docs/TIMELINE_EDITOR.md`, `docs/ARCHITECTURE.md` and `docs/MODULE_INTEGRATION_BLUEPRINT.md` first. Existing Storyboard Director Brief and Set context may provide much of the desired model. The design should converge existing tools around one connected production system rather than forking planning mechanisms.
