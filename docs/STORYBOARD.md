# Storyboard Designer

Open a project in the live development workspace and choose **Storyboard** in the workspace navigation. This is a separate directing workspace; it never writes the rendered Timeline, composition source, Scene Moments or animation props.

## Authoring

1. **Create Scene**, name it and describe its story, style, creative direction and duration estimate. Optionally link a saved Timeline scene. A storyboard scene has its own identity; linking does not copy or change Timeline timing.
2. **Create Set**, draw using pencil, rectangle, ellipse, line or text. Select moves an element; Resize changes its bounds. The right panel has exact spatial fields and rotation. Eraser removes a complete stroke/shape. Undo/Redo cover storyboard edits. Zoom/Fit and Pan only affect the view.
3. **Create object from sketch**, then edit **Object name**. The object is the identity, the drawing is one representation. Use the identity selector to assign another drawing to that object. **Reuse drawing** creates an independent copy with the same identity. **Same object, new sketch** inserts a replaceable rough rectangle with the existing identity; draw a replacement and explicitly link it using Object identity. Hide/remove affects only the selected Set.
4. **Duplicate selected Set** or **Continue last Set** preserves object IDs and creates new Set/representation IDs. Rename each of five Sets, adjust start/duration, and move them Earlier/Later. Missing timing is allowed; overlaps and estimate overruns are warnings. Invalid negative/zero durations prevent saving.
5. **Import PNG reference** uses the existing trusted media picker. Choose the imported item in **Add existing image**, edit its name/category/description, and link it to a Set or selected object. On Save, Storyboard copies the PNG into `assets/storyboard/references/<reference-id>.png` and records that relative path in `storyboard.json`; it does not add a Timeline clip. Generated images use the same project-local folder. **Place** creates a moveable, scalable, rotatable composition representation. Its opacity and lock are authoring aids, not final animation requirements. **Trace** is a separate background aid with editor opacity; it is omitted from sketch exports.
6. The bottom context area reads saved Timeline soundtrack/separated-video audio and `getSubtitleCues`. **Replay Set interval** seeks to Set start and pauses at its end. Native controls pause/seek; displayed time maps media time to project seconds. Refresh after saving Timeline changes. Select a phrase or existing words to link them. **Saved timing anchors** stores source revision, status and timestamps separately from editable intended action time. Missing/mismatched word timings never gain invented precision. Synthetic timing retains `demo` status.
7. **Save storyboard** writes project-local `storyboard.json`. Reload discards a draft only after confirmation. A local recovery draft survives reopening; conflicting disk revisions block save. **Export draft** preserves your draft before resolving a conflict.

## Spatial contract (version 1)

The browser-safe schema/types/helpers are exported by `@motion/project-loader/storyboard`. The optional root `storyboard.json` contains `version`, `projectId`, actual `composition: {width,height,fps}`, ordered scenes, stable story objects, action plans, references, AI image requests, versioned imported briefs and review records. In this v1 format, `scene.sets[]` is the ordered list of shots shown in the UI; each entry is one shot, its `id` is the stable shot ID, and related records call that identity `setId`. A shot's `representations[]` are its visual layers, and `referenceImageId` points to its approved key image. The word “Set” remains in the persisted field and older agent command names for compatibility. Existing v1 storyboard files load with default empty action/request/review lists and do not need a new manifest field. No migration of Timeline v1 or Media Registry v1 is introduced.

Every representation has `id` (representation identity), `setId`, nullable canonical `objectId`, `coordinateSpace: "composition-percent"`, `anchor: "top-left"`, `x`, `y`, `width`, `height`, `rotation`, zero-based `zOrder`, `visible`, `opacity`, `locked`, `spatialNote`, reference association, pose/instructions/motion notes, and its sketch geometry. Coordinates refer to the unrotated placement frame's top-left corner. Rotation is degrees around that frame's center. For image representations, optional `imageFit` is `contain` (default, show the full source), `cover` (fill and crop inside the frame), or `stretch` (distort to the frame). The frame is movable/resizable independently of the project Canvas; it is not an invisible second image. Image-feedback coordinates use `image-percent` in the source image and follow that exact image as its frame moves, resizes, rotates, or changes fit mode. The array is back-to-front; `zOrder` must equal its array index. Freehand raster layers retain a full-canvas transparent PNG and their own layer transform; drawing again after zoom, pan or earlier strokes maps through that transform into the same stable pixel grid. Copying a Set deep-copies geometry while preserving object identity. The project Canvas format (`project.json` width and height), selected in either the Video Editor or Storyboard **Canvas** control, is authoritative for the Storyboard composition and exports; resizing the application only resizes the on-screen preview and never changes the project ratio.

`referenceImageId` is the shot's approved key image and remains distinct from its decomposed editable representations. When the Director selects a key image and no visual layers exist yet, the shared `attachShotReferenceImage` data helper creates one full-composition reference representation, so the reference is immediately usable as the shot image and can later be moved/resized like a normal element. When the Director has supplied layers, choosing a key image does not flatten or replace them. Legacy documents without this optional field continue to load; the UI derives the key image from linked `shot-image` references or reference representations.

`apps/desktop/src/storyboard-timeline.ts` is the narrow adapter to the existing Video Editor image clip: it maps Storyboard top-left percentage bounds to the Remotion Image component's center anchor once, preserves source asset ID, fit, rotation, opacity, timing and stable Storyboard IDs, and validates against `standaloneImageClipSchema`. In the Storyboard playback bar, **Play shot**, **Play scene** and **Play film** create a simple animatic: each selected key image is held for its planned duration, with no invented transitions or effects. These controls preview the Director's current visual order; they do not claim to play Animator code.

After approval and saving the affected direction, **Publish shot**, **Publish scene** or **Publish film** sends the selected scope through the existing Timeline editor session as an unsaved draft. Each visible image representation becomes its own ordinary editable Image clip, including character cutouts and clean backgrounds; their stable z-order maps to separate visual tracks. Saved Storyboard PNGs are registered in the project Media Library on first publish so the existing Video Editor player and renderer can load them by stable asset ID. The Video Editor displays these clips grouped into Timeline Scenes; use its existing Play and Save controls to preview the Timeline and persist it. Saving the Storyboard alone never publishes to the Timeline. Each generated clip carries a stable Scene/Shot/Layer link and a baseline fingerprint. Later Storyboard updates can refresh clips still matching that baseline, preserve unrelated Animator clips, and flag generated clips whose Timeline values have been edited since the last publish. A changed or removed generated clip is kept for review instead of silently overwritten. Use **Sync from Video Editor** in Storyboard after saving Timeline edits to pull linked Director clip timing and image transforms back into the plan. Storyboard then requires its own Save; changed approvals become stale through their content fingerprints. Different layer timings within one shot are reported and the shot's shared timing is left untouched because the current Storyboard model has no per-layer timing. Non-image drawings and planned effects are reported as not yet publishable; effect components will need to use the normal trusted Timeline component contract before they can play in the Video Editor.

The Director review composition uses `StandaloneImageLayer` from `@motion/sdk/editor` for every reference-image representation. The Timeline's `StandaloneImage` and Storyboard therefore share the same parsed clip contract and placement/fit/flip/opacity transform implementation; Storyboard selects the component's native `<img>` mode because it is a static workspace outside Remotion's frame context. Non-image drawings remain transparent PNG layers rendered by the Storyboard painter, with annotations overlaid separately. A change to the shared Image placement logic affects both workspaces without introducing another image-transform implementation.

For a 1080×1920 portrait, `x:78,y:82,width:12,height:15` means pixel bounds 842.4,1574.4,129.6,288 before rotation. Changing view zoom or scroll does not edit these values. Canvas display and PNG export share the same painter. Actual project dimensions, including custom sizes, determine aspect ratio and raster size. Composition percentages are compatible with Canvas Core's unit convention, but the explicit top-left anchor differs from components that use center anchors; consumers must apply the documented conversion rather than blindly copy props.

`compositionNote` records staging; `cameraNote` records optional framing/movement intent. Position changes between Sets are not automatically camera moves. There is no camera engine or animation interpolation.

## Project-local AI image workflow

### Image feedback tools

Choose **Annotate image** on a selected image layer. A point is placed as a location pin with one click; a rectangle is committed when you release the pointer. Lines and paths support point-by-point placement or freehand dragging with a smoothing control. For a closed area, click corners and either use **Close area** or snap to the first point; use **Finish path** for an open path. Pick the border color and width, add the instruction, then choose **Save feedback**. These marks stay linked to the selected reference and representation and do not create drawing layers. Rectangle geometry stores two opposite corners. Exported PNGs and the saved JSON retain the same shape, image-relative points, color and optional stroke width.

The project folder is the AI handoff. `storyboard.json` records the story, ordered Sets (storyboard beats), object IDs, representation IDs, positions, references, notes and relationships to adjacent Sets. Project-owned reference images live at `assets/storyboard/references/<reference-id>.png`. `getSetContext` returns the matching references, their relative `file` paths and any legacy request records for that Set, alongside the rendered sketch and explicit preceding/following Set IDs. An authorized coding agent with access to the project can read the JSON and open those files directly; FloxBow does not run or orchestrate the agent.

Select a layer linked to a story object and use **AI Visual Context** to save a generate/revise request. The request stores `requestId`, `sceneId`, `setId`, `objectId`, `representationId`, optional source reference ID, instruction, output reference ID and an exact output path. This is a queued handoff contract; this workspace does not run a model. An authorized local AI agent should write the PNG to `outputFile`, add a reference with the reserved `outputReferenceId`, `origin: "ai"`, `requestId`, `prompt`, `basedOnReferenceIds` and the same `file`, add a new representation to the target Set using the same `objectId` and the new reference ID, and mark the request `completed`. It must preserve the earlier representations and Sets. Saving validates that the PNG exists and that provenance and object links match. Use **Refresh storyboard and audio context** to load the AI's saved result into the reference panel, then place or reposition it in a Set.

**Motion Library** is a separate application workspace, saved in the user's local app storage and shared across projects. It starts with Walk, Run, Jump, Dance and Idle templates. Users can make multiple variations of any type, describe reusable pose ideas, direction, view and loop defaults, and copy an AI prompt for use with any project. Selecting a character in Storyboard and choosing **Add motion** attaches a snapshot of a library set to that object and Set. The project's `actionPlans` entries preserve the library ID/name, pose ideas, timing and per-character note so a local AI agent can read them from the project folder. Pose images and generated frames remain project-specific references; no global image paths are embedded in the reusable library. This is planning metadata; it does not create clips, keyframes or a walk-cycle engine.

The reference ID identifies one exact image version; its `sha256`, pixel width/height and alpha-channel presence are recorded when saved. `visualAssetId` groups versions of the same logical visual, `version` orders them, `role` identifies intended use, and `basedOnReferenceIds` records ancestry. Reference files are immutable after that first save: changing pixels in place is rejected, and a visual revision must use a new reference ID while retaining the earlier file and its links. AI-generated assets may be added directly by an authorized coding agent without a queued request record.

Structured annotations use stable IDs and target one exact reference, scene, Set, image representation and optional story object. The representation identifies the image coordinate surface; the separate `objectId` identifies the element the direction is about. These IDs may differ, for example when marking a cup on a character's combined reference before the cup has a separate prepared image. The UI displays and lets the user choose that element, and the saved JSON carries both links. Points use `image-percent` coordinates from the image's top-left, so they continue to identify the same area when the composition is zoomed or the image is repositioned. Supported geometry is point, line, polyline, polygon and rectangle; each annotation carries a short label, color and animation instruction. The Animator resolver and Director brief include both target IDs and the coordinates explicitly.

The request record is a legacy handoff helper, not an AI service or agent queue. Codex, Claude Code or another authorized coding agent can work directly in the project: read `storyboard.json`, create a new image file under the project assets folder, add a reference with a new ID, and associate it with the intended object/shot. FloxBow does not launch or orchestrate that agent.

### Approval and code history

The canonical `storyboard.json` stores review records for each scene and for the whole film. A scene approval is tied to that scene's content and its referenced image hashes; a film approval is tied to the complete plan. Editing an approved scene marks that scene as needing review and makes whole-film approval stale. Unchanged scenes remain approved. If an image file changes after approval, the host reports its reference ID as changed and prevents saving it over the approved version; add a new reference ID for a visual revision. Existing v1 files load with empty review records and gain image metadata when saved.

Approval confirms visual direction only. It never generates, replaces or deletes Animator code. After a plan revision, the external coding agent reads the new plan and compares it with project code history; FloxBow does not guess which implementation is safe to discard. The Timeline remains the source of truth for playback and animation clips; `storyboard.json` remains the Director's visual plan and review record. Stable scene, shot, element and annotation IDs connect the two without duplicating Timeline clip data.

### Director ↔ Animator implementation review

Existing Director-authored text is exposed as addressable directives using the existing stable IDs and field names. For example, `shot:shot-03:description` refers to the description field on that shot; it is a computed address, not another copy of the instruction. The collaboration journal in `storyboard.json` stores interpretation, questions, proposed alternatives, decisions, implementation notes, Animator self-review and reviewer feedback. Each entry links back to its directive and may name the Timeline clip IDs, registered component IDs and project-relative source files involved.

`getStoryboardDirectiveCoverage` reports whether each written direction is awaiting an Animator response, has an open question, a proposal, an implementation, a self-check, a requested revision or approval. This is traceability, not proof that code behaves correctly or looks right. Timeline/component and asset checks can establish technical links; the shot still needs preview and human visual review. Old version-1 Storyboards load with an empty collaboration journal.

Each journal entry is append-only and contains `author`, `kind`, optional `outcome`, `replyToId`, `message`, and implementation references. A question remains open until a Director/reviewer reply targets its message. An Animator implementation entry should name the relevant Timeline clip/component IDs and project-relative source files; a later `self-review` entry records which frames or playback range were checked. New implementation entries must also declare one or more structured `outputs`. Each output has a stable ID, kind (`image`, `effect`, `motion`, `text`, or `transition`), name, description, optional registered image reference, target element ID, and optional shot-relative frame range. An image output must reference a project image; an effect must name the element it affects. Output targets can be a Storyboard layer, the shot, or another declared output, so an effect can be nested under the image it animates. The Storyboard Element tree displays this hierarchy, source thumbnail, timing, Timeline clips, registered components, and source file. Animation code must remain deterministic from frame and props, following the project composition rules.

Use `animatorOutputId(sceneId, shotId, stableKey)` from `@motion/project-loader/storyboard` to derive repeatable IDs from meaningful keys. For a PNG created in a project, register it as a Storyboard reference first:

```powershell
npx tsx scripts/storyboard-register-asset.ts nu-raman-aici assets/effects/leaf-shadow.png animator-leaf-shadow-v1 "Leaf shadow"
```

Then add its image output and any targeted effect outputs to an Animator implementation entry in `storyboard.json`, or append the entry through `scripts/storyboard-collaboration.ts`. The append command rejects new implementation reports without outputs. Existing collaboration entries without outputs remain readable for compatibility. This contract does not constrain how the Animator writes or renders code; it makes each added visual contribution addressable in the existing project record. The declared timing and relationships are currently review metadata—custom code effects do not become Timeline-editable clips or Inspector controls automatically.

The existing project `Nu rămân aici` demonstrates the contract: all 29 shots now report their camera/effect/text outputs, and the separate foliage-shadow PNG in shot 27 is registered as an image child of the background layer with a drift/fade effect nested under that image. This records the current implementation documented in the animation report; it was not moved into a sandbox or rewritten as a new effect component.

This increment does not add an effects API or let the Director write source code. Animator-authored effects remain in project code; the declaration is a visibility and traceability contract, not a runtime container. The development shell's Storyboard PUT remains shell-origin-only. An authorized local Animator can append a validated response with the bounded CLI below; it uses the existing project write lock and revision check, so it cannot replace the plan or silently overwrite a concurrent edit. The Storyboard UI shows the new entry after reopening the saved version.

### Next implementation increments

1. Connect Director shot/layer changes to scoped, revision-checked Timeline updates. The Timeline stays canonical for playback; the Storyboard draft must never replace unrelated Animator clips. Revisions that touch authored clips should show a diff and preserve their source code.
2. Check implementation evidence against the actual saved Timeline and project: referenced clip IDs must exist, component IDs must be registered, and source files must remain inside the project. Show missing/stale links separately from human visual review.
3. Extend reusable effects only from concrete needs. The existing capability registry describes many composition-level React components, not independently editable Timeline effects. A first effect API should use trusted, statically registered, deterministic frame-based components with serializable parameters and explicit editable fields. Start with bounded transform effects such as shake and growth; add particle/environmental categories only when a concrete shot requires them. Unsupported requests stay visible as unresolved directions for an Animator to implement in project code.

Each step needs focused schema/API tests, old-project compatibility tests, and preview checks at start, transition and end frames. No generic plugin loader or arbitrary code execution is part of this plan.

## Director exchange

**Copy Full Story** saves first and copies deterministic readable sections covering build/story/cast/sequence/look/motion/timing/source references. IDs accompany human-readable names. Original instructions are preserved verbatim in their fields. An optional portable ZIP export is available for external review:

- `README.md`, `director-brief.md`, `storyboard.json`, `manifest.json`, `audio-context.json` (saved Timeline evidence).
- `sketches/<set-id>.png` for every Set, at actual project dimensions.
- `references/<media-id>.png`, original bytes once per registered asset.

The manifest maps Set/reference IDs to relative files and explicitly marks missing references. File names derive only from validated IDs. No Media Registry source paths or unrelated project files enter the package. Audio binaries are not included; anchors retain known timestamps. Share the ZIP with an external multimodal Director and request proposals keyed by Scene/Set IDs.

Paste a returned plan into **Import Director Brief**, import a new version, then explicitly approve it if appropriate. Source fingerprinting includes scene content, composition and reference metadata. Source changes mark older plans **STALE**; approval is a separate state and does not erase that warning. Imported suggestions never replace original notes. Fingerprints are content-change indicators, not cryptographic signatures. External edits to reference file bytes require human review; the fingerprint covers metadata, not binary content.

## Host and agent interface

`scripts/storyboard-store.ts` exposes `readStoryboard`, `saveStoryboard`, `storyboardTiming` and `resolveStoryboardContext`. Persistence uses a fixed project-local filename, validated project paths, strict schema, per-project write lock, SHA-256 disk revision, exclusive temporary creation and atomic replacement. Existing storyboard symlinks are rejected. Request/document limit is 8 MB. GET/PUT `/api/storyboard/<projectId>` reads/saves; PUT requires the exact shell Origin and JSON content type and is disabled in built mode. GET `/api/storyboard/<projectId>/timing` reads saved Timeline metadata, including only the linked Director-owned clips needed for explicit placement/timing sync. GET `/api/storyboard/<projectId>/media/<assetId>` streams only registered media through the existing resolver. These are local development boundaries, not remote authentication.

An authorized local Animator can run:

```sh
npx tsx scripts/storyboard-context.ts <projectId> listStoryboardScenes
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardScene <sceneId>
npx tsx scripts/storyboard-context.ts <projectId> listSceneSets <sceneId>
npx tsx scripts/storyboard-context.ts <projectId> getSetContext <sceneId> <setId>
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardObject <objectId>
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardReference <referenceId>
npx tsx scripts/storyboard-context.ts <projectId> getDirectorBrief <sceneId>
npx tsx scripts/storyboard-context.ts <projectId> getImplementationStatus [sceneId] [setId]
```

To append a reply, save one JSON entry to a temporary response file and pipe it to the project-scoped writer. It accepts only an entry matching an existing directive target; source files must be relative to the project.

```powershell
Get-Content .\animator-response.json -Raw | npx tsx scripts/storyboard-collaboration.ts my-project
```

Example response entry:

```json
{
  "id": "animator-reply-14",
  "sceneId": "scene-01",
  "setId": "shot-03",
  "targetKind": "shot",
  "targetId": "shot-03",
  "field": "description",
  "author": "animator",
  "kind": "implementation",
  "outcome": "implemented",
  "replyToId": null,
  "message": "Implemented the bounded lantern shake and checked its start and end frames.",
  "timelineClipIds": ["lantern-shake-03"],
  "componentIds": ["lantern-shake"],
  "sourceFiles": ["src/scenes/scene-01/shot-03.tsx"],
  "createdAt": "2026-10-28T10:00:00.000Z"
}
```

The resolver validates project containment and manifest identity. Responses include version/revision, saved and current composition dimensions/aspect ratio, and the requested data. Set context includes scene direction/objects, complete representations and geometry, previous/following Sets, project-relative reference paths, pending/completed AI image requests, original instructions, timing anchors, current saved subtitle/audio context and imported plans with approval/staleness. It also includes directive coverage and the collaboration entries linked to the requested shot. `getImplementationStatus` returns this coverage across a scene or the film. `sketchSource` identifies the structured geometry in `storyboard.json`; `renderedSketch` contains an escaped SVG rendition with reference URLs resolved by stable reference ID. The SVG renderer is exported from `@motion/project-loader/storyboard-svg`. Media IDs and validated project-relative reference paths are used instead of exposing arbitrary host paths or shell access.

Desktop Copy Full Story uses the additive `flox:storyboard:copy-context` preload method `copyStoryboardContext`. The host restricts it to the validated primary shell sender and one UTF-8 string of at most 8 MB. Existing visual-inspection clipboard limits and general browser permission denial remain unchanged. Browser-only operation uses the browser's normal clipboard permission model.

## Verification and limits

Run `npx tsx --test tests/storyboard.test.ts tests/storyboard-collaboration.test.ts` for focused contracts and `npx tsx scripts/storyboard-acceptance.ts` for a synthetic Electron walkthrough. The latter creates a unique temporary portrait project, five Sets, table/mug, a generated reference and demo audio/words; checks save/reopen, exact coordinates, zoom/pan invariance, identity reuse, stale brief, clipboard, ZIP and resolver; writes screenshots/package under `out/storyboard-acceptance/`; then deletes only its fixture. Audio verification checks transport state, not physical speakers.

Version one uses individual sketch elements, not advanced bezier tools. Reference import and AI image output are PNG. Motion guidance is text, not an animation engine. Built snapshots are read-only for authoring. The request queue and project-local file contract are implemented; model execution remains the responsibility of an authorized local AI agent. Imported Director plans are scene-associated free text; Set IDs may be included in that text but are not automatically parsed into executable instructions.
