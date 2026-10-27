# 03 — Director data, local API and validation

**Engineering decision needed:** extend `storyboard.json` and existing Storyboard Designer/Director Brief contracts **or** introduce a closely linked, versioned director plan file. Do **not** create a duplicate planning source by default. Investigate `@motion/project-loader/storyboard`, `scripts/storyboard-store.ts`, `scripts/storyboard-context.ts`, `docs/STORYBOARD.md`, existing UI, timing, and tests.

## Intended behavior, independent of transport

1. `Create Project` creates the existing valid project. An optional guided-production structure may be initialized or attached later, **without blocking free creation**.
2. Agent obtains a snapshot: project metadata, saved transcript/segments, accurate available anchors, existing storyboard references and current plan/progress.
3. Agent adds/updates a production brief, references, narrative units, *all* scenes, shot specifications and timed events incrementally.
4. Store generates/validates the persistent document; agent need not rewrite entire JSON on each operation.
5. Agent can query incomplete tasks, errors, warnings and precise next work; resume in another session. A plan is not marked production-ready merely because filenames exist.
6. Whole-film review happens before `generateProductionStructure`; record revision that the scaffold was generated from.

**Potential local access:** TypeScript API and/or CLI `npx tsx scripts/… <projectId> ...` following `storyboard-context.ts`; optional narrowly scoped loopback API if UI needs it. Developer should choose based on existing host/IPC contracts and security. No chatbot, generic command execution endpoint or opening host filesystem access to the preview iframe.

## Proposed conceptual record (NOT final schema)

```json
{
  "version": 1,
  "projectId": "demo-film",
  "phase": "directing",
  "timingBasis": {
    "fps": 30,
    "source": "saved-subtitle-segments",
    "confidence": "segment-only"
  },
  "references": [
    {"id": "ref-sultan", "kind": "character", "name": "Sultan", "visualIdentity": "consistent costume and silhouette"},
    {"id": "ref-js-var", "kind": "concept", "name": "JavaScript variable", "accuracyRule": "example must evaluate correctly"}
  ],
  "scenes": [
    {
      "id": "scene-dream",
      "name": "The Dream",
      "timing": {"startFrame": 0, "endFrame": 300},
      "shots": [
        {
          "id": "shot-heart",
          "timing": {"startFrame": 0, "endFrame": 180, "mode": "preferred"},
          "narrationAnchors": [{"subtitleClipId": "caption-01"}],
          "intent": "See the dream become alive from the character's heart",
          "composition": "Medium view; character in left third; chest clearly visible",
          "initialState": "Character in low light; no tree visible",
          "finalState": "Tree branches visibly originate at chest; transformed scene remains readable",
          "assets": [
            {"kind": "clean-background", "description": "Room without character"},
            {"kind": "transparent-cutout", "referenceId": "ref-sultan"},
            {"kind": "overlay", "description": "Tree and local chest-light elements"}
          ],
          "events": [
            {"id": "event-glow", "startFrame": 28, "endFrame": 72,
             "mode": "locked", "requiredVisualResult": "Light blooms only around chest"},
            {"id": "event-tree", "startFrame": 63, "endFrame": 158,
             "mode": "preferred", "requiredVisualResult": "Branches grow from chest rather than scaling a static photo"}
          ],
          "cameraIntent": "Maintain legible origin of the transformation",
          "hold": {"startFrame": 158, "endFrame": 180},
          "continuity": "Branches visually prepare the wider tree in next shot",
          "acceptance": ["growth origin visible", "not generic zoom"]
        }
      ]
    }
  ]
}
```

**Example numbers/IDs are fictional.** Full film use requires all actual scenes/shots, source-derived intervals and stable IDs. Decide whether IDs should map to existing Storyboard scenes/Sets and Timeline scenes: a Set is **not necessarily** a shot. Maintain explicit mapping rather than silently equating entities.

## Typed references

One production can use `character`, `location`, `prop`, `object`, `art-style`, `interface`, `concept`, `code-example`, `diagram` or `reference-image`. An image is **optional**; tutorials may contain no characters and stories may combine abstract diagrams with actors. Distinguish `visualIdentity`, accuracy/truth constraints, link to existing media IDs, required asset variants and physical file provenance.

## Temporal contract

Canonical plan frame intervals should be end-exclusive `[startFrame,endFrame)` and project-global. Frame conversion at the saved project FPS must be explicit; support intentional overlaps between events, while validating impossible scene/shot references and out-of-range timings. Keep source clip IDs, evidence precision and source revisions. Separate *director proposal* from *animator execution timing*, storing deltas under separate revision/provenance. Allowed timing semantics `locked | preferred | flexible` express intent but **do not themselves rewrite media clips**.

## Validation levels

**Structural error:** invalid IDs / project mismatch / schema, nonexistent linked reference, negative or reversed intervals, malformed payload, path traversal, stale optimistic revision.  
**Readiness finding:** missing intent, missing visual initial/final state, missing required assets/technique, unanchored timing or absent whole-film review; may block *declaring production-ready in guided workflow* but **never free experimentation**.  
**Creative warning:** one-shot-per-word pattern, crowded events, missing time-to-read, camera substituting for semantic action, repeated UI text, unclear continuity. Creative warnings can be acknowledged; machine data cannot prove cinematic quality.

## Persist safely

No direct unsynchronized whole-file clobbering. Reuse project containment, revision hashes, write locks, atomic writes and existing Storyboard request size limits as applicable; support `read -> patch -> validate -> save -> new revision`. Persist IDs and revision references, offer deterministic export / human-readable view, show diff and conflict instead of silently overwriting.

## Questions for developer

Can `storyboard.json` be extended to carry Director shot/action semantics without breaking its existing Scene/Set/drawing schema? Should stage state be separate metadata with links to storyboard? How do CLI mutations coexist with UI drafts and saved Timeline timing updates? Which parts of the Director's plan should be optional in experiments but required for guided readiness? Can data stay entirely project-local without creating more duplicated documents?
