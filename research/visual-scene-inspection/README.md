# Visual Scene Inspection R&D

## Objective

Build and demonstrate a small, local inspection-to-edit loop that lets an AI receive the same rendered frame the user sees, identify a meaningful element, resolve its Timeline/component owner and permitted edit target, and verify a minimal edit.

## Branch and test animation

- Branch: `feature/whisper-workflow-validation` (keep isolated; do not publish or merge).
- Existing animation: `projects/ai-video-origin-story/`.
- Useful cases: aligned full-frame creator PNG layers; the composite `tutorial-promise` clip with internal timing and children; the Three.js globe as a complex single Timeline clip.
- Preserve the current story and use the existing project as the testbed.

## Existing limitations observed

- Timeline v1 identifies clips, tracks, timing, content and declared component fields.
- The preview lives in a sandboxed iframe on a separate local origin. The shell cannot directly inspect its DOM.
- The agent does not automatically receive the current Canvas image, selected visual element, or a frame-specific visual map.
- `tutorial-promise` is one Timeline clip; its internal elements and local-frame timing are implemented inside `Composition.tsx`.
- A measured bounding box alone does not make an element editable; an explicit, validated edit binding is needed.

## Expected behavior

A user chooses the playhead time, enters a natural-language request, and invokes a focused UI action. FloxBow saves a bounded local context package (frame image plus structured inspection data) beside the project and copies a concise prompt containing its paths and revision/frame context. The package remains read-only context; canonical edits continue through Timeline or explicit trusted code changes.

## Current proof of concept

- In the active project's Editor toolbar, open **AI visual context**. The panel takes its frame and selected clip from the editor; enter a request and choose **Capture and copy for AI**.
- The output goes to `projects/ai-video-origin-story/.floxbow/visual-inspection/<capture-id>/` as `frame.png`, `inspection.json` and `request.md`. The folder is outside the canonical Timeline and the project watcher ignores it.
- The current registration covers the typing PNG, three tutorial dragon sprites and the sample caption. The caption maps to a declared Timeline field. The dragon sprites are explicitly marked code-owned; they are identifiable but not directly editable through current Timeline fields.
- `inspection.json.timelineElements` now indexes every Timeline clip active at the captured frame, including its time range, component identity, source reference, serialized clip data, and declared Inspector fields with current values. This lets an agent find a title or object by its visible text and go directly to its clip and editable fields.
- `inspection.json.elements` continues to hold explicitly registered rendered DOM nodes and their measured bounds. These bounds are DOM border boxes in composition pixels; transparent PNG padding is not segmented, and WebGL descendants or exact pixel occlusion are not reported.
- A clip with no declared fields remains identifiable through `timelineElements`, but the package marks it as timeline-data-only so the agent knows to inspect that component's implementation before claiming it is directly editable.
- Latest live test package: capture `6365a3fa-13fc-48b9-9dc9-28237fabbb4c`, frame 195 / 6.5 seconds. The native Editor test session is left open for manual review.

## Codex context resolver (read-only experiment)

From the repository root, Codex can resolve an existing capture directly without opening unrelated files by hand:

```powershell
node research/visual-scene-inspection/context-resolver.mjs bf8f74ab-62ff-418d-a9ed-a21311f056fb --target thumbnail-no-editing
```

The first response reports capture/current Timeline revision status, captured and current values separately, component/source symbol, editable-field classification, and Timeline clip boundaries around the captured frame. It compares the capture's Timeline revision with the SHA-256 revision FloxBow records for the current `edit-timeline.json`. A stale capture is labeled and per-field drift is shown when schema-v2 data contains the historical clip values.

Fetch more detail only when useful:

```powershell
# Source excerpt for the component that owns the visible tutorial dragons
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode source

# Current component field schema, plus fields captured if the artifact has them
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode fields

# Wider temporal neighborhood (frames before and after the captured frame)
node research/visual-scene-inspection/context-resolver.mjs bf8f74ab-62ff-418d-a9ed-a21311f056fb --target thumbnail-no-editing --mode temporal --window 120

# Machine-readable response
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --json
```

The resolver reads only `inspection.json`, the project's canonical `edit-timeline.json` and `Composition.tsx`; output is bounded. It never writes project files. Source locations identify registered component symbols and their syntax range, not automatically inferred causal expressions. Captures without a source fingerprint report that source freshness was not recorded. Older captures without `timelineElements` can still resolve registered visual owners and the current Timeline clip by ID, but their current values are explicitly not described as captured values. See [the R&D review](MULTI-SNAPSHOT-REVIEW.md) for the architecture analysis and [resolver results](CONTEXT-RESOLVER-RESULTS.md) for actual case validation and measurements.

## Scope and safety

- Experimental, local-only changes on the current branch.
- No merge, rebase, cherry-pick, push or change to `dev`.
- No dynamic plugin installation, arbitrary filesystem access, arbitrary JSON path writes, or automatic exposure of every DOM/WebGL child.
- Test only with the existing animation and a small number of registered visual nodes.

## Recovery

- Source changes are local and uncommitted on `feature/whisper-workflow-validation`.
- The pre-instrumentation project files are preserved in `baseline/`; the project instrumentation is in its existing `Composition.tsx`. The user's Timeline content was not edited.
- Keep the active Electron UI session running while the user tries the first test; close the session through its UI when done.
- To run the live editor, use the repository's documented `npm run dev`; use the project `ai-video-origin-story`.

## Follow-up review

- [Multi-snapshot and interactive editing review](MULTI-SNAPSHOT-REVIEW.md) records the current implementation evidence, proposal for compact snapshot bundles, direct-selection feasibility, external precedents and incremental acceptance tests. It is analysis only; no features were implemented.
