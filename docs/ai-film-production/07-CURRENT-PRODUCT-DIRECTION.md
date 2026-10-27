# FloxBow Director — current product direction (2026-10-27)

**Status:** Product decisions and design target, NOT implementation claims.
**Documentation owner branch:** `docs/ai-film-production-architecture` (derived originally from `dev`).
**Repo:** `MTiberiu/floxbow-motion-studio`.
**See also:** `management/README.md`, `management/DECISIONS.md`, `docs/STORYBOARD.md`.

## Core operating model — external coding agents

FloxBow is **not an integrated AI chat or multi-agent orchestration product**. Agents such as Codex / Claude Code work **directly in the application repository and video project files**, within their actual local environment permissions. Director, Animator, and Developer are working roles; the same coding agent can switch roles and implement missing application functions in source code. Do **not** invent an in-app agent execution backend, code-writing endpoint, custom scripting language, or role switch service.

Git is important for review/recovery, but does not by itself prevent destructive file operations or protect uncommitted/outside-repo assets. Changes to shared application code should be scoped, tested, and reviewed.

**Product priority:** Improve Director's actual visual planning and Animator's actual animation capabilities, with discoverable, well-documented reusable TS/Remotion modules; agents improve FloxBow itself through real film work. Search for an existing function, reuse it, otherwise code and test a reusable capability in its appropriate module, register/document it, and use it. A capability registry is a discoverable API catalog, **not** an agent control system.

## Director-first storyboard UX

The historical Pencil/Eraser/drawing-Set-first UI is **not** the desired starting experience. It may be kept as optional support, but must not dictate the Director workspace.

**Target experience:** An external Director agent creates a new test film/project and populates all preproduction material directly in local project files / supported APIs. The human opens Storyboard and finds a film already planned, rather than having to create scenes, sets, layers, or import every asset before anything appears.

Top-level UI: film premise/story and duration; navigable ordered **Scenes → Shots** with thumbnails and timing; visual shot composition/canvas; inspectable ordered layers; camera/framing and action/events; existing/missing assets; review and approval. Storyboard is preproduction, not a second Timeline. Frame-by-frame or word-by-word slide planning is not the goal; favor coherent cinematographic shots and overlapping action with readable hold.

Preserve and reuse useful existing model elements: project-local `storyboard.json`, stable IDs, composition space, image reference/version/hash checks, annotations and their exports, project media and existing timeline linkage. Move/translate legacy Set representations into an understandable shot-centric experience without destructively discarding source. Data migration and handoff details require developer design.

**Current implementation checkpoint:** `feat/storyboard-director-ux-v2` commit `f8f7a66` added approval records, hash-based asset change detection, SVG/image annotations. Source review found that legacy draw UI remains dominant; approval checks mainly require at least one Set per scene, not a complete ready-to-animate shot package; visual editing of annotations needs confirmation. Developer reported typecheck/build/154 tests passing, but browser walkthrough was not completed. **Not end-to-end validated; do not claim release-ready.**

## Hybrid shots — choose the cheapest controllable medium per layer

A cinematic shot may combine any of:
- static transparent PNG foreground / midground / background plates;
- imported ordinary video, generated AI video, looping backgrounds or atmosphere;
- procedural frame-deterministic Remotion effects and particle systems;
- image-space masks and masked video/FX for local animated regions;
- vector paths/annotations for motion and semantic anchors;
- shot camera moves, compositing, depth/parallax and transition instructions.

**Examples:**
- A moving sky video behind transparent **mountains-only PNG** (do not bake the sky into the mountain asset); a Sultan PNG can appear further forward.
- An otherwise still landscape with **masked water region** receiving imported ripple/wave video or procedural water motion.
- A sleeping Sultan PNG in front of animated clouds; local heart glow; generated magical explosion or smoke overlay; leaves emitted by a procedural effect attached to a tree branch.
- Background AI video for organic atmosphere plus controllable character PNG and Remotion FX above it.

Generative video is a flattened clip and does not preserve independent character/object control. Use video where beneficial, not as mandatory whole-shot output. The Director chooses how assets are split, layered, masked and timed for cinematic continuity; the Animator refines and completes real production. Masks and transparent assets must have reliable coordinates, crop/pivot semantics and frame alignment.

## Optional ComfyUI integration — proposed, not built

A selected shot or selected layer may offer **Generate Video** / **Generate Background Motion**. Source may be a Director-created shot plate, user image, or masked target area. ComfyUI runs independently (local or otherwise configurable), using a supported workflow with image and prompt; the application may submit a job, show progress, retrieve the resulting MP4 and **import it into project media automatically**. The UI then shows a real playable inline preview, not only an output path. Preserve source image, prompt, workflow/model parameters, take versions, duration, provenance and errors. Users must also be able to **import any existing video without ComfyUI**.

Target modes: image-to-video, first/last frame when supported, animated background plate, masked overlay / atmospheric element; the initial prototype should implement **one thin vertical slice** only. Compute/model requirements and workflow support vary; avoid promising low local GPU consumption just because only the background is animated. Generated full video and editable Remotion are complementary.

Use existing project media registration and safe file operations; no separate AI chat/backend agent scheduler is necessary for API communication with an external render service.

## Director / Animator / Developer boundary

Director can use **simple public functions** (`image.createFade(...)` is illustrative syntax, not an existing export) and existing modules directly; app code owns detailed metadata/IDs and persistent effects contracts. If absent, the same external coding agent may implement and test a reusable module in source. Avoid requiring Director to manually author verbose JSON for every effect, though a versioned canonical persisted representation may be appropriate internally.

Initial whole-film approval/handoff should generate a working project scaffold from approved assets/positions/effect capabilities **where supported** and clear tasks for remaining effects. After that, do not automatically overwrite Animator-written TSX or the canonical Timeline from a revised storyboard. Keep approved reference snapshots, not a parallel automatic Director-revision editor.

## Next milestone proposed — not committed as an implementation order

1. Scope a new **Director-first Storyboard UI**, retaining necessary existing storage and controls but removing drawing tools from primary navigation.
2. Demonstrate a real external Codex-prepared **small film** opening pre-populated with visual shots, layered assets, and directions; user starts at review, not blank drawing.
3. Confirm asset and shot-level completeness status, review semantics and usable visual annotations.
4. Subsequent vertical slice: import a video as a layer; mask it onto a local zone; play the composite in Storyboard.
5. Optional later vertical slice: ComfyUI Generate Video → asset import → inline playable preview, with no assumption that ComfyUI is installed.

No merge or deletion of runtime branches is authorized by this design note.
