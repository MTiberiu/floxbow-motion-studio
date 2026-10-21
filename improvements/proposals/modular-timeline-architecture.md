# Proposal: Modular Timeline Architecture

Status: proposed, not approved

## Problem

The version-1 timeline already provides reusable frame-based clips, tracks, project persistence, preview updates, and common move/resize interactions. Its persisted clip shape is intentionally generic, but the shared range helper and several editor actions currently know about subtitles. That makes a second kind of clip harder to add safely: audio/video need source-range rules, while images need no source trim and subtitles must preserve word timing.

The Media Registry is also separate from the timeline. It gives a project stable asset IDs and keeps source paths in the host, but timeline clips cannot yet reference those IDs. Preview and rendering do not resolve registered audio/video assets.

This proposal defines a small, statically registered behavior contract for the four clip kinds. It does not implement timeline media, playback, splitting, or renderer integration.

## Current-state findings

- **Persisted clips are generic, frame-based records.** `clipSchema` stores `id`, `trackId`, `componentId`, `label`, `from`, `durationInFrames`, and JSON `content`/`props`. `editTimelineSchema` checks unique IDs, valid track references, frame ranges, and the version-1 limits. It has no clip kind, source range, or asset reference. See [`timeline.ts`](../../packages/motion-sdk/src/timeline.ts#L3).
- **The shared range helper contains subtitle behavior.** `changeClipRange` handles move and trim, but on any trim it searches `content.words` and shifts word offsets; it also changes any non-demo `content.status` to `unverified`. Those are subtitle concepts applied by a generic SDK function to every clip. See [`timeline.ts`](../../packages/motion-sdk/src/timeline.ts#L18).
- **The composition maps renderer IDs to React components.** `TimelineComposition` uses `componentId` to select an `EditableComponent` and renders each clip in a Remotion `Sequence`. `componentId` is currently a renderer identity, not a behavior contract. See [`editor.tsx`](../../packages/motion-sdk/src/editor.tsx#L4).
- **Subtitle data already has a distinct module boundary.** `subtitleContentSchema` validates text, status, and optional segment-relative word intervals. `correctSubtitleText`, `subtitleClips`, and `exportSubtitles` own subtitle-specific edits and conversions. See [`subtitles.ts`](../../packages/lyrics-sync/src/subtitles.ts#L5).
- **Subtitle assumptions also appear in the shell and host save path.** `TimelineEditor` handles subtitle text corrections, add/import/export, repeat metadata, warnings, and styling by checking `componentId === "subtitles"`. `saveEditor` separately validates subtitle content. The shell's drag, keyboard move, selection, track assignment, duplication, and range controls are otherwise shared. See [`TimelineEditor.tsx`](../../apps/desktop/src/TimelineEditor.tsx#L349), [`TimelineEditor.tsx`](../../apps/desktop/src/TimelineEditor.tsx#L383), [`TimelineEditor.tsx`](../../apps/desktop/src/TimelineEditor.tsx#L516), and [`editor-store.ts`](../../scripts/editor-store.ts#L10).
- **There is no split operation.** Current editing supports moving, edge resizing, duplication, deletion, and track assignment; no core split API or split UI exists. The timeline guide also lists time-stretch and audio editing as deliberate limits. See [`TIMELINE_EDITOR.md`](../../docs/TIMELINE_EDITOR.md#L91).
- **The Media Registry is host-side linked audio metadata.** Version 1 supports audio assets with unique stable slug IDs and external MP3/WAV paths. The resolver returns a host-only path and availability; it does not expose duration metadata or connect an asset to a clip. See [`media.ts`](../../packages/project-loader/src/media.ts#L18) and [`PROJECT_MEDIA.md`](../../docs/PROJECT_MEDIA.md).
- **Preview and render remain composition-driven.** The player bridge sends serializable component fields to the shell and accepts a timeline document. The Remotion renderer bundles the project's declared composition. Neither path resolves `media.json` for timeline playback. See [`host.tsx`](../../packages/player/src/host.tsx#L14), [`render.ts`](../../packages/renderer/src/render.ts#L10), and [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

The tests already cover subtitle movement/trimming, subtitle text correction, import/export, project persistence, and revision conflicts. They do not exercise clip splitting or media-source ranges. See [`timeline.test.ts`](../../tests/timeline.test.ts#L77).

## Responsibility boundaries

| Area                   | Owns                                                                                                                                                                                            | Does not own                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Timeline Core**      | Integer project-frame positions; selection; common move; range clamping; generic duplicate/delete; track assignment/order; undo/redo; serialization, save/reload, and common operation dispatch | Subtitle words, source file paths, playback implementation, or type-specific data transforms |
| **Clip Behavior**      | A small, trusted implementation per semantic behavior family: supported operations, type validation, resize/split/duplicate transformations, and source-range constraints                       | Pointer math, track layout, selection state, filesystem access, or React rendering           |
| **Media Registry**     | Stable project-local asset identity, original external-file references, and missing/invalid resolution on the host                                                                              | Timeline position, per-clip trims, clip-instance IDs, or copied media                        |
| **Preview / Renderer** | Type-specific visual/audio/video playback, frame/audio synchronization, and composition output when implemented                                                                                 | Mutating canonical asset identity or silently changing source files                          |

An **asset** is the registry entry for one original image/audio/video file. A **clip instance** is one use of that asset on a project track with its own timeline range, source range, and presentation properties. Duplicating or splitting a clip creates another instance that points to the same asset ID; it does not copy or edit the underlying file.

## Time and media semantics

- **Timeline position** is `from` and `durationInFrames` in project frames. It controls when a clip is active in the edit.
- **Source position** identifies the interval inside an audio or video asset. Proposed source boundaries use seconds so audio and video share one model; the media behavior validates representable boundaries against probed source metadata. A video implementation may retain an internal source-frame/timebase conversion for frame-accurate cuts.
- **Trim** changes the selected source interval and the visible timeline range together, at the current playback rate. The default rate is `1`.
- **Stretch** changes playback rate while retaining the selected source interval. It is a separate, explicit edit; edge resizing never changes rate automatically.
- **Loop** repeats the selected source interval to fill a longer timeline range. It is a separate, explicit mode; edge resizing never enables looping automatically.
- **Split** divides one clip instance into two adjacent instances. It changes project data only; it never cuts, rewrites, or exports a physical media file.

For audio/video, `sourceOutSeconds - sourceInSeconds` is the selected source duration. At rate `r`, the expected timeline duration is `(sourceOutSeconds - sourceInSeconds) / r`, converted to project frames with a documented rounding rule. The first slice should use `r = 1` and `loop = false`; non-1 rates and looping stay disabled until preview and render can honor them consistently.

## Proposed smallest extensibility contract

Keep `componentId` as the renderer lookup key. Add one optional, serializable `timelineBehavior` identifier to `EditableComponent`/`ComponentInfo`, for example `subtitle`, `static-image`, or `source-media`. Audio and video components can both declare `source-media`. The preview bridge already removes the executable React component and validates serializable component metadata; the new identifier follows that existing boundary.

The desktop shell resolves that identifier through a small, statically imported registry of trusted behavior implementations. No project code or function crosses the preview bridge, and there is no dynamic installation mechanism. A behavior implementation exposes only the hooks needed for common operations:

```ts
type TimelineRange = { from: number; end: number };
type TimelineBehavior = {
  id: string;
  validate(clip: TimelineClip, context: TimelineContext): void;
  resize?(
    clip: TimelineClip,
    range: TimelineRange,
    context: TimelineContext,
  ): TimelineClip;
  split?(
    clip: TimelineClip,
    frame: number,
    context: TimelineContext,
  ): [TimelineClip, TimelineClip];
  duplicate?(
    source: TimelineClip,
    copy: TimelineClip,
    context: TimelineContext,
  ): TimelineClip;
};
```

`Timeline Core` remains the single implementation of pointer-to-frame conversion, range clamping, moving, selection, track assignment, IDs, undo/redo, and persistence. It dispatches only the data transformation after it has computed a valid operation. `resize` also covers extending a clip's visible end; no separate `extend` hook is needed. Optional hooks mean unsupported operations can be disabled rather than silently approximated.

`timelineBehavior` should be metadata, not an executable callback or arbitrary plugin API. The behavior registry is compiled with FloxBow and maps a few reviewed IDs to pure deterministic functions. The `subtitle` implementation owns word/status changes; `source-media` owns source-boundary changes and source-availability checks; `static-image` needs no special source-end rule.

For existing version-1 projects, absence of `timelineBehavior` means the legacy generic visual behavior, with one compatibility mapping from the existing `componentId: "subtitles"` to subtitle behavior. The built-in subtitle module then declares `timelineBehavior: "subtitle"` explicitly. Keep the timeline document version and clip shape unchanged in the first slice: type-specific payload remains inside the existing JSON `content` object and is validated by its behavior. Store media references there under a namespaced value such as `content.media`, not absolute paths. This preserves stable asset IDs and lets the current record schema round-trip additional fields. If a later change needs new top-level persisted fields or changes the document's meaning, add an explicit versioned migration rather than relying on old readers to preserve unknown fields.

### Example clip data

An existing subtitle clip retains the current shape and timing model:

```json
{
  "id": "subtitle-1",
  "trackId": "captions",
  "componentId": "subtitles",
  "label": "Opening",
  "from": 0,
  "durationInFrames": 90,
  "content": {
    "text": "An idea in motion.",
    "status": "unverified",
    "words": [{ "id": "w1", "text": "An", "start": 0.1, "end": 0.3 }]
  },
  "props": { "fontSize": 68, "color": "#ffffff" }
}
```

An image clip can reference an asset without a source interval because a still image has no natural end:

```json
{
  "id": "image-1",
  "trackId": "visuals",
  "componentId": "image",
  "label": "Poster",
  "from": 30,
  "durationInFrames": 300,
  "content": { "media": { "assetId": "poster-main" } },
  "props": { "fit": "cover" }
}
```

Audio and video share a source-range shape. Registry IDs are stable project references; paths stay in the host:

```json
{
  "id": "audio-1",
  "trackId": "audio",
  "componentId": "audio-clip",
  "label": "Music bed",
  "from": 120,
  "durationInFrames": 900,
  "content": {
    "media": {
      "assetId": "music-main",
      "sourceInSeconds": 12.5,
      "sourceOutSeconds": 42.5,
      "playbackRate": 1,
      "loop": false
    }
  },
  "props": { "volume": 0.8 }
}
```

At 30 fps and rate 1, that 30-second source interval fills 900 timeline frames. The clip ID is independent of the `assetId`; two clips may refer to the same asset with different source ranges.

## Intended operation behavior

| Operation     | Subtitle                                                                                                                                                                                         | Image                                                  | Audio                                                                                                                     | Video                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Move**      | Change timeline position; keep segment-relative word offsets unchanged                                                                                                                           | Change position                                        | Change position; source in/out unchanged                                                                                  | Change position; source in/out unchanged                                           |
| **Resize**    | Change visible range; left trim adjusts relative word offsets to preserve absolute spoken positions; do not invent timing                                                                        | Change static display duration; no asset-end limit     | Non-destructive source trim at current rate; clamp to available source duration                                           | Same source trim model; clamp to source duration and valid source-frame boundaries |
| **Split**     | Split text only at an explicit word boundary; partition existing words and rebase each side's offsets; if timing/text cannot be partitioned safely, require explicit user input or disable split | Create two visual instances referencing the same asset | Create adjacent clips referencing the same asset with contiguous source ranges                                            | Same, aligning the cut to a valid video source boundary                            |
| **Duplicate** | New independent subtitle instance; preserve words and set repeat metadata such as `repeatOf`                                                                                                     | New clip instance referencing the same image asset     | New clip instance referencing the same audio asset/range                                                                  | New clip instance referencing the same video asset/range                           |
| **Extend**    | Extend visible duration only; existing word times stay fixed and no new words/times are inferred                                                                                                 | Extend visibility up to the project boundary           | Extend only while source remains available at current rate; then require an explicit trim-source, stretch, or loop choice | Same, subject to source duration and frame boundaries                              |

All four types use the same common core for movement, selection, track placement, saving, and reloading. The table describes target semantics; only subtitle movement/resizing, duplication, and the shared editor interactions exist today. Image/audio/video timeline clips, splitting, source-range editing, and their playback are not implemented.

## Compatibility and migration

- Existing `edit-timeline.json` files remain readable. Do not require `kind` or media fields on old clips. Resolve missing behavior metadata through the legacy fallback described above.
- Existing `componentId` values continue to choose the preview renderer. `timelineBehavior` chooses trusted edit semantics; this avoids changing the meaning of existing IDs or requiring multiple renderers that share one behavior to share a component ID.
- Keep old subtitle content, word offsets, `repeatOf`, and export formats intact. Moving a subtitle stays a common position edit; only subtitle resize/split/duplicate hooks transform subtitle content.
- Keep `media.json` as the canonical source-asset registry. A clip stores a project-local `assetId`, never a copied path. Missing assets keep their clip data and display a missing-media state.
- Additive component metadata is safe for newer shells and can be ignored by older shells, but old save paths may not validate new behavior payloads. Before enabling new clip data in a release, confirm round-trip behavior on the supported editor version; reject unsupported behavior IDs clearly rather than silently stripping data.
- If future timeline fields move outside `content`, version the timeline schema and provide tested v1-to-v2 migration fixtures. The SDK currently accepts only timeline version 1 and has no general migration registry.

## Risks and tradeoffs

- **Source timing precision:** seconds are shared by audio and video but video cuts must respect source frame boundaries. Probe duration and timebase in the host and define frame rounding before enabling source trims.
- **Unsupported or missing media:** the current registry only stores audio paths and does not expose duration. Extending the resolver to image/video or probing duration is a separate contract change; never pass host paths through the preview bridge.
- **Preview/render parity:** the current composition is frame-based and the renderer bundles a project composition. Audio/video sync needs one shared runtime contract before clips can be considered playable or renderable.
- **Subtitle safety:** a split without a known word/text boundary could misstate timing. Keep the operation unavailable or require an explicit split mapping when semantics are ambiguous.
- **Extensibility cost:** a registry adds indirection and host-side built-in wiring. Limit it to behavior families demonstrated by the four clip types; do not build generic lifecycle hooks, capability discovery, dynamic code loading, or a marketplace.
- **Existing generic content:** namespaced media values live in a JSON record, so type guarantees must come from the registered behavior validator until a concrete need justifies a top-level versioned schema.

## Alternatives

1. **Keep current behavior:** lowest risk now, but each additional clip type will keep adding conditionals to `TimelineEditor` and generic range helpers.
2. **Use `componentId` as both renderer and behavior ID:** requires no new metadata, but couples visual implementation identity to edit semantics and cannot cleanly express the shared audio/video behavior.
3. **Add a top-level `kind` to every clip:** clear and easy to query, but duplicates information near `componentId`, touches persisted timeline data, and requires a migration/old-reader policy. Defer until a demonstrated use cannot be served by component behavior metadata.
4. **Dynamic plugins:** unnecessary for this source-extensible application and crosses current trust boundaries. Do not pursue.

## Recommended implementation sequence

1. **Extract subtitle range policy (smallest first slice).** Add the optional serializable behavior ID to component metadata and a static behavior registry. Move word-offset/status changes out of `changeClipRange` into the subtitle resize behavior. Keep generic move/range clamping and serialized timeline files unchanged.
2. **Contract tests and shell dispatch.** Pass behavior metadata over the existing `motion-editor-v1` bridge, resolve it in one editor adapter, and add unit tests for generic and subtitle operations. Keep add/import/export tools in the subtitle integration.
3. **Image clip reference.** Extend the project asset registry/resolver for still images and add one built-in image renderer; reuse the common core range and duplicate behavior. Decide supported formats and preview safety as a separate media contract.
4. **Shared audio/video source-media behavior.** Define registry metadata for audio/video duration and video timebase, validate `content.media.assetId` against the project registry, implement non-destructive trim/split/duplicate, and keep playback disabled until the preview and renderer adapters agree.
5. **Playback and render integration.** Add synchronized preview and renderer support behind explicit capability checks, then enable audio/video playback. Treat waveform, stretch, loop, ripple edits, and transitions as later independent work.

Each step should be a separate reviewable PR. Do not implement steps 3–5 as part of this proposal or activate media timeline clips before source resolution and preview/render behavior are specified.

## Minimal acceptance test for the first implementation slice

Add a focused unit test that builds (a) a subtitle clip with timed words and status `reviewed`, and (b) a generic visual clip whose arbitrary content happens to contain `words` and `status` keys. After moving both clips, neither content object changes. After trimming the subtitle's left edge, its word offsets shift by the exact frame delta in seconds, its non-demo status becomes `unverified`, and the generic clip's content remains byte-for-byte equivalent. Parse/save/reload the timeline and assert the existing v1 clip shape and `componentId` values remain unchanged. This test demonstrates that core movement stays common while subtitle-only transformation is delegated safely.

## License considerations

No new dependency, model, copied media, or third-party source is proposed. Existing dependency and media licensing terms continue to apply when later playback or format support is implemented. See [`DEPENDENCIES.md`](../../docs/DEPENDENCIES.md) and the project media guidance.

## Evidence

Audited against `dev` at `3bae8f233e96f8372e964e860a0bf86bac20a6f1` after PR #9 was merged. Primary implementation and test references are linked in Current-state findings. No production files were changed for TASK 009.

## Acceptance

Status: awaiting explicit review and approval before any implementation. Decisions to review: behavior metadata versus a persisted clip kind; placement and validation of media source fields; source-time precision and duration probing; and the subtitle split rule when word timing is absent or ambiguous.
