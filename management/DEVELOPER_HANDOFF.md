# Active Developer Handoff

Updated: 2026-10-23. This file records verified local progress and the next safe development increment.

## Checkout and scope

- The local checkout is on `dev`. PR #38 is merged. Local commits are not pushed to GitHub.
- `499cc93` contains the left Media Library and PNG placement increment. The current uncommitted increment adds ordinary MP4 video clips and updates this handoff.
- No personal projects, source media, `main`, or the independently developed Kinetic module have been changed.
- Smoke tests create synthetic projects and media, then clean them up. At the last check, `projects/` contained only `.gitkeep`.

## Implemented and verified

- The project Media Library lives in the left project browser. It lists registered project media, provides image thumbnails and type/status indicators, supports native import, selection and removal, and keeps registered asset IDs separate from each placement's Timeline clip ID.
- PNG assets can be added at the playhead, dragged onto Canvas to set their position, or dropped onto the visual Timeline track to set their start time. Reusing an asset creates another clip without copying the source.
- MP4 can now be imported through the trusted native picker, registered with a stable video asset ID, previewed and rendered from the registered media route. Video clips receive independent clip IDs and support Timeline placement, trim, seek, volume, fit, and shared Canvas transforms through canonical Timeline properties. A left trim advances the video source in-point; trims beyond the probed source duration are rejected.
- The generated project scaffold passes registered video sources to the same `TimelineComposition` used by preview and renderer. The host resolves source paths; renderer-facing data contains project-local asset references and safe media URLs, not host filesystem paths.
- EditorSession remains the only document and save owner, preview remains in the primary editor, and the shared Canvas contract remains the geometry interface for visual elements. Text Core, Image and Video keep their own content/render behavior while Canvas Core handles declared spatial operations.
- The existing soundtrack path remains one selected, full-duration audio clip fixed at frame zero. Audio placement, trimming, mixing and multiple independent audio clips are not implemented.

## Compatibility and open limitations

- Timeline v1 and existing project JSON remain canonical. Video source registration is in the existing project media registry; placements reference the asset ID and retain an independent clip ID.
- The new video path accepts MP4 files with a valid MP4 container and probes duration/dimensions using the installed FFprobe. Other video containers/codecs and transcoding are not supported.
- Canvas interaction overlays remain editor-only; the composition renderer consumes canonical geometry and media timing for MP4 output.
- The requested acceptance project with a composed scene of many independent PNGs, Text, ordinary Video and Audio has not been assembled end-to-end. Multiple PNG placements and video clips are supported individually; the general independent-audio workflow remains a gap.
- Physical listening and hardware-specific playback checks still require user verification. Automated tests verify decoder/playback state and rendered media, not the user's speakers or headphones.

## Verification for the current local increment

- `npm test`: 79/79 passed.
- `npm run typecheck`, `npm run validate`, and `npm run build`: passed. Build emitted existing dependency annotation and large-chunk warnings.
- `npm run test:smoke`: passed in development mode, including hide/reopen playback, PNG and MP4 import/placement, video preview transform, source-aware trimming, save/reload and MP4 rendering. The render assertions inspect output pixels. The EditorSession resume flag is consumed by the active preview's ready handshake so late frame messages from the previous iframe cannot cancel it.
- `npm run test:editor`: passed, including detached Timeline command/preview synchronization, attach/close recovery, single preview, revision conflict and project-session invalidation.
- `npm run test:built`: passed for the built empty starter, capability metadata, preview and documentation. The full video editing/export scenario was exercised in development mode, not repeated against the built app.
- `git diff --check` and Prettier on all changed implementation, test, and documentation files passed. Do not treat repository-wide formatting warnings in unrelated baseline files as part of this increment.

## Next logical increment

Continue the practical Core Editor milestone by proving a saved/reloaded composition made from multiple independent PNG clips and editable Text, then address general audio clips only after designing and testing matching preview, Timeline and MP4 timing. Preserve separate media asset and clip identities, one canonical Timeline document, shared Canvas interactions, Inspector edits, Undo/Redo and external JSON reload/conflict handling. Do not start AI Animator, Skills, MCP, Kinetic changes, scene redesign or a generic plugin/3D framework as part of that work.
