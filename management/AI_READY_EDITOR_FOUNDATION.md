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

## Agent-facing 2D / 3D composition routing — REQUIRED documentation before shipping integration

The owner specifically requests a **task-oriented guide**, not a generic API inventory: "I have a 2D animation and want a cube / other 3D object on top; which supported entry point do I call, and how do I position it?" A new AI agent should find this answer within minutes without guessing package names or rebuilding host plumbing.

**Present repository status (verified via existing docs, not end-to-end runtime here):** `@motion/sdk` provides React/Remotion scene primitives (`Canvas`, `Scene`, `Fade`, frame helpers), `@motion/sdk/editor` provides `EditableVideoProps` and `TimelineComposition`, `@motion/sdk/canvas` defines shared 2D Canvas interaction for opted-in editable elements, and `@motion/player` / `@motion/renderer` provide preview/export. These should NOT be misrepresented as a stable, public, generic 3D overlay API. The earlier independently working transparent cube overlay is an **experiment**, not yet a versioned, supported package entry point.

### Intended task → route table for a future public quick-start

| User/agent intent | Recommended conceptual route | Status |
| --- | --- | --- |
| Only 2D (text, PNG, layered graphics) | Standard editable Timeline composition with normal React/Remotion visuals; use existing 2D Canvas Core where components opt in | Core foundation present; specific editing support depends on registered component |
| Put one 3D cube or object on an existing 2D animation | Transparent 3D visual layer, composited over/under the 2D layer via explicit z-order, with position and size in a composition coordinate space | **NOT YET a certified public FloxBow 3D API** |
| Full-frame 3D shot | Dedicated frame-driven Three.js scene filling the composition frame, with lights/camera/materials | **Planned supported example / adapter** |
| Mixed 2D text/HUD + 3D objects | Keep text/HUD in normal 2D layers and 3D in its own layer; define z-order, transparent clear, occlusion, coordinate mapping and anchor behavior | **Planned supported example / adapter** |
| Put a label on a moving 3D object | World-to-screen projection into a 2D HUD; hide when occluded/behind camera and account for frame time | **Future reusable capability** |
| Existing external Three.js animation | Adapt to explicit `renderAt(frame|t)` contract or pre-render frames/video if its simulation cannot seek deterministically | **Integration decision; not a promised feature** |

**Important distinction:** `@motion/sdk/canvas` is the editor's geometric selection/transform contract, **not** a WebGL canvas or a way to directly import Three.js. `Canvas` from `@motion/sdk` is a React scene primitive; document naming to prevent confusion.

### Minimum documentation the developer must produce when 3D support is implemented

1. **START_HERE for agent:** choose 2D-only, 3D-only, or 2D+3D overlay; link to public imports and a verified example for each (not source-relative imports).
2. **Runnable sample:** simple 2D background, a genuinely transparent rotating lit cube occupying a configurable 300×200-type rectangular viewport over it, and a 2D text HUD optionally above the cube. Then show a full-frame 3D variation. Use actual validated SDK entry points.
3. **Placement contract:** how layer position `x/y`, size `width/height`, anchor, rotation (where supported), stacking `z`, clipping, pixel vs percent units, and responsive composition dimension relate to each other. Distinguish 3D world-space coordinates from the 2D overlay's rectangle.
4. **Time contract:** how to pass the current frame/fps into 3D and make lighting, camera, shader uniforms, physics approximations, and animation stable under reverse seek and MP4 export.
5. **Render-compositing contract:** transparent WebGL clear/background/alpha, antialias and premultiplication, transparent layers vs opaque background, color space/tone mapping, masks/occlusion, why preview and export match.
6. **Supported engine route:** explicitly document if the project uses native Three.js in an isolated canvas, `@remotion/three`, or pre-rendered media. Show one recommended route first; alternatives only when verified. Avoid creating duplicate React installations.
7. **Troubleshooting:** duplicate React / invalid hook error, dependency optimizer stale cache, missing packages, blank canvas, lost alpha/black rectangle, context loss, frame-seeking mismatch, export mismatch. Each issue needs a concrete diagnostic and recovery instruction.
8. **Capability index:** machine-readable or concise declarative list of installed/working APIs, imports, examples, accepted input data and limitations. A brand-new agent should not need to reverse-engineer repository internals.

### Acceptance test to keep honest

Ask a fresh AI agent, without extra project history: **"Start with a 2D background and animated text. Add a lit, rotating Three.js cube above it, at x=60%, y=30%, with a 300×200 pixel viewport and no opaque rectangle. Keep text above the cube, support seek to frame 90, then export MP4."** The agent should locate the official example, use documented APIs, modify only project code/canonical data as supported, and produce reproducible preview/export without installing another copy of React. Also test a pure 2D scene and a full-frame 3D scene. If no supported API exists, docs must explicitly say so rather than invent imports.

This is a **future implementation+documentation acceptance requirement**, not proof the 3D integration is already available. Avoid telling the active editor developer to build it before the agreed milestone.

## Animator validation — actual 300x200 Three.js overlay experiment

Owner relayed animator's firsthand technical notes (2026-10-23): the existing composition remained 2D and an independent **300 × 200 px Three.js viewport** was overlaid. The viewport rectangle was positioned in **2D composition coordinates**; cube, lights, and camera existed in **3D world coordinates**. This supports three official future workflows: 2D only, full-frame 3D, and mixed 2D + editable 3D viewport layers above/below 2D content.

**Public API target (names illustrative, not implemented):** a transparent 3D overlay should accept 2D x/y/width/height, stacking order, frame/time, and 3D scene content. The editor should expose the 3D viewport as a canonical Timeline clip/layer with existing shared Canvas selection/placement/size controls wherever supported, not merely a React component in preview. World coordinates and viewport coordinates must be clearly distinguished.

**Integration responsibilities:** centrally owned compatible Three.js/React versions, reliable Vite dependency/cache handling, transparency/compositing, preview/MP4 parity, and arbitrary-frame seek. Confirm behavior by automated development and built tests. The API removes integration boilerplate; it **does not automatically produce artistic effects** such as globe geography, Fresnel atmosphere, points, routes or shaders.

**First vertical slice acceptance:** 2D background, 300x200 transparent 3D lit cube overlay independently positioned and timed, 2D foreground label, selection and editing of the viewport layer, seek backward/forward, save/reload, MP4 without editor controls. Document actual imports/examples only after running them. No broad 3D framework or new scene graph before this is proven.

## Owner clarification: on-demand editable controls (2026-10-23)

**Do not require the AI to expose all possible controls when it first authors a scene.** Preserve creative implementation freedom. After watching the result, the owner can ask: "give me UI access to the HUD colors" or "expose the camera orbit/approach/leftward movement keyframes." The AI should inspect its existing project code, identify the actual source properties/animation curves, refactor those values into *declared controls* bound to canonical JSON, and preserve the previous rendered behavior when the newly exposed controls retain their initial values. The editor should then surface those controls on the appropriate scene/element in Inspector or an expandable animation/keyframe lane.

Future **dynamic parameter binding** requirements: stable component/parameter IDs; type, label, default and validation metadata; constant values and optional frame-indexed keyframes/easing for numeric/color/vector properties; explicit mapping from JSON to runtime shader uniforms, camera transforms or 2D content; same evaluation at arbitrary frame in preview/export; undo/save/reload; and a validation/test that changing the value actually changes the rendered output. For camera exposure preserve camera position, rotation/look-at and lens properties as appropriate, and avoid flattening a multi-stage move (orbit → approach → shift left) into a single ambiguous "speed" slider.

The user chooses which parameters deserve UI control *later*; avoid automatically showing thousands of particles/shader internals or all camera axes on the main Timeline. Unexposed code remains controllable via the AI. A requested parameter is not magically editable without the agent adapting the original code and registering a supported binding. An honest implemented-vs-planned capabilities guide must spell out this boundary.

**Architectural implication:** shared type/validation/Inspector/keyframe infrastructure can be generic while binding implementation remains module-/scene-owned. Investigate extension of existing `EditableComponent.fields` and Timeline v1 instead of designing a second disconnected JSON format. Not a task for the currently agreed Media/Video/Audio sprint unless essential compatibility decisions arise.

## Scene-first mental model and progressive drill-down (owner decision, 2026-10-23)

**Owner's central requirement:** treat a movie as a sequence/overlap of **scenes**; each scene is a time-bounded, visually composited unit (a viewing window / mask for its internal layers, with clear clipping or compositing boundaries). A complex AI-written animation should appear as **one understandable scene on the top-level Timeline**, not thousands of clips for its globe points, labels, HUD, camera and effects.

**Progressive disclosure, not forced upfront metadata:**
- Main Timeline: scene spans, coarse timing, transitions, primary overlay/text/audio where appropriate. Keep it legible.
- Open/expand/zoom into a scene: inspect internal logical layers or selected exposed parameter tracks, without inflating the entire movie Timeline. UX method (double-click drill-down, disclosure tree, nested view, or zoom) is **undecided** and should be prototyped; do not lock in one navigation solution prematurely.
- Right-side Inspector: selected scene or selected internal element exposes only its declared editable parameters.
- On-demand: owner asks AI to expose HUD colors, camera path keyframes or any chosen property; AI refactors code and registers validated canonical JSON bindings, preserving original behavior. Not every private shader value or particle belongs on the Timeline by default.
- Keep scene-level time and local element time explicitly mapped to global canonical frames, including trims, overlaps, seeking and export. A visual mask/clip should not imply a pre-rendered flattened video or destroy layer editability.
- Integrate with existing Timeline v1, Canvas Core and declared field metadata where viable. Survey D-017 scene/ripple decisions before proposing schema changes. Do **not** assert nested Timeline/editable 3D API already exists.

**Key user story:** "A film has a 15s globe sequence. On the movie Timeline I select 'Global Routes' as one scene. I can open the scene to inspect logical 2D and 3D layers, then ask AI to expose camera orbit/approach/left-shift keyframes. Only those keyframes appear in the scene's detailed view, while film-level Timeline stays clean." Scene-level transforms/cropping/masking and object-level transforms must remain distinguishable.

**Product test:** make a short multi-scene composition with one complex scene (e.g. 3D content + HUD + title + effects). Demonstrate film-level Timeline readability, scene entry/exit, at least one selected internal layer, a dynamically exposed parameter, preview/export and correct global↔local frame mapping. First settle navigation/data model with a minimal vertical slice; avoid building a general nested scene-graph/keyframe UI in the current Media/Video/Audio sprint.

This scene-first principle is **priority product direction**, despite UI exploration remaining open. Related research: `management/FUTURE_VISUAL_CAPABILITIES.md` for layered composition and `management/CREATIVE_DIRECTOR_RESEARCH.md` for later creative skills.
