# Storyboard Designer

Open a project in the live development workspace and choose **Storyboard** in the workspace navigation. This is a separate directing workspace; it never writes the rendered Timeline, composition source, Scene Moments or animation props.

## Authoring

1. **Create Scene**, name it and describe its story, style, creative direction and duration estimate. Optionally link a saved Timeline scene. A storyboard scene has its own identity; linking does not copy or change Timeline timing.
2. **Create Set**, draw using pencil, rectangle, ellipse, line or text. Select moves an element; Resize changes its bounds. The right panel has exact spatial fields and rotation. Eraser removes a complete stroke/shape. Undo/Redo cover storyboard edits. Zoom/Fit and Pan only affect the view.
3. **Create object from sketch**, then edit **Object name**. The object is the identity, the drawing is one representation. Use the identity selector to assign another drawing to that object. **Reuse drawing** creates an independent copy with the same identity. **Same object, new sketch** inserts a replaceable rough rectangle with the existing identity; draw a replacement and explicitly link it using Object identity. Hide/remove affects only the selected Set.
4. **Duplicate selected Set** or **Continue last Set** preserves object IDs and creates new Set/representation IDs. Rename each of five Sets, adjust start/duration, and move them Earlier/Later. Missing timing is allowed; overlaps and estimate overruns are warnings. Invalid negative/zero durations prevent saving.
5. **Import PNG reference** uses the existing trusted media picker. Choose the imported item in **Use registered image**. Expand its library card, edit its name/category/notes and link it to a Set or selected object. **Place reference on canvas** creates a moveable, scalable, rotatable placement. Its opacity and lock are authoring aids, not final animation requirements. **Trace beneath sketch** is a separate locked background aid with editor opacity; it is omitted from sketch exports. Original reference bytes are exported unchanged and deduplicated by Media Registry ID.
6. The bottom context area reads saved Timeline soundtrack/separated-video audio and `getSubtitleCues`. **Replay Set interval** seeks to Set start and pauses at its end. Native controls pause/seek; displayed time maps media time to project seconds. Refresh after saving Timeline changes. Select a phrase or existing words to link them. **Saved timing anchors** stores source revision, status and timestamps separately from editable intended action time. Missing/mismatched word timings never gain invented precision. Synthetic timing retains `demo` status.
7. **Save storyboard** writes project-local `storyboard.json`. Reload discards a draft only after confirmation. A local recovery draft survives reopening; conflicting disk revisions block save. **Export draft** preserves your draft before resolving a conflict.

## Spatial contract (version 1)

The browser-safe schema/types/helpers are exported by `@motion/project-loader/storyboard`. The optional root `storyboard.json` contains `version`, `projectId`, actual `composition: {width,height,fps}`, ordered scenes, references and versioned imported briefs. Existing projects do not need a new manifest field. No migration of Timeline v1 or Media Registry v1 is introduced.

Every representation has `id` (representation identity), `setId`, nullable canonical `objectId`, `coordinateSpace: "composition-percent"`, `anchor: "top-left"`, `x`, `y`, `width`, `height`, `rotation`, zero-based `zOrder`, `visible`, `opacity`, `locked`, `spatialNote`, reference association, pose/instructions/motion notes, and its sketch geometry. Coordinates refer to the unrotated bounding box's top-left corner. Rotation is degrees around that box's center. The array is back-to-front; `zOrder` must equal its array index. Freehand points are local fractions of representation bounds. Copying a Set deep-copies geometry while preserving object identity.

For a 1080×1920 portrait, `x:78,y:82,width:12,height:15` means pixel bounds 842.4,1574.4,129.6,288 before rotation. Changing view zoom or scroll does not edit these values. Canvas display and PNG export share the same painter. Actual project dimensions, including custom sizes, determine aspect ratio and raster size. Composition percentages are compatible with Canvas Core's unit convention, but the explicit top-left anchor differs from components that use center anchors; consumers must apply the documented conversion rather than blindly copy props.

`compositionNote` records staging; `cameraNote` records optional framing/movement intent. Position changes between Sets are not automatically camera moves. There is no camera engine or animation interpolation.

## Director exchange

**Copy Full Story** saves first and copies deterministic readable sections covering build/story/cast/sequence/look/motion/timing/source references. IDs accompany human-readable names. Original instructions are preserved verbatim in their fields. **Export Full Context** saves first and downloads a portable ZIP:

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

The resolver validates project containment and manifest identity. Responses include version/revision, saved and current composition dimensions/aspect ratio, and the requested data. Set context includes scene direction/objects, complete representations and geometry, previous/following Sets, references, original instructions, timing anchors, current saved subtitle/audio context and all imported plans with approval/staleness. `sketchSource` identifies the structured geometry in `storyboard.json`; `renderedSketch` contains an escaped SVG rendition with registered media resource URLs, not binary data. The SVG renderer is exported from `@motion/project-loader/storyboard-svg`. PNGs are generated on package export rather than silently writing derived media into user projects. Media IDs are authorized resource references, never host paths. No arbitrary file or shell endpoint is exposed.

Desktop Copy Full Story uses the additive `flox:storyboard:copy-context` preload method `copyStoryboardContext`. The host restricts it to the validated primary shell sender and one UTF-8 string of at most 8 MB. Existing visual-inspection clipboard limits and general browser permission denial remain unchanged. Browser-only operation uses the browser's normal clipboard permission model.

## Verification and limits

Run `npx tsx --test tests/storyboard.test.ts` for focused contracts and `npx tsx scripts/storyboard-acceptance.ts` for a synthetic Electron walkthrough. The latter creates a unique temporary portrait project, five Sets, table/mug, a generated reference and demo audio/words; checks save/reopen, exact coordinates, zoom/pan invariance, identity reuse, stale brief, clipboard, ZIP and resolver; writes screenshots/package under `out/storyboard-acceptance/`; then deletes only its fixture. Audio verification checks transport state, not physical speakers.

Version one uses individual sketch elements, not multi-stroke groups or advanced bezier tools. Reference import is PNG, matching the current registry. Motion guidance is text, not an animation engine. Built snapshots are read-only for authoring. No AI provider, model execution or animation generation is added. Imported Director plans are scene-associated free text; Set IDs may be included in that text but are not automatically parsed into executable instructions.
