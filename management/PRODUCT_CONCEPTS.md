# FloxBow — Product concepts, working principles and unapproved ideas
Updated: 2026-10-24. This file distinguishes **adopted direction**, **experiments**, and **explorations**. It is not an implementation task list.

## 1. Editing model — adopted direction
- FloxBow's **Timeline v1 canonical JSON** stores scenes/clips, stable clip IDs, asset IDs, track, frame time and declared editable fields. Remotion handles composition, playback and MP4, not alternative canonical timeline state.
- User sees manageable **scenes** on the main Timeline, while each scene/compound clip may internally include PNG, background, text, HUD, React, SVG or 3D objects and local timing. Thousands of low-level tracks are undesirable. Progressive drill-down/local inspection is conceptual, not necessarily shipped.
- AI may change owning code to expose a requested camera, color, HUD or keyframe property and bind it into validated canonical editing controls **on demand**. Don't pre-expose thousands of controls or falsely claim that arbitrary DOM/Three internals are Inspector-editable.
- Distinguish **editable** (declared canonical controls), **code-owned** (editable through source work), and **visual-only** (visible but no safe known editing contract).
- Timeline media **assetId** is not clip **clipId**. Preserve stable identity and version/revision validation.

## 2. Composition First → Motion Second — owner creative workflow concept
Before writing transition formulas, construct meaningful visual target states for each scene (for example, environment alone, character arrival, then close-up), check composition and storytelling, and animate the movement **between** states. This is a useful method, not an inflexible requirement to always make fixed poses.
- Align cut-out PNGs with shared origin and frame dimensions when layers should register perfectly (e.g., full-frame transparent assets in a 400×400 composition), rather than trying to re-align each asset ad hoc. This is a workflow example, not a hard-coded canvas size.
- An internal chat widget may have its own UI layout bounds (e.g., 255×175) and a placement rectangle in shared scene coordinates; its internals animate independently while the group can move as one.
- Think in **camera/storytelling beats**, not simply reveal/hide effects. Verify transitions and holds in actual motion, not just one still frame.

## 3. Real-world correction loop — ongoing research
The owner wants to point at a concrete moment and say what to change, without searching component code. Visual Inspection already demonstrated frame screenshot + inspection JSON + Timeline source references. One captured frame is useful but does not alone describe a multi-second transition.
Example of desired correction narrative: thumbnail remains opaque as camera passes *through* it (not thumbnail scaling/fading), dragon environment is visible without a blank gap, 1-second initial hold, animation, final 1-second hold, then return to girl. This describes the owner's creative request from a test, **not guaranteed implemented behavior**.
- **Current approved next R&D:** read-only Codex-callable capture-ID resolver, linked to source and neighboring time events. See `CURRENT_STATUS.md`.
- **Future possibility:** a single user request with Snapshot 1/message + Snapshot 2/message + Snapshot 3/message; Copy Instructions includes all targeted contexts but de-duplicates project/revision metadata and unrelated elements.
- **Future possibility:** snapshot can be overlaid with element bounds/IDs to select an actual object and edit via existing Inspector/Canvas canonical API, rather than painting pixels. Assess whether live Canvas is a simpler editing surface; do not build a parallel editor.
- **Future possibility:** active revision with per-snapshot notes, completion/history, reopen/re-capture, and small current prompts instead of re-sending all historic notes. Historical captures are preserved distinctly from *current* canonical project state; a snapshot isn't a project rollback.
- Context/token costs should be empirically measured (payload/read sizes, actual tokens when available, file accesses, accuracy, time). Don't optimize by guesswork.

## 4. AI animator / director working method — research direction
An AI generalist should become a useful animator through **tested production recipes**, visual examples, deterministic scripts, selective skills and feedback from actual rendered scenes, not by dumping large generic skill libraries into context. A single agent may perform director, planning, animator and reviewer phases; avoid mandatory multi-agent choreography.
- Story/visual purpose → composition states/scene plan → concrete animation mechanisms → implement → inspect frames AND actual motion → revise.
- Keep creator's existing story intact; do not invent a replacement narrative for animator evaluation.
- Reusable references might include visual recipes, reference frames, code patterns and failure/acceptance tests. Stable mechanical jobs should become scripts, not repeated LLM reasoning.
- External skill libraries are research candidates only; check license, actual files, integration payoff.

## 5. 2D/3D and backend/integration — architecture vs aspiration
- Scene-frame 2D coordinate system and nested widget/component local space are different; 3D world coords and 2D viewport placement are different again. A 300×200 transparent Three.js overlay was reported as an experiment; it does NOT imply a certified public FloxBow 3D overlay SDK.
- Arbitrary-time frame seeking and deterministic preview/export matter for 2D/3D; no free-running wall-clock-dependent animation.
- Backend/agent integration should expose **accurate capabilities, canonical IDs/fields, source ownership, time boundaries, revisions, and callable retrieval** without manufacturing semantic certainty about procedural code.
- Source links can identify components/functions, but matching a visible behavior to one exact expression needs source analysis or explicit annotations.
- 3D host reliability, dependency dedupe and preview/export parity are documented in `AI_READY_EDITOR_FOUNDATION.md`; globe/data ideas in `FUTURE_VISUAL_CAPABILITIES.md`. Neither is a blanket implementation mandate.

## Scope and anti-patterns
Do not confuse a researched product idea with an approved ticket. Do not duplicate Timeline/Canvas state. Do not require the animator's R&D to merge to modern `dev` prematurely. Preserve the owner's ability to explore many ideas while developers continue agreed work. Ask what materially improves an actual edit rather than generating architectural machinery for its own sake.
