# Active Developer Handoff

Updated: 2026-10-23. This file records verified local progress and the next safe development increment.

## Checkout and scope

- Local checkout is on `dev` at PR #38 merge `c272e9893d3f136d5c9cc4dea40bb3984439e032`.
- The Media Library sidebar and image-placement increment is committed locally on `dev` and has not been pushed. The working tree is clean.
- PR #38's shared Text/Canvas/Image work is integrated. Text Core defines text content and behavior; Canvas Core handles geometry for visual elements that declare its contract.
- No personal video projects or source media have been edited. Automated media tests use generated assets and temporary projects.

## Current local increment: Media Library in the left sidebar

- The separate dockable Media view has been removed. Registered project media now appears in the left project browser for the selected project.
- The library offers native PNG/audio registration, image thumbnails, audio icons, availability/missing status, asset selection, removal, and the existing soundtrack action.
- PNG registration remains separate from placement. An Image clip has a separate Timeline clip ID and references the registered stable asset ID. The Add action places at the playhead; drag to Canvas places at the drop position; drag to a visual Timeline track sets its start time. Reusing an asset does not copy the file.
- The renderer receives only validated project/asset references. The thumbnail endpoint resolves registered IDs in the host and streams PNG bytes; host file paths remain private.
- Audio drag placement is not supported. The current soundtrack is still one fixed full-duration clip at frame zero; moving/trimming and mixing audio remain unimplemented. Video media registration and ordinary video clips remain unimplemented.
- Electron smoke passed after correcting test order: Canvas drag events arrived and created a clip, while the test had inspected disk JSON before pressing Save. The test now saves before asserting. The passing smoke confirms both Canvas and Timeline drops create separate clip IDs that reference the same registered image asset.

## Architecture and compatibility boundaries

- Timeline v1 project JSON remains canonical and EditorSession remains the only document/save owner.
- Media registration is host-mediated and separate from Timeline placement. Asset IDs identify source files; clip IDs identify each placement.
- The current Audio track supports the existing soundtrack workflow through the shared Remotion transport and renderer. It is not a general multi-clip audio editor.
- Do not change `main`, personal projects/media, Kinetic, project schemas, or persistence contracts as part of this sidebar increment.
- The requested complete sample project with multiple independent PNG layers, Text, ordinary Video, Audio, save/reload, Undo/Redo and MP4 parity is not yet supported because ordinary Video clips are absent. Do not report that acceptance scenario complete.

## Verification status

- Base `dev` was clean immediately after PR #38 merge.
- `npm test`: 74/74 passed, including media drag-data validation and Canvas contract tests.
- `npm run typecheck`, `npm run validate` and `npm run build` passed. Build reported the existing dependency annotation and large-chunk warnings.
- `npm run test:smoke` passed in development mode, including media thumbnails and Canvas/Timeline drops. Electron needs normal Windows process-launch permissions in this environment.
- `npm run test:built` passed for the built starter, capability metadata and preview.
- `git diff --check` passed. Prettier passes for changed documentation; the repository-wide check still reports existing baseline formatting failures in `apps/desktop/src/main.tsx` and `scripts/smoke.ts`. Their unrelated lines were kept as-is.
- Smoke cleanup left `projects/` with only `.gitkeep`; no user project or media was changed.

## Next logical increment

The left Media Library and PNG placement slice is implemented and verified. Next inspect the current media schemas, Remotion preview/render adapters and editable clip contracts for ordinary video and flexible audio. Report which paths already exist and identify the smallest next implementation increment. Keep soundtrack movement/trimming separate until preview and MP4 timing can be demonstrated together. Update this handoff with verified behavior and concrete gaps after each substantial increment.
