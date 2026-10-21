# FloxBow — Product Vision & Exploratory Design Notes

**Status:** Product-management discussion record; not an approved engineering specification, public API, implementation commitment, or claim of existing functionality.

**Recorded:** 2026-10-22. **Source:** Product-design discussions; verify actual implementation and PR status on `dev` separately.

## Purpose and navigation

This document preserves creative product ideas so a new human collaborator or AI agent can recover the design context without relying on chat history.

- **What exists now:** [Module index](../docs/MODULES.md) and current code.
- **Overall priority and active implementation:** [Roadmap](ROADMAP.md), verified against open PRs.
- **Existing agreed product principles:** [Decisions](DECISIONS.md).
- **General idea inventory:** [Backlog](BACKLOG.md).
- **Technical proposals, evidence and implementation plans:** `improvements/`.

This is a **design notebook** for candidate experiences and open questions. The current priority remains completing and safely structuring existing editor capabilities, especially Timeline detachment for multi-monitor editing. Do not begin these exploratory features without a separately approved scope.

## Product direction: modular creative workspace

FloxBow should become a studio in which a small, stable core supports interoperable creative modules. The user or an AI agent can compose different animation techniques without each module rebuilding project persistence, time, selection, preview, or media management.

Distinguish responsibilities by purpose, not by calling everything a “container”:

- **Core/session:** canonical project edits, identities, authoritative time and commands, conflict-safe persistence.
- **Workspaces / UI hosts:** Canvas/Preview, Timeline, Inspector, Media and specialist panels; shell manages placement and detachment.
- **Creative modules:** subtitles, visual effects, characters, chat bubbles, animations, audio visualization.
- **Shared data services:** media resolution, audio feature analysis, synchronization metadata or other reusable signals.
- **Composition:** how scenes, elements, effects and audio are combined for playback/export.

These are **conceptual responsibilities**, not established new framework interfaces. Avoid a universal runtime plugin loader before concrete use cases justify it. A new module should ideally integrate through existing stable contracts, rather than requiring edits across many unrelated core subsystems.

## Candidate concept: scene-oriented and hierarchical video editing

**Status: Concept — requires architectural proposal and compatibility assessment.**

Imagine a video made of distinct scenes, comparable to a game scene editor:
- Scene 1: sequential animated chat bubbles/messages using current-style 2D motion.
- Scene 2: a visually richer 3D jar of water, potentially rendered by Three.js.
- Scene 3: a music-reactive image and comet/flame effect.

A **project-level timeline** could show scene order, durations, transitions and shared tracks. Opening a scene could switch to a **scene-local timeline** showing only that scene's elements, subanimations, subtitles and effects. Returning to the top level shows the whole video.

An AI should eventually be able to address a precise scene (“edit the water animation in Scene 2 without changing Scenes 1 and 3”), while a human can edit the same structure visually.

Do not assume unlimited recursive nested scenes at first. Explore a minimal scene composition with clear ownership, identifiers and a mapping between local and global time. Current Timeline clips and serialized project formats must remain compatible unless a migration is separately approved.

### Global time, local time, and scene moves

A 3-minute song might span three 1-minute scenes. When viewing Scene 2, the editor should display the relevant **01:00–02:00** audio portion while local scene time reads **00:00–01:00**. This is a *view* onto the same audio, not three copies.

Illustrative mapping with no time-remapping: `globalTime = sceneStart + localTime`.

Open questions needing design and testing:
- When a scene is moved, does a globally anchored song remain fixed, while scene-owned sounds move with the scene?
- How do trimming, time-stretch, transitions, scene overlaps and nesting affect time mapping?
- Can a user explicitly change a global soundtrack from a local scene view, with protection against accidental edits?
- How do track ownership, history, clip identity and conflict resolution work across both timeline views?

**Candidate guiding rule:** an item has explicit ownership (project/global or scene/local); scene views may show global references without becoming separate owners. This is a discussion principle, not an approved schema.

### Audio and subtitles across scene boundaries

Keep one authoritative source for a song and for canonical synchronization data. In the scene editor, show only the corresponding waveform/beat/subtitle region. A scene may style lyrics differently or display localized captions without duplicating or corrupting global timing.

Scene-local dialogue/SFX can move with that scene. Global soundtrack or lyric timing normally remains attached to project time unless the user explicitly requests a different behavior. These semantics need user research and an architecture proposal.

## Candidate concept: shared audio analysis and reactive parameters

**Status: Concept — not existing end-to-end functionality.**

Example workflow: the user supplies a song and background image. Background zoom reacts to energy/beat; a separate drawn-path comet/flame responds to bass or another feature; a waveform visualization also responds. The user can independently adjust sensitivity, scale and behavior for each effect.

Ideally one media/audio analysis pipeline computes or exposes reusable time-indexed features (beats, amplitude/energy, frequency bands, waveform, perhaps onset/transient data). Different creative modules consume those signals, rather than analyzing the same audio independently.

Potential abstract binding: `audio.energy -> image.zoom` or `audio.bass -> comet.intensity`; **not a proposed public API**. Need to decide units, interpolation, frame determinism, caching, timeline offset, source-audio timing, preview/render parity and user-visible parameter controls. Distinguish an audio *service* from an Audio panel *UI host* and a waveform *creative module*.

Current linked-media registry is not evidence that external audio is already connected to preview, renderer, timeline or transcription. Finish/validate existing Media–Audio–Lyrics integrations before pursuing this.

## Candidate concept: multiple scene rendering techniques

**Status: Exploratory, not approved integration work.**

A single video may contain a 2D animated-chat scene and a different scene drawn with Three.js; PixiJS might support sprites, particles or other 2D effects. It is not yet decided whether to embed these techniques inside the existing Remotion composition/player, adapt them behind a renderer interface, or do something else.

First resolve the actual need and test deterministic frame seeking, exports, performance, scene boundaries and preview/render consistency. Do not replace the current player or design renderer plugins solely based on this discussion.

## Candidate concept: Character Animation 2.5D

**Status: Concept, after existing foundations.**

Prefer approachable cartoon/mascot animation over a heavy 3D character pipeline for the initial use case: walking, hopping, facial or comic expressions, dialogue bubbles and stylized lip-sync. Available reviewed subtitle/word timing could provide speaking intervals. Different character styles could use distinct mouth or bubble animations. Do not describe cartoon lip-sync, character rigs, or automatic speaking animation as implemented.

## Human–AI creation and structured review

**Status: Product direction; structured annotation feature remains proposed.**

Human and AI work on the same canonical project. Users might eventually select an object, clip, timeline range or frame, write a precise note, and export structured references so an external coding AI can make targeted changes. Annotations should not imply a built-in autonomous AI backend.

Example: “Scene 2, jar: make the water motion slower between these frames.” Keep original media, current project state, reviewed timing and proposed AI changes distinguishable.

## Current sequencing and non-goals

1. Complete/review current EditorSession and controlled view work.
2. Achieve practical Timeline Detach/Attach to a second native monitor window with one editor session/save owner.
3. Consolidate existing Media, audio, lyrics, Timeline and module contracts where required by real current functionality.
4. Only then scope scene-local timelines, audio-reactive effects, new rendering techniques and character animation as separate, evidence-based proposals.

This is an intent ordering, not a replacement for [ROADMAP.md](ROADMAP.md), which owns active cross-module priorities.

**Not authorized by this note:** new project schema, scene nesting implementation, Three.js/PixiJS integration, general plugin runtime, new IPC surfaces, new audio service, or automatic AI features.

## Questions for the next product design session

1. What should the project-level timeline show when a scene is opened: only the scene tracks, or also selected global reference tracks?
2. How should edits to project-owned soundtrack/subtitle timing be exposed and protected in a scene-local view?
3. What does “move scene” mean for project-global audio, scene dialogue, and transitions?
4. Should a scene be a reusable composition, a timeline grouping, or another type of project asset?
5. Can multiple rendering techniques coexist in one scene or is one engine per scene sufficient initially?
6. Which audio feature values are useful enough to support as reusable signals?
7. Which existing functionality must be completed before validating these ideas?

When any question is resolved, record the approved decision in [DECISIONS.md](DECISIONS.md) and the scoped milestone in [ROADMAP.md](ROADMAP.md); keep this page as contextual discussion rather than creating conflicting status sources.
