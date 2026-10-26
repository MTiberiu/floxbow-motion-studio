# Pose Sheet Studio

Pose Sheet Studio is an application-level workspace for building reusable pose libraries. It lives outside individual video projects so categories, characters, source sheets, and motion combos can be reused later. The current stage focuses on importing one image, making and reviewing its crop regions, and previewing manually ordered pose sequences.

## Current workflow

1. Create or select a category and character.
2. Import a source image once. The image is stored as one Blob under its sheet ID; pose regions refer to that sheet and keep their crop rectangle as metadata.
3. Generate a uniform grid, including a one-cell grid or up to 1,000 cells, or create an individual pose region. Applying a grid immediately creates or refreshes a looping `Starter sequence` from every visible crop, starts its preview, and keeps each crop editable in `Crop review`.
4. Adjust the crop frame, zoom and pan its source image independently, or paint a transparent erase mask. These settings stay with the pose and are applied in preview.
5. The starter sequence begins in crop order. Reorder frames by dragging their blocks on the horizontal timeline, adjust their duration in the Sequence inspector, add repeats or create another named combo. Steps use an explicit `cut` transition by default. Set global speed and looping, then preview on a canvas without rendering video.
6. Save and reopen the library on this device. Applying crops and building an action are working changes until `Save library` is clicked.
7. In a live editable project, click the **+** on a scene in the Timeline. Pose Studio opens with that scene selected and the current playhead time filled in; choose a character action, adjust its exact start time if needed, then import. The app exports only the unique poses used by that action as transparent PNGs, registers them in the project's Media Library, and adds one editable Character clip with ordered pose changes. The action speed is applied at the project FPS. A Timeline import stores one compact cycle and repeats it for the full clip duration, even if the creator preview was set to play once; extend the clip to keep the action cycling longer. Because the clip stores pose times relative to itself, it can move within its scene without shifting the action's timing. If the project has no scenes, use **Import to scene** in Pose Studio to place the action at the main Timeline playhead. Save the project in the Editor to keep the Timeline change.

The sequence model holds stable character, sheet, pose-region, combo, and step IDs. A repeated pose has a distinct step ID that refers to the same pose region. Changing a grid keeps existing pose identities by index, and a pose referenced by a saved combo cannot be removed silently.

## Persistence and boundaries

The browser stores library metadata and each original source-image Blob once in IndexedDB (`floxbow-pose-studio`). An explicit project import stores generated transparent PNGs for the unique poses used by the chosen action under `assets/pose-studio/` and registers them in the project's `media.json`; identical PNG content reuses one media record. `edit-timeline.json` stores a character asset group with the source character, sheet, action and pose IDs, plus one Character clip with frame-timed pose events. This keeps the source library reusable while making the project self-contained for preview and rendering.

Import is explicit and targets the currently selected project and scene. It creates a Timeline draft and never saves it without the user pressing **Save project**. Existing scenes must have enough remaining duration for one complete action pass. Looping imports store only that cycle, so playback and Timeline edits do not duplicate pose events for every repeated cycle. Extending a scene clip past its current end grows that scene and moves later scenes with their clips. A project import retains source-library IDs so later Storyboard/AI integrations can identify the original character, crop and combo.

## Verification

`npm run test:pose-studio` starts the app against an isolated fixture and performs a browser walkthrough: create a character, import one generated source image, build a 200-pose sheet, adjust a crop, create and save ordered/repeated timed combos, preview, reload, and verify there is still exactly one stored source image and the project's Timeline is unchanged. Unit tests cover the 1,000-region limit, stable references, single-pose combos, repeats, speed, and loop evaluation.
