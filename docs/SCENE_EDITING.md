# Scene editing

Scenes are optional structural groups on the existing Timeline v1 document. They do not add tracks or alter visual track stacking. Existing projects without `scenes` and `sceneId` retain their current data and rendering behavior.

## Project data

`edit-timeline.json` may include an ordered `scenes` array. Frames are the canonical time unit and use the Timeline FPS. A clip with a `sceneId` belongs to that scene; its `from` remains a global project frame. The clip's scene-local start is `clip.from - scene.from`. Clips must fit entirely inside their scene. Scene intervals cannot overlap, and clips without `sceneId` remain project-global.

```json
{
  "version": 1,
  "fps": 30,
  "durationInFrames": 1050,
  "trackOrder": "top-down",
  "tracks": [{ "id": "visuals", "name": "Visuals", "kind": "visual" }],
  "scenes": [
    {
      "id": "scene-opening",
      "name": "Opening",
      "from": 0,
      "durationInFrames": 450
    },
    {
      "id": "scene-middle",
      "name": "Middle",
      "from": 450,
      "durationInFrames": 300
    },
    {
      "id": "scene-ending",
      "name": "Ending",
      "from": 750,
      "durationInFrames": 300
    }
  ],
  "clips": [
    {
      "id": "forest-background",
      "sceneId": "scene-opening",
      "trackId": "visuals",
      "componentId": "image",
      "label": "Forest background",
      "from": 0,
      "durationInFrames": 450,
      "content": { "assetId": "forest" },
      "props": {}
    }
  ]
}
```

## Editor workflow

The Timeline keeps one Scenes row above ordinary tracks. Select clips and choose `+ Scene` to group those clips into a scene whose bounds cover their current ranges. With no clips selected, `+ Scene` appends a five-second empty scene. Select a scene to highlight its member clips. Rename a scene or use its one-second shorten/extend controls. Extending moves every later scene and its member clips by the same frame delta; their durations and scene-local clip timing stay unchanged. Project duration extends when content or a scene moves beyond its current end and does not shrink automatically.

The `Ripple On/Off` Timeline control applies to clip resize gestures. In Normal mode, only the edited clip changes. In Ripple mode, resizing shifts later clips in the same scene by the change in the edited clip's end frame; their durations remain unchanged. If moved content exceeds the scene end, that scene expands and later scenes move by the expansion amount. Shortening shifts downstream clips earlier while preserving the authored scene duration. The switch is a local editor preference and does not change project JSON.

Shortening a scene is rejected if a member clip would cross the new boundary. Move or trim that clip first. Ripple is also rejected when a downstream track is locked, a clip crosses the ripple boundary, a same-track collision would occur, or the project duration limit would be exceeded. Concurrent overlapping material in other scenes is never included. Scene intervals cannot overlap, and the current editor does not automatically assign clips that were not selected when the scene was created. A selected clip cannot be assigned to a second scene without first changing its membership through project JSON or a future organizer workflow.

Scene membership and timing are part of the canonical `edit-timeline.json`, so normal EditorSession save, reload, undo and redo apply. Preview and MP4 use the same global frame ranges; validation prevents scene-owned visual or audio clips from spilling past their scene bounds. Existing unassigned clips remain global.

## Current limits

The first implementation provides scene names, ordered ranges, explicit clip membership, local-time derivation, safe downstream resizing and clip-level ripple editing. Scene contents still appear on their existing Timeline tracks. A dedicated scene-focused view, drag resizing, cross-scene clip transfer controls, reusable character groups, pose events and Scene Moments are not implemented yet.
