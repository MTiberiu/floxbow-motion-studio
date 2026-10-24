# Visual Inspection: Multi-Snapshot and Direct Editing Review

Date: 2026-10-24
Branch: `feature/whisper-workflow-validation`
Scope: investigation and design only. No application, project, dependency, or Timeline changes were made for this review.

## Executive recommendation

Keep the existing capture as a read-only observation and extend it in three independent steps:

1. Make the current package more compact and more explicit about what is measured, editable, selected, and stale.
2. Let the user collect several frame captures with separate instructions, then copy one bundle that points to the captures and gives shared project context only once.
3. Add selection from the live Canvas by reusing an explicit visual-ID bridge and the existing Inspector/Timeline edit commands. A saved screenshot can provide a hit-test overlay, but edits must still be applied to the current canonical Timeline session after revision checks.

Do not use React DevTools or the Chrome DevTools Protocol as the production editing API. Both are useful investigation references; neither supplies FloxBow's stable, project-aware edit contract. A measured rectangle is not permission to change it.

## 1. Existing implementation

### Capture path

The editor owns the playhead, selection, Timeline document, dirty state, saved revision and state version. Its **AI visual context** action currently:

1. Pauses the preview and asks the preview iframe to seek to the editor frame.
2. Sends a `motion-editor-v1` `inspect-frame` message to the iframe, checking `event.source`, the preview origin, project ID and request ID on the response.
3. The preview measures the composition root and registered `[data-flox-visual-id]` nodes. It reports IDs, labels, nearest Timeline clip/track/component IDs, local frame, text/alt text, opacity, DOM border-box bounds, DOM order and CSS z-index.
4. The shell takes the intersection of the visible Canvas and preview stage, then Electron `webContents.capturePage(rect)` captures that screen-space rectangle. This is the visible editor crop, not a fresh full-resolution Remotion render.
5. The editor also builds `timelineElements` from the current canonical document: every clip active at the reported global frame, its global/local range, track and component names, serialized `content` and `props`, and values for the component's declared editable fields.
6. The shell POSTs the package to the local development server. The server validates the project ID, request shape, dimensions, frame/FPS, PNG signature and size, bounds output to the project's `.floxbow/visual-inspection/<capture-id>/` directory, then writes `frame.png`, `inspection.json` and `request.md` through temporary files followed by per-file rename. The inspection folder is excluded from preview reload watching.
7. The current action copies the generated Markdown instructions to the clipboard. The request includes the user prompt, one frame/time, selected clip, saved/dirty state, revision/state version and absolute artifact paths.

Key source locations: `apps/desktop/src/TimelineEditor.tsx` (`prepareVisualContext` and panel UI), `packages/player/src/host.tsx` (`inspect-frame`), `packages/motion-sdk/src/editor.tsx` (clip ownership wrappers), `apps/desktop/electron/window-host.cjs` (bounded Canvas capture and clipboard IPC), and `scripts/server.ts` (validation, package writing and prompt generation).

### How the frame index maps to editable data

The Timeline wrapper puts `data-flox-clip-id`, `data-flox-track-id` and `data-flox-component-id` around each rendered component. A visual node opts in with `data-flox-visual-id`. The preview resolves its closest wrapper and returns those stable IDs. Separately, the shell resolves active clips against the current component registry and `fieldValue()` to report the actual declared Inspector controls. This is the important boundary:

- `elements` says what explicitly registered DOM elements were measured in the rendered preview.
- `timelineElements` says which Timeline clips were active at that global frame, and which declared fields are available for them.
- `editability` labels describe the supported route; they do not make arbitrary DOM or source code editable.
- The existing Inspector changes Timeline clip data through editor-session commands. Save still goes through the current `/api/edit/<project>` revision-checked save path; undo/redo live in the editor session.

The measured DOM border box is not an alpha-mask for PNGs, a pixel-level visibility map, or a record of every child in a composite. CSS `zIndex` and DOM order are hints, not proof of occlusion. The current probe deliberately does not enumerate WebGL objects or claim exact visible-pixel bounds.

### Actual animation evidence

The user's capture at frame 161 (5.367 s at 30 fps) is the best example. It is schema version 2, has no selected clip, and shows one registered visual node (`scene-01-creator-typing-png`). Yet `timelineElements` directly lists the active opening search, all three thumbnail clips and `opening-click`, including `thumbnail-no-editing` and its declared values (`expandOnClick`, `clickFrame`, `expandFrames`, position, width and fade duration). This made it possible to identify the target by matching the visible thumbnail to its active Timeline clip without searching the entire project JSON. The screenshot and local frame (33) exposed the visual failure; inspecting the owning `ClickbaitThumbnail` source was still necessary to understand the interaction between expansion and fade.

The older frame-999 package is schema version 1: its screenshot is only 393 × 221, `elements` is empty, and it has no `timelineElements`. It records a selected scene clip but not the title's measured visual identity or active clip field index. That was a harder request: the agent had to use the small screenshot and selection as clues, then locate the title through project data/code. The later frame-161 package demonstrates the useful improvement made by schema version 2.

At frame 161, the selected thumbnail is in local frame 33 of a 37-frame clip. Its code expands from local frame 17 over 20 frames, while the last nine frames fade the entire card. At local frame 33 that fade is already about 44% opacity. This explains why the other thumbnails and the desk show through. The current capture was useful because it supplied both the image and the exact active clip fields; it did not itself reveal the component's opacity formula.

At frame 195 in the first UI test, the package lists the typing layer, three dragon visuals and the sample caption. The caption has a declared Timeline binding; the dragon elements are marked `code-owned` and point to the composition source. This is the correct distinction: identifiable is not the same as editable.

### What is reliable vs experimental

**Working and already exercised:** user-triggered capture from the live Editor; origin/project/request correlation on the bridge; bounded Electron IPC; current-frame response; explicit DOM registration; clip/track/component owner resolution; active Timeline field indexing; per-file atomic artifact writes; copy-to-clipboard; the earlier live Electron UI test and its saved packages. The research journal records typecheck, project validation and 56/56 tests passing for the implementation stage.

**Still experimental or limited:** the feature is local-only and has one request text field and one capture per action; collected state does not survive as a multi-snapshot draft. The request copies paths rather than embedding/attaching image bytes, so an external agent must be able to read those files or the user must attach them. Capture is at visible Canvas display resolution and may be small when the Canvas is fitted beside the Timeline. The bridge's `seek(frame)` followed by `inspect-frame` does not currently assert that the returned frame equals the frame requested before capturing. There is no visual-node hit-test/selection overlay, no automatic registration of every DOM node, no component-source fingerprint, and no snapshot-based direct-edit command. Composite children can remain code-owned. WebGL internals are not semantically identified. These limits should be surfaced rather than hidden behind a “selected element” claim.

## 2. Weaknesses and payload quality

The current design has enough context for a careful agent, but the package can be clearer and smaller:

- `timelineElements` contains full `content` and `props` plus a second list of editable field values, so common values are duplicated. Every active clip is included even when visually irrelevant.
- A single selected Timeline clip is not the same as a selected visible object. The UI currently says “No clip selected” at the user's frame-161 capture even though the screenshot contains a clear thumbnail target.
- `elements` is sparse by design: only explicitly annotated visuals appear. Agents need a compact explanation of this registration coverage and should not infer that missing means invisible.
- Bounds have a coordinate space and kind, but not a source-to-screenshot transform, clipping/alpha estimate, or topmost hit target. The screenshot may be downscaled; use its measured pixel width and height, not composition dimensions, when placing an overlay on the bitmap.
- Timeline `revision` and `stateVersion` are included, but source code/component metadata can change without changing the saved Timeline revision. A historical snapshot can therefore point at code whose behavior has since changed.
- A sequence of captures can accidentally combine different project edits. Playhead moves and selection changes are expected between snapshots, but a content edit between captures should be detected and called out.
- The one current `Copy Instructions`-style action is actually **Capture and copy for AI**. It captures once, saves one package and copies one Markdown request. It has no queue, per-snapshot message, reorder/edit/remove workflow, or combined manifest.

The request should separate immutable evidence from the desired edit. A snapshot should state “what is visible at this frame” and its own instruction. The bundle-level instructions should say once that screenshots are observations, that stable Timeline/component IDs are the edit targets, and that no edit should be inferred from bounds alone.

## 3. Proposed multi-snapshot contract

Keep the existing capture package for each snapshot. Add one compact bundle manifest and one combined Markdown prompt; do not copy screenshot bytes into the JSON or repeat all active clip data for every snapshot. Stable project-relative artifact paths are preferable in the manifest; the copied request can include the local project root once for this same-workspace workflow.

Illustrative contract (field names are a proposal, not implemented):

```json
{
  "schema": "flox.visual-edit-context/v1",
  "bundleId": "<uuid>",
  "project": {
    "id": "ai-video-origin-story",
    "fps": 30,
    "durationInFrames": 3510,
    "composition": { "width": 1920, "height": 1080 },
    "timelineRevision": "<one shared saved revision or draft hash>",
    "dirty": false
  },
  "order": "chronological",
  "sharedInstructions": [
    "Treat each image as frame-specific evidence, not as an edit overlay.",
    "Use the referenced Timeline clip and declared fields; do not infer editability from pixels or bounds."
  ],
  "snapshots": [
    {
      "snapshotId": "<uuid>",
      "frame": 161,
      "timeSeconds": 5.367,
      "instruction": "The camera should move through the thumbnail rather than making it transparent.",
      "screenshot": { "path": ".floxbow/visual-inspection/<capture>/frame.png", "sha256": "<hash>", "width": 1413, "height": 795 },
      "inspectionPath": ".floxbow/visual-inspection/<capture>/inspection.json",
      "selection": { "visualId": null, "clipId": null },
      "targetRefs": ["timeline:thumbnail-no-editing"]
    }
  ]
}
```

Additional rules:

- Project identity, composition size/FPS, common safety instruction and bundle revision appear once. Each snapshot carries only its own frame/time, capture references, selected visual/clip IDs, instruction and any snapshot-specific target refs.
- Store a stable `timelineContentHash` for the exact in-memory Timeline document. The current disk revision alone is insufficient when the Editor is dirty. Store `dirty` and the document hash once for the bundle; retain per-capture `stateVersion` for diagnosing the exact UI state.
- Store a component registry/schema revision or source fingerprint for direct edits. The current app does not provide that yet; the proposal should call it absent until implemented rather than fabricate a value.
- Deduplicate repeated target records in a top-level `targets` map keyed by `clipId` (and by `visualId` when present). A snapshot references those targets; only relevant targets are expanded inline. Keep full raw inspection JSON as a separate artifact for deep investigation.
- Validate unique snapshot IDs, frame integers in `[0, durationInFrames)`, matching project/FPS/size, nonempty per-snapshot instruction, existing capture references, PNG dimensions/hash and one consistent Timeline content hash. If content changes during collection, warn and either start a new bundle or make the mixed revisions explicit; do not silently combine them.
- Default order should be chronological by global frame. If user drag-reorders for narrative emphasis later, keep a separate `displayOrder`; never rewrite frame numbers or imply that the clips themselves were reordered.
- Keep payload bounded. Each capture remains subject to existing PNG/request limits; the bundle stores references instead of image data. A versioned schema and strict size/count limits belong on the server as well as in the UI.
- Copy should generate one readable Markdown message plus references to every screenshot and inspection file. A text clipboard does not attach local images. The UI should say so and make the images easy to select/attach when the target agent cannot read the shared workspace.

### Example copied prompt

```text
# FloxBow visual edit request

Project: ai-video-origin-story · 30 fps · 3510 frames · 1920×1080
Timeline base: <revision/hash> · saved
Order: chronological. The snapshots are evidence from one project state.

Shared rules: Preserve the requested story. Use the existing editable Timeline or its declared fields. A measured visual is not automatically editable. Do not alter elements unrelated to these instructions.

Snapshot 1 — Frame 161 · 5.367 s
Request: The camera should move through the thumbnail rather than making it transparent.
Target: timeline clip thumbnail-no-editing (local frame 33); no visual/clip was selected in the Editor.
Screenshot: .floxbow/visual-inspection/<capture-1>/frame.png
Inspection: .floxbow/visual-inspection/<capture-1>/inspection.json

Snapshot 2 — Frame <n> · <seconds> s
Request: The three dragons should be visible and still for one second before animation.
Target: timeline clip tutorial-promise; local frame <n-165>.
Screenshot: .floxbow/visual-inspection/<capture-2>/frame.png
Inspection: .floxbow/visual-inspection/<capture-2>/inspection.json

Snapshot 3 — Frame <n> · <seconds> s
Request: Hold the final dragon composition for one second before returning to the girl.
Target: timeline clip tutorial-promise; local frame <n-165>.
Screenshot: .floxbow/visual-inspection/<capture-3>/frame.png
Inspection: .floxbow/visual-inspection/<capture-3>/inspection.json
```

The combined request should avoid restating the active clips' entire `content`, `props` and editable field lists three times. The capture files already carry that detail. A later payload optimizer can include only the requested target fields inline after it resolves them from the existing registry.

## 4. UI proposal for collecting snapshots

Extend the current panel without changing Timeline state:

1. **Add snapshot at frame** captures the paused current Canvas frame and appends a card. It does not modify project data. The card starts with the current selection and an editable instruction field.
2. Each card shows a thumbnail, global frame/time, selected clip/visual ID (or “none”), current timeline revision/hash, and whether its context is current or stale.
3. Per-card controls: edit instruction, recapture this frame, remove from the draft bundle, and open its saved screenshot/inspection. Removing a card removes it from the draft bundle; it does not delete project media or the original evidence by default.
4. A playhead change only changes the next capture. It never changes existing cards. Captures remain fixed observations until recaptured.
5. Show a small list with count and chronological order. Start with chronological order only; adding manual reorder is straightforward later, but order must remain distinct from frame identity.
6. **Copy combined instructions** is one action. It writes a versioned bundle manifest and prompt under `.floxbow/visual-inspection/`, then copies the prompt. The panel states whether paths are usable by the current agent or whether the user must attach the images.
7. If the Timeline document hash changes after the first capture, show “Project changed since snapshot 1”. Offer to discard/restart the set or keep it with explicit per-snapshot base revisions. Do not silently bundle mixed content states.

Capturing should pause and seek the preview, but should not alter Timeline content, selection, dirty state or history. If pausing/seeking increments an editor state version, that is acceptable; the bundle needs a separate Timeline-content fingerprint so ordinary transport changes are not mistaken for content edits.

## 5. Direct editing from a snapshot

### Three distinct workflows

| Workflow | What is current? | Safe behavior |
|---|---|---|
| Live frame at playhead | Current preview and canonical editor state | Select a registered visual by ID, resolve its owner clip and declared fields, then use existing selection/Inspector/commands. |
| Previously saved snapshot | Frozen pixels and captured state/revision | Use as a reference. Before editing, validate the project, Timeline-content hash, target clip/field baseline and component schema/source revision. If stale, require refresh or show a deliberate field-level rebase. |
| Snapshot as annotation only | Only the user's intent and frozen evidence | Keep it read-only and copy it with the package. It must never dispatch an edit. |

### Is an interactive bounds overlay feasible?

Yes, with the existing split-shell architecture, but only for explicitly registered DOM visuals:

- Render the current screenshot or live Canvas beneath a transparent shell-owned SVG/HTML overlay. Convert composition-space bounds to the displayed Canvas coordinates using the exact Canvas scale, pan and screenshot size.
- Hover/click resolves the stable `visualId`, then its owner `clipId`, `trackId` and `componentId`. If multiple bounds overlap, do not guess from z-index alone. Ask the preview to hit-test at the mapped composition coordinate and return the topmost registered semantic ID plus the IDs underneath.
- The current iframe is cross-origin relative to the shell. The shell should not inspect its DOM directly. Extend the existing origin- and project-validated `motion-editor-v1` bridge with a small, typed hit-test request/response. The preview may call `elementFromPoint()` internally and return only approved registration metadata, never DOM nodes or arbitrary properties.
- A saved screenshot overlay uses recorded bounds and is necessarily a hit target from that old render. It is safe as a reference selector, not as proof the live element is unchanged. Before applying an edit, compare captured target identity/revisions against the live editor.

This approach is preferable to a second Canvas editor: the Canvas remains rendered by the current preview; the overlay only selects known elements. Selection sets the existing selected clip and opens/focuses the current Inspector. For a narrow property quick-edit, filter the existing declared field schema to supported controls (for example text/color/number) and route changes through the same editor command that Inspector uses. Save, dirty/conflict handling and undo/redo remain the existing owner.

### Position drag / visual intent

For a field explicitly declared as numeric position, a drag can calculate a candidate `x`/`y` from the composition-coordinate delta and show the proposed value before applying it through the Inspector contract. This only works when the declared field describes the visual coordinate system and anchor. Do not reverse-engineer arbitrary CSS transforms, perspective, camera moves, nested composites or Three.js world positions from a screenshot. Those need a module-owned transform/edit binding and may need a UI-specific gizmo.

### Composite and WebGL elements

`tutorial-promise` proves the boundary. A registered dragon PNG inside it maps to the parent `tutorial-promise` clip, but its motion values are in local React code. Opening the parent Inspector only exposes fields declared by `tutorial-bait`; the child sprite does not become an independently editable Timeline clip. The UI should say “visible, code-owned” and offer source references, not fake color/position controls.

Three.js is even more explicit: a Canvas is one DOM hit target. Selecting an individual mesh needs module-provided raycasting/picking and a semantic object ID; an allowed editing command must then map that ID to a documented canonical property. A screenshot alone cannot identify a mesh's editable state. For a code-owned effect/scene, only a declared component control or trusted source edit is valid.

### Staleness, undo, comparison and save

- Capture `projectId`, global frame, Timeline `revision`, `dirty`, a canonical Timeline content hash, state version, selected IDs, target clip baseline values, and a revision/fingerprint for each relevant component schema/source.
- Do not use editor `stateVersion` alone as stale protection: it may change on selection, transport or other state transitions. It is useful for diagnosis/command sequencing. The timeline hash and field baseline identify actual edit conflicts.
- For the first direct-edit slice, fail closed if the project/TL hash or relevant component schema/source revision changed. A later field-level rebase may be allowed only if the clip still exists, its component/field schema is unchanged, and the field's live value equals the captured baseline.
- Apply one edit using the existing editor-session command path, creating one undo checkpoint. Do not write `edit-timeline.json` from the snapshot surface and do not create a second editor-state store.
- Save through the existing revision-checked project save; preserve its conflict behavior. If an external edit changed disk revision, the existing save conflict/reload flow remains authoritative.
- Compare before/after by rendering/capturing the same global frame from the updated preview and showing before/after or a blink comparison. Keep the original screenshot immutable and label its captured revision. Preview seek and render are deterministic from frame and Timeline props, but screen capture and output render may differ in scale/compositing; verify parity before treating pixel comparison as exact.
- A fresh capture after edit is the most reliable visual verification. Save/reload and existing renderer checks remain responsible for persistence and final output parity.

## 6. External approaches and fit

### Browser DOM inspection and source mapping

Chrome DevTools Inspect mode highlights an element and shows box/style/accessibility details. The Chrome DevTools Protocol provides DOM coordinate-to-node and box-model operations. These demonstrate that hover/click overlays are a standard browser technique. Their node IDs belong to an inspection/debugging session and do not map to FloxBow clip IDs or saved Timeline properties. The current explicit `data-flox-*` contract is the correct stable semantic layer.

Electron exposes a per-`webContents` debugger, but turning the editor's own CDP/debugger connection into a production edit API would add coupling to a changing protocol and broaden a powerful debugging surface. Keep it as a local diagnostic/test option only, not the editing contract.

### React DevTools

React DevTools can inspect component trees, props and state and is useful for developers debugging a React composition. It does not define which values persist to FloxBow's Timeline, has no contract that maps props/state back to an allowed clip-field operation, and does not own FloxBow save/undo/revision rules. Do not embed its internals as a customer edit API. Explicit stable visual IDs plus `componentId` and declared field schemas are less magical and safer.

### Remotion Studio interactive editing

Remotion's `Interactive` components and `Interactive.create()` make explicitly declared components/props and transforms selectable/editable in Remotion Studio. This is a useful design precedent: interaction is opt-in and field-schema driven. FloxBow already has an application-owned Timeline v1 and Inspector field contract. Reuse its contracts and state path; do not replace them with Remotion Studio's editing state or add a parallel Timeline.

### Multi-frame creative review

Adobe Frame.io/Premiere offers timestamped frame comments and visual annotations; selecting a comment can navigate to the corresponding frame. That is a useful interaction model for a collection of frame-scoped instructions and return-to-frame behavior. Those comments are review/annotation records, not edits to a target component's canonical properties. FloxBow can add the stronger ID/revision relationship through its Timeline index while keeping annotation-only use valid.

### Options comparison

| Option | Reuse / effort | Reliability | Recommendation |
|---|---|---|---|
| Static overlay over stored measured bounds | Reuses current payload; small UI change | Fast, but stale and rectangular; overlapping elements can be ambiguous | Good for saved-snapshot annotation and hover labels, not final live hit-testing |
| Typed preview hit-test over current bridge | Reuses preview origin boundary and semantic registrations; moderate extension | Can return topmost registered target at an exact frame; still cannot find unregistered DOM/WebGL children | Recommended selection primitive for live Canvas MVP |
| CDP `DOM.getNodeForLocation` / `getBoxModel` | Little visual metadata work; debugger/protocol coupling | Browser node IDs are ephemeral; not a stable Timeline editing map; protocol API can change | Diagnostic prototype only, not production contract |
| React DevTools component/prop inspection | Valuable developer diagnostics | Runtime component internals/state are not a persisted editor schema | Do not build product editing on it |
| Remotion `Interactive`/Studio | Existing precedent for explicit selectable controls | Separate editing/runtime contracts and state from FloxBow | Borrow opt-in semantics, not its editor/session |
| New independent screenshot Canvas editor | Initially appears direct | Duplicates selection, transform logic, Inspector, undo/save and risks divergence | Reject; violates the one-state requirement |

## 7. Incremental plan and acceptance tests

### A. Improve the existing payload — first

Reuse: current capture action, schema-2 `timelineElements`, registered node geometry, local save route and stable clip IDs.

Extend: explicit requested-vs-reported frame check before capture; include coordinate-space/preview scale data and whether registration is complete/partial; include stable Timeline content hash and component schema/build fingerprints when available; trim duplicate full field data and cap active/relevant data; distinguish selected clip from selected visual target; label screenshot as display-resolution Canvas crop.

Acceptance:

- A request for frame N either captures and records exactly N or reports a stale/mismatched-frame error; it never pairs screenshot pixels with a different frame index.
- At frame 161, the package resolves `thumbnail-no-editing` from the active `timelineElements` and its source/component identity without requiring broad JSON search.
- A registered transparent PNG reports its DOM box as a DOM box, never as visible alpha bounds.
- An unregistered DOM child and a Three.js mesh are not falsely reported as editable.
- Capturing while dirty records the draft state and does not save or change the canonical Timeline.
- Payload size/limits and any clipped/out-of-Canvas nodes are explicit and tested.

### B. Multi-snapshot collection + one copy action — second

Reuse: existing single-capture persistence and copy bridge. Add panel-local snapshot cards, per-card instructions, a combined manifest and single generated Markdown request. No Timeline edits or selection changes are needed.

Acceptance:

- Add snapshots at multiple frames; each image, global frame/local clip frame, selected IDs and instruction remain paired after changing playhead.
- Edit one instruction without affecting other cards; remove one card from the bundle without modifying source media or the canonical project.
- One copy operation lists shared project metadata once and contains each snapshot's own request, time, screenshot and inspection references.
- Chronological order is deterministic; if manual ordering is added, `displayOrder` changes without changing frame/time.
- Mixed project Timeline hashes are detected and called out. Reopening or removing a draft has defined behavior.
- Every stored artifact and combined bundle passes schema, path, hash and size validation; captures remain outside canonical Timeline data and do not trigger project reload.

### C. Interactive snapshot/live-frame selection — third

Reuse: `data-flox-visual-id`, clip/track/component wrapper IDs, the validated preview bridge, Timeline component field schemas, selected clip, Inspector, EditorSession command/save/undo/redo path.

Add: overlay mapping; typed, bounded hit-test; explicit target/field binding metadata; stale snapshot guard; optional small quick controls that are projections of Inspector fields, not a new model.

Acceptance:

- A live click on an annotated thumbnail resolves to `thumbnail-no-editing`, then selects the same Timeline clip shown in the Inspector.
- When two registered nodes overlap, the preview hit-test returns the topmost stable ID and available alternatives; the app does not guess from screenshot opacity or z-index alone.
- A supported color/text edit changes the declared Timeline field, updates Canvas, creates one undo entry, survives save/reload and remains in canonical `edit-timeline.json`.
- An old snapshot whose Timeline hash or component schema/source fingerprint changed is read-only or requires explicit safe refresh/rebase; it cannot silently edit the changed target.
- A code-owned dragon shows no fake field controls. If a future component declares its color/position, those controls appear through that component's schema.
- Before/after comparison is for the same global frame; its labels identify the two revisions.
- A Three.js mesh is selectable only after its module supplies stable IDs, deterministic raycast picking and a declared property/edit command.

Do not make B depend on C. A useful multi-snapshot request can be delivered while snapshots remain annotations only.

## External references

- [Chrome DevTools Inspect mode](https://developer.chrome.com/docs/devtools/inspect-mode): hover/click selection and browser-rendered box/style feedback.
- [Chrome DevTools Protocol DOM domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/): `DOM.getNodeForLocation`, `DOM.getBoxModel` and protocol node identities.
- [Chrome DevTools Protocol overview](https://chromedevtools.github.io/devtools-protocol/): domains are JSON commands/events; tip-of-tree changes and provides no backwards-compatibility guarantee.
- [React Developer Tools](https://react.dev/learn/react-developer-tools): component, props and state inspection for debugging.
- [Electron `webContents`](https://www.electronjs.org/docs/latest/api/web-contents): the `webContents.debugger` connection exists; this review recommends against making it the editor API.
- [Remotion Interactive](https://www.remotion.dev/docs/interactive), [Interactive.create](https://www.remotion.dev/docs/interactive-create), and [Interactivity schema](https://www.remotion.dev/docs/interactivity-schema): explicit components and declared editable props in Remotion Studio.
- [Remotion editable Elements](https://www.remotion.dev/docs/studio/creating-elements): recommendation to expose intended layers and controls rather than infer them from rendered markup.
- [Adobe Premiere / Frame.io frame-specific comments](https://helpx.adobe.com/in/premiere/desktop/collaborate-with-others/share-for-review-using-frame-io/add-comments-on-shared-projects.html): timestamped comments and frame navigation as a review workflow precedent.
- [Adobe After Effects / Frame.io V4 annotations and timeline markers](https://helpx.adobe.com/after-effects/desktop/collaboration-with-others/frame-io/collaborate-using-frame-io.html): frame comments, drawn annotations and comment markers linked to composition time.

## Review conclusion

The recent edit succeeded because the frame-161 capture paired the actual image with a current-frame Timeline index, IDs and declared fields. The remaining hard part was understanding behavior inside the owning React component; the selected thumbnail was not a standalone independently editable object for all of its internal animation. Multi-snapshot capture solves context packaging and chronology, not automatic editing. Direct editing becomes practical only when a visible target resolves to a stable registered ID and then to an allow-listed canonical field/command owned by FloxBow's current Editor session.

## 8. Review of the Manager's extensions

This review uses the saved frame-161 package for `ai-video-origin-story` (`bf8f74ab-62ff-418d-a9ed-a21311f056fb`) and the actual `thumbnail-no-editing` / `ClickbaitThumbnail` implementation. The package says frame 161 is global frame 161, local frame 33 of the thumbnail clip (128–165), and records `expandOnClick: true`, `clickFrame: 17`, and `expandFrames: 20`. The component interpolates the card from its initial size to full composition size, fades its text as it expands, and independently fades the card over its last 9 local frames. Those independent curves explain the captured transparency/overlap: at local frame 33 the card is near the end of its exit fade. This describes the captured revision. The currently checked-out Timeline has since changed `expandOnClick` to false, so any source or values resolved from the old capture must be shown as historical/stale until revision-checked.

### 8.1 Stable context entry point

**Verdict: genuinely improves the portal; necessary for the promised “take me to the context” workflow, but not a replacement for the capture package.** The current package is already much better than a bare screenshot or copied file path: it has capture ID, project/frame, stable clip/component IDs, declared editable fields and source references. Yet Codex still has to manually open/search the project source. A read-only context resolver that accepts the capture ID (and optionally a target ID) could return the relevant Timeline entry, source symbol/reference, concise temporal neighborhood and file links in one request. That removes the user-side hunt when the agent has access to the same checkout.

An opaque URL/handle that Codex cannot open or call would not improve anything over current file references. The resolver must be exposed through an agent-usable local tool/API or equivalent workspace-readable artifact. Reuse the existing capture ID and schema-v2 package as its input; do not mint a second copy of the project snapshot. Keep the resolver scoped to the captured project and read-only. Do not make a renderer DevTools/CDP session the public editor API: browser node IDs are ephemeral, CDP is a debugging protocol with compatibility caveats, and they do not identify canonical Timeline fields by themselves. The current explicit visual IDs and Timeline wrappers are better stable anchors. ([CDP DOM domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/), [protocol compatibility note](https://chromedevtools.github.io/devtools-protocol/))

### 8.2 On-demand context retrieval

**Verdict: preferred; optional only when the complete context is already small.** Return a compact first response: exact project/revision/frame, screenshot reference, visible-node-to-clip/component mapping, whether the target is Timeline-field-editable or code-owned, available fields/operations, a source entry point if known, and the closest preceding/following Timeline events. Then allow targeted retrieval of a source excerpt, a field schema, or a wider event neighborhood.

This balances latency and context cost. One concise initial result avoids paying for the whole composition source and every active clip on each request. The extra tool call is justified only when the task needs it; straightforward title/color edits can stop after the first result, while procedural changes can fetch the owning source and local temporal context. A full bundle remains a useful fallback for agents without a context tool or offline use. The current `timelineElements` index, saved capture artifacts, stable IDs and component field declarations are reusable. Remotion's own model similarly relies on explicit schemas/elements for supported interactivity instead of guessing every rendered detail. ([Remotion interactivity schema](https://www.remotion.dev/docs/interactivity-schema), [Remotion editable Elements](https://www.remotion.dev/docs/studio/creating-elements))

### 8.3 Source-code navigation

**Verdict: a close source entry point is worthwhile; automatically naming the exact responsible expression for arbitrary React code is not reliable and would be unnecessary complexity.** For this case, identifying `ClickbaitThumbnail` was enough to narrow the investigation, but I still had to read the function's calculations and connect them to the captured values. A resolver could point directly to the `ClickbaitThumbnail` symbol and a source range around the expansion and opacity calculations. That is a meaningful reduction from opening the whole `Composition.tsx` file.

The reliable baseline is a source reference with repository-relative file, exported component/function symbol, line range, and source fingerprint. An optional author-supplied behavior annotation can bind a visual ID or component behavior key to a named calculation/event. Build-time AST indexing can locate syntax-level symbols/ranges, but it cannot generally decide which expression caused an observed visual symptom: values may be delegated through helpers, computed from multiple props, selected by frame, or rendered procedurally. Source lines shift; hashes and component-schema fingerprints must invalidate stale ranges. If no explicit mapping exists, return the component symbol and say “inspect this component,” not a fabricated exact property. React DevTools and Remotion inspectability are useful debugging precedents, but neither proves semantic responsibility for arbitrary code. ([React Developer Tools](https://react.dev/learn/react-developer-tools))

For `ClickbaitThumbnail`, a useful authored/indexed reference would identify the expansion interpolation, `cardTextOpacity`, and the `opacity: Math.min(fadeIn, fadeOut)` composition, each with its source range and source fingerprint. The resolver should show the captured frame-local values and formula inputs alongside those references; it should not claim that a generic parser inferred causality.

### 8.4 Temporal context

**Verdict: necessary, bounded retrieval is cheap; full Timeline or frame-by-frame analysis is not needed.** A frame is a sample, not an edit context. Query the canonical Timeline interval index for clips active at frame N, those ending/starting within a small event window, explicit transitions, and semantically linked captions/audio. Include the nearest previous and next beat boundaries and any overlaps that could explain the sampled composite. This is event lookup over clip ranges, not repeated rendering of every frame.

At frame 161, the immediate event neighborhood is decisive: the three thumbnails and click/portal overlays overlap; the selected thumbnail clip ends at 165; `tutorial-promise` starts at 165. The sampled card's opacity calculation can be understood from the owner function, while the following tutorial is a separate parent clip. The dragons and demo caption within `TutorialBaitSequence` are internal code-owned events; the current Timeline only identifies their owning parent interval. To expose their exact beat boundaries, the component would need explicit semantic event metadata (for example `demo-start`, `prompt-start`, `return-to-desk`) or child Timeline clips. The resolver must not invent these from arbitrary code or send the whole Timeline by default. Use a small configurable frame/event window and expand on demand.

### 8.5 Multi-snapshot compatibility

**Verdict: worth designing for, not a reason to implement multi-snapshot now.** Keep one shared bundle header for project ID, Timeline revision/hash, FPS/duration, composition identity, request and resolver reference. Each snapshot contributes only its frame/time, its instruction, its screenshot/inspection reference and any target refs. Deduplicate resolved clip/component/source/field context by stable ID and source fingerprint; attach it once to the shared bundle or resolve it lazily. Do not copy the entire project JSON or component source into each snapshot. If snapshots come from different project revisions, flag that clearly and do not merge them into one assumed-consistent context. Preserve chronological order by default.

This reuses the existing per-capture artifact directory and schema-v2 metadata. A combined request should be an index/manifest over those immutable capture packages, not duplicate PNGs or independent copies of project metadata. The earlier multi-snapshot review already specifies paired instructions, deterministic ordering, hash checks and no mutation of canonical Timeline data.

### 8.6 Measuring whether the portal helps

**Verdict: useful after a read-only entry point exists; do not claim precise historical token/time savings now.** The saved artifacts prove the baseline's available data, but there is no telemetry recording my file opens, search count, model token count, or time-to-source for the earlier interaction. We can reconstruct the workflow qualitatively: the frame-161 package identified the target directly; then the source component still had to be located/read to connect expansion and fade. That is not enough evidence to report exact tokens or seconds. File bytes are not consumed token counts, and a retrospective estimate would be misleading.

Run a small controlled comparison after implementation: freeze the same project revision and use identical requests with (A) current snapshot/file references and (B) the read-only portal. Include at least the frame-161 thumbnail fade issue, a direct declared-field text/color edit, and a code-owned child animation such as the tutorial dragons/caption. Record searches and unique files read, actual context tokens (using the same model tokenizer), elapsed time to first correct target/source reference, and target accuracy against a reviewer-authored answer (clip, component, editable field or source range). Also record false target selections and stale-revision detection. Repeat several times in randomized order and compare medians plus accuracy; keep user text/content out of telemetry and do not include rendering or edit-completion time in “time to identify.” Until that test exists, the fair claim is “less manual discovery by design,” not a measured speedup.

### Preferred final design

Keep the screenshot and schema-v2 inspection package as the evidence; add a small, read-only, agent-callable resolver keyed by capture ID. Its default response should be concise and immediately useful: frame/revision, visible target → owning Timeline clip/component, declared editability, direct source symbol/range where available, and a bounded previous/next event summary. Add narrow on-demand retrieval for source excerpts, field operations and a wider event interval. Source references should be fingerprinted and conservatively precise; exact expression-level links should require explicit metadata or an AST mapping that only claims syntax location. Multi-snapshot should later share one project/revision header and deduplicate stable targets. Actual project edits must still go through FloxBow's canonical Timeline/Inspector/EditorSession path or an explicitly approved project-source edit. No second editing model, generalized React understanding engine, or user-facing duplicate editor is recommended.

The central limitation remains important: screenshot registration and Timeline wrappers identify what is visible and who owns it, while source annotations explain code-owned behavior. DOM inspection cannot establish exact alpha-visible pixels or reveal internal WebGL object semantics; dynamic code and helper indirection limit automated source attribution. This should be explicit in resolver results, with “unknown/code-owned” as a valid answer rather than a guessed control.
