# Findings

## Verified baseline
- The desktop editor owns Timeline state and selected clip; preview is a sandboxed iframe served on a separate local origin.
- Current project is `ai-video-origin-story`, 1920x1080 at 30 fps, with a Timeline clip `tutorial-promise` beginning at global frame 165. Runtime inspection verified global frame 195 maps to local frame 30 in this clip.
- The aligned opening background and transparent creator poses use matching 1672x941 assets. Those are a good test of registered full-frame layers.
- `tutorial-promise` is a composite component; its children are not independent Timeline clips. A child can be identifiable yet code-owned unless an explicit edit binding exists.
- The preview bridge's origin boundary is respected through an additive `motion-editor-v1` request. It reports registered DOM nodes and geometry without exposing arbitrary iframe evaluation or filesystem access.
- Electron's `webContents.capturePage` can capture a bounded Canvas crop. The capture is exact to what is visible in the Editor, so the user can first collapse Timeline review warnings and use Fit to give the preview enough room.
- The typed Electron API is limited to primary-window Canvas capture and bounded clipboard text. The local server accepts a strict project ID and saves only into the fixed `.floxbow/visual-inspection` folder after validating origin, request shape, PNG signature, dimensions and project FPS/size. PNG, JSON and Markdown files are written using temp-file plus rename.
- Windows/Vite does not permit renaming the watched package directory as a unit (`EPERM`). Per-file atomic replacement succeeds and is used instead.

## Initial design decision
- Keep inspection output read-only, tied to project/timeline/component revision and global/local frame.
- Have the UI save the exact screenshot and structured context in a project-local experimental folder and copy a short prompt with the saved paths. Do not silently modify canonical Timeline data during context capture.
- Map only explicitly registered semantic elements. Geometry is reported in composition coordinates as DOM border boxes; editability is separately reported as Timeline-backed or code-owned. Transparent image pixel extents, exact occlusion and internal WebGL elements remain unknown.
- Any edit operation must be allow-listed and revision-checked; the first test should exercise one actual property and verify the re-rendered frame.

## Remaining questions
- The package includes editor revision and in-memory state version. A later edit command must compare the current revision/state against this captured context and ask for a fresh frame when stale.
- Internal code-owned objects are currently inspection-only. A future safe editing API needs explicit field bindings or typed component commands; it should not let an AI write arbitrary React code or JSON paths.
- A captured screenshot is the visible Canvas crop, with dimensions recorded separately from full composition dimensions. For high-resolution machine vision, consider a deterministic full-resolution frame capture that uses the same renderer as playback/export and verify parity before relying on it.
