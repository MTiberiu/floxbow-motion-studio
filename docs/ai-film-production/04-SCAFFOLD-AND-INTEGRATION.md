# 04 — Project scaffold, planned scenes and implementation map

## Core requirement

The Director plans and reviews **the entire film first**. Then a **single production-scaffold operation** derives the complete structure for all planned scenes and shots. The Animator can work incrementally after the complete skeleton exists.

**This does not mean scenes are mandatory when creating a free-form FloxBow project.** Initial `Create Project` remains compatible; the optional Director data can be created then or attached later. The scene code generator runs only on explicit invocation after the guided plan is ready.

## Existing primitives to reuse

- `scripts/project-scaffold.ts`: project initializer that already creates `scenes/`, composition, timeline and timing files.
- `docs/SCENE_EDITING.md`: canonical Timeline `scenes[]` support with `id`, `from`, `durationInFrames`; scene-linked clips use `sceneId` but keep global frame positions. This is **already present**, not a module to reinvent.
- `@motion/sdk/editor` / `TimelineComposition`: real executable clips and component registrations. The live `timeline` prop stays authoritative; avoid duplicating `edit-timeline.json` as hardcoded composition timing.
- `docs/STORYBOARD.md`: already has distinct storyboard Scene/Set IDs and references, action plans, read CLI and UI. Map to them rather than assume matching identities.

## Proposed output shape (illustrative, adaptable after code audit)

```text
projects/<id>/
  project.json
  edit-timeline.json              # existing canonical editor, NOT replaced
  Composition.tsx                 # existing entry, extend cautiously
  storyboard.json                  # existing optional storyboard, reuse if practical
  director/                        # ONLY if justified; no duplicate canonical plan
    implementation-map.json        # proposed: IDs, status, source plan revision
  scenes/
    scene-dream/
      Scene.tsx                    # orchestration, if needed
      shots/
        ShotHeart.tsx              # generated safe placeholder
        ShotShadow.tsx
  components/                      # shared project-local behavior when needed
  assets/
  timing/
```

**Naming:** IDs are durable and filename/function name generation is deterministic and collision-safe, but names should remain legible. `sceneId`, `shotId`, `eventId` should be referenced by a typed registry — not inferred from a file path alone or repeated in narrative comments.

**Generation contract:** `previewProductionStructure(projectId)` or `dryRun` outputs the file/scene plan and collision report; `generateProductionStructure(projectId, reviewedRevision)` creates missing files and registries; `syncProductionStructure(projectId, dryRun)` reports newly added/removed/moved shots and changed source-plan revision. These names are concepts, NOT current APIs.

### Code association example (conceptual)

```tsx
// Illustrative only. Developer must map to actual FloxBow SDK exports.
export const productionShot = {
  sceneId: "scene-dream",
  shotId: "shot-heart",
  implementsEventIds: ["event-glow"],
};

export function ShotHeart(/* actual SDK props */) {
  // Placeholder is render-safe, not proof of implementing a director event.
  return null;
}
```

One file per significant shot is a *default*, not a mandate: scenes may contain trivial shots in one file and large reusable components in separate files. **Avoid a file per effect or per subtitle.**

## Two-sided mapping

- The plan owns the desired shot/event IDs, timing preferences and acceptance conditions.
- Generated code owns the implementation export path and declared associations.
- Canonical Timeline owns actual editable scene ranges, clips and timing.
- The execution map owns observed implementation status, time deltas, omissions and review links.
- Do not mark `complete` because a TSX file exists. Distinguish scaffolded, coded, compiled, rendered, visually reviewed and approved.

A scene can map to many Timeline clips, and a shot can map to many layers or components. **Do not demand one shot = one Timeline clip.** Ensure real video transport and renderer run the same content and all promised manual edits are backed by real editable fields. Code-only components may remain code-only if disclosed.

## Temporal safety and scene generation

The user sometimes begins with saved audio and subtitle clips **but no Timeline scenes yet**; these are intentional output from the Director workflow. The Director's planned scene ranges may be used to create the already supported canonical Timeline scene objects *after* whole-film plan review, in a controlled operation, without deleting/re-timing narration, captions or existing user clips. If project clips overlap planned boundaries, **report and propose mapping/choices** rather than blindly move them. Do not mutate Timeline on a plan-only action.

When the plan is revised, **do not regenerate over Animator code**. Compute an impact/diff report and require explicit sync/decision for changed scene IDs, durations or deleted shots. Avoid broken imports during partial updates; atomic or transactional semantics must be designed.

## Additional dependencies and safety

Inspect `docs/ARCHITECTURE.md` runtime isolation, project Vite watching, `scripts/editor-store.ts`, `scripts/project-write-lock.ts` and `scripts/storyboard-store.ts`. No unbounded new localhost write endpoint or arbitrary shell command executor. Protect against path traversal, symlink escapes, collisions, stale plan revisions, partial generator failure and simultaneous editor/agent modifications.

## Questions for developer

Which code generation strategy produces preview-safe placeholders compatible with the actual `Composition.tsx` and `editorComponents` contracts? How do we avoid introducing duplicate timing between a generated React scene wrapper and the canonical Timeline? How should director shots coexist with today's Storyboard Sets and Scene Moments? How much scene binding is possible without automatically creating fake Timeline media clips?
