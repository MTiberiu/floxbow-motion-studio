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

The browser-safe schema/types/helpers are exported by `@motion/project-loader/storyboard`. The optional root `storyboard.json` contains `version`, `projectId`, actual `composition: {width,height,fps}`, ordered scenes, stable story objects, action plans, references, AI image requests and versioned imported briefs. Existing v1 storyboard files load with an empty action/request list and do not need a new manifest field. No migration of Timeline v1 or Media Registry v1 is introduced.

Every representation has `id` (representation identity), `setId`, nullable canonical `objectId`, `coordinateSpace: "composition-percent"`, `anchor: "top-left"`, `x`, `y`, `width`, `height`, `rotation`, zero-based `zOrder`, `visible`, `opacity`, `locked`, `spatialNote`, reference association, pose/instructions/motion notes, and its sketch geometry. Coordinates refer to the unrotated bounding box's top-left corner. Rotation is degrees around that box's center. The array is back-to-front; `zOrder` must equal its array index. Freehand raster layers retain a full-canvas transparent PNG and their own layer transform; drawing again after zoom, pan or earlier strokes maps through that transform into the same stable pixel grid. Copying a Set deep-copies geometry while preserving object identity.

For a 1080×1920 portrait, `x:78,y:82,width:12,height:15` means pixel bounds 842.4,1574.4,129.6,288 before rotation. Changing view zoom or scroll does not edit these values. Canvas display and PNG export share the same painter. Actual project dimensions, including custom sizes, determine aspect ratio and raster size. Composition percentages are compatible with Canvas Core's unit convention, but the explicit top-left anchor differs from components that use center anchors; consumers must apply the documented conversion rather than blindly copy props.

`compositionNote` records staging; `cameraNote` records optional framing/movement intent. Position changes between Sets are not automatically camera moves. There is no camera engine or animation interpolation.

## Project-local AI image workflow

The project folder is the AI handoff. `storyboard.json` records the story, ordered Sets (steps), object IDs, representation IDs, positions, references, notes and relationships to adjacent Sets. Project-owned reference images live at `assets/storyboard/references/<reference-id>.png`. `getSetContext` returns the matching references, their relative `file` paths and requests for that Set, alongside the rendered sketch and explicit preceding/following Set IDs. An AI with access to the project can read the JSON and open those files directly.

Select a layer linked to a story object and use **AI Visual Context** to save a generate/revise request. The request stores `requestId`, `sceneId`, `setId`, `objectId`, `representationId`, optional source reference ID, instruction, output reference ID and an exact output path. This is a queued handoff contract; this workspace does not run a model. An authorized local AI agent should write the PNG to `outputFile`, add a reference with the reserved `outputReferenceId`, `origin: "ai"`, `requestId`, `prompt`, `basedOnReferenceIds` and the same `file`, add a new representation to the target Set using the same `objectId` and the new reference ID, and mark the request `completed`. It must preserve the earlier representations and Sets. Saving validates that the PNG exists and that provenance and object links match. Use **Refresh storyboard and audio context** to load the AI's saved result into the reference panel, then place or reposition it in a Set.

**Motion Library** is a separate application workspace, saved in the user's local app storage and shared across projects. It starts with Walk, Run, Jump, Dance and Idle templates. Users can make multiple variations of any type, describe reusable pose ideas, direction, view and loop defaults, and copy an AI prompt for use with any project. Selecting a character in Storyboard and choosing **Add motion** attaches a snapshot of a library set to that object and Set. The project's `actionPlans` entries preserve the library ID/name, pose ideas, timing and per-character note so a local AI agent can read them from the project folder. Pose images and generated frames remain project-specific references; no global image paths are embedded in the reusable library. This is planning metadata; it does not create clips, keyframes or a walk-cycle engine.

The reference ID and request ID are the handles for targeted feedback. For example, “revise request `ai-request-…` from reference `ai-image-…`” maps to one exact image and source object. The generated reference card shows its ID and the **Revise** action creates a new request without replacing the earlier image.

## Director exchange

**Copy Full Story** saves first and copies deterministic readable sections covering build/story/cast/sequence/look/motion/timing/source references. IDs accompany human-readable names. Original instructions are preserved verbatim in their fields. An optional portable ZIP export is available for external review:

- `README.md`, `director-brief.md`, `storyboard.json`, `manifest.json`, `audio-context.json` (saved Timeline evidence).
- `sketches/<set-id>.png` for every Set, at actual project dimensions.
- `references/<media-id>.png`, original bytes once per registered asset.

The manifest maps Set/reference IDs to relative files and explicitly marks missing references. File names derive only from validated IDs. No Media Registry source paths or unrelated project files enter the package. Audio binaries are not included; anchors retain known timestamps. Share the ZIP with an external multimodal Director and request proposals keyed by Scene/Set IDs.

Paste a returned plan into **Import Director Brief**, import a new version, then explicitly approve it if appropriate. Source fingerprinting includes scene content, composition and reference metadata. Source changes mark older plans **STALE**; approval is a separate state and does not erase that warning. Imported suggestions never replace original notes. Fingerprints are content-change indicators, not cryptographic signatures. External edits to reference file bytes require human review; the fingerprint covers metadata, not binary content.

## Host and agent interface

`scripts/storyboard-store.ts` exposes `readStoryboard`, `saveStoryboard`, `storyboardTiming` and `resolveStoryboardContext`. Persistence uses a fixed project-local filename, validated project paths, strict schema, per-project write lock, SHA-256 disk revision, exclusive temporary creation and atomic replacement. Existing storyboard symlinks are rejected. Request/document limit is 8 MB. GET/PUT `/api/storyboard/<projectId>` reads/saves; PUT requires the exact shell Origin and JSON content type and is disabled in built mode. GET `/api/storyboard/<projectId>/timing` reads saved Timeline metadata. GET `/api/storyboard/<projectId>/media/<assetId>` streams only registered media through the existing resolver. These are local development boundaries, not remote authentication.

An authorized local Animator can run:

```sh
npx tsx scripts/storyboard-context.ts <projectId> listStoryboardScenes
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardScene <sceneId>
npx tsx scripts/storyboard-context.ts <projectId> listSceneSets <sceneId>
npx tsx scripts/storyboard-context.ts <projectId> getSetContext <sceneId> <setId>
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardObject <objectId>
npx tsx scripts/storyboard-context.ts <projectId> getStoryboardReference <referenceId>
npx tsx scripts/storyboard-context.ts <projectId> getDirectorBrief <sceneId>
```

The resolver validates project containment and manifest identity. Responses include version/revision, saved and current composition dimensions/aspect ratio, and the requested data. Set context includes scene direction/objects, complete representations and geometry, previous/following Sets, project-relative reference paths, pending/completed AI image requests, original instructions, timing anchors, current saved subtitle/audio context and imported plans with approval/staleness. `sketchSource` identifies the structured geometry in `storyboard.json`; `renderedSketch` contains an escaped SVG rendition with reference URLs resolved by stable reference ID. The SVG renderer is exported from `@motion/project-loader/storyboard-svg`. Media IDs and validated project-relative reference paths are used instead of exposing arbitrary host paths or shell access.

Desktop Copy Full Story uses the additive `flox:storyboard:copy-context` preload method `copyStoryboardContext`. The host restricts it to the validated primary shell sender and one UTF-8 string of at most 8 MB. Existing visual-inspection clipboard limits and general browser permission denial remain unchanged. Browser-only operation uses the browser's normal clipboard permission model.

## Verification and limits

Run `npx tsx --test tests/storyboard.test.ts` for focused contracts and `npx tsx scripts/storyboard-acceptance.ts` for a synthetic Electron walkthrough. The latter creates a unique temporary portrait project, five Sets, table/mug, a generated reference and demo audio/words; checks save/reopen, exact coordinates, zoom/pan invariance, identity reuse, stale brief, clipboard, ZIP and resolver; writes screenshots/package under `out/storyboard-acceptance/`; then deletes only its fixture. Audio verification checks transport state, not physical speakers.

Version one uses individual sketch elements, not advanced bezier tools. Reference import and AI image output are PNG. Motion guidance is text, not an animation engine. Built snapshots are read-only for authoring. The request queue and project-local file contract are implemented; model execution remains the responsibility of an authorized local AI agent. Imported Director plans are scene-associated free text; Set IDs may be included in that text but are not automatically parsed into executable instructions.
