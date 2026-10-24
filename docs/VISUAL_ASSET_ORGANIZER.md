# Visual Asset Organizer

Open **Media Library → Organize** to work in a large visual workspace. It reads registered PNG assets from the existing project Media Registry and shows available or missing-file state. Group records reference stable media asset IDs; creating, reordering or renaming a group never copies or deletes an image. The Timeline remains the only placement and timing model.

The Organizer stores group metadata in optional `assetGroups` on the canonical `edit-timeline.json`. Each group has an ID, name, category and ordered members. Each member keeps its own stable ID, `assetId`, human-readable label, role (`alternative` or `pose`) and optional alignment offsets. Offsets are normalized composition percentages and are intended to keep differently cropped states aligned.

```json
{
  "version": 1,
  "fps": 30,
  "durationInFrames": 180,
  "tracks": [{ "id": "visuals", "name": "Visuals" }],
  "clips": [],
  "assetGroups": [
    {
      "id": "character-y",
      "name": "Character Y",
      "category": "characters",
      "members": [
        {
          "id": "character-y-neutral",
          "assetId": "media-character-y-neutral",
          "label": "Neutral",
          "role": "pose",
          "offsetX": 0,
          "offsetY": 0
        },
        {
          "id": "character-y-talking",
          "assetId": "media-character-y-talking",
          "label": "Talking",
          "role": "pose",
          "offsetX": -1.5,
          "offsetY": 2
        }
      ]
    }
  ]
}
```

Select multiple images in the library, choose a category and create a group. Rename each member to a useful state label, mark it as an alternative or pose, set alignment offsets and reorder the gallery. A character group with at least one member marked **Character pose** can be placed as one Character clip. Its Inspector selects the group and edits scene-local pose-change times and pose images. The clip uses shared Canvas transforms and the normal Timeline, EditorSession, preview and MP4 paths. A group remains a reusable asset relationship; placing it creates a separate clip ID and does not duplicate source images.

Character clip data uses a stable group reference and ordered pose-event IDs in the clip's `content`:

```json
{
  "id": "guide-character",
  "sceneId": "scene-opening",
  "trackId": "visuals",
  "componentId": "character",
  "label": "Guide",
  "from": 0,
  "durationInFrames": 300,
  "content": {
    "groupId": "character-y",
    "poseEvents": [
      {
        "id": "guide-neutral",
        "atFrame": 0,
        "memberId": "character-y-neutral"
      },
      {
        "id": "guide-speaking",
        "atFrame": 120,
        "memberId": "character-y-talking"
      }
    ]
  },
  "props": {
    "x": 50,
    "y": 90,
    "width": 32,
    "height": 58,
    "anchor": "bottom-center"
  }
}
```

For a scene-owned Character clip, `poseEvents[].atFrame` is relative to the scene start and cannot precede the clip's scene-local start. An unassigned project-global Character clip uses clip-local frames. Every pose event must reference a member in the same group marked with role `pose`. `Scene Moments` can bookmark a scene-local frame and reference the active Character pose event IDs there; see [Scene editing](SCENE_EDITING.md).

## Current limits

Character pose changes switch discrete registered images; they do not interpolate between drawings or create skeletal motion. Alignment offsets are normalized composition percentages applied to a pose image within the shared Character transform. Alternative members are not used as pose events. There is no automated detection or generation of character states.
