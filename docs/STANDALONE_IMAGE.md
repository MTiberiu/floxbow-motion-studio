# Standalone Image clip

Image assets are registered once in the project's `media.json`; Timeline clips reference the stable asset ID and have independent clip IDs and timing. Use **Media Library → Add PNG**, then **Add** on the linked asset to place it at the playhead. You can also drag a registered image onto Canvas to place it there, or onto a visual Timeline track to set its start time. The original image stays at its source path. The Image clip is part of Timeline v1 and uses the shared [Core Canvas interaction contract](CANVAS_CORE.md).

## Canonical JSON

An Image clip in `edit-timeline.json` has the ordinary Timeline v1 timing fields plus:

```json
{
  "id": "image-clip-1",
  "trackId": "visuals",
  "componentId": "image",
  "label": "forest.png",
  "from": 0,
  "durationInFrames": 180,
  "content": { "assetId": "image-asset-id" },
  "props": {
    "x": 50,
    "y": 50,
    "width": 80,
    "height": 80,
    "rotation": 0,
    "anchor": "center",
    "opacity": 1,
    "fit": "contain"
  }
}
```

`content.assetId` must refer to a registered PNG asset in `media.json`. `x` and `y` are composition percentages; width and height are percentages from 1–100; rotation is degrees; anchor is one of the nine named positions; opacity is 0–1; fit is `contain`, `cover`, or `fill`. These are validated by `standaloneImageClipSchema` and are also exposed as Inspector controls.

The media asset ID identifies the source file. The clip ID identifies one Timeline use. Multiple clips can refer to the same asset and keep independent position, size, timing, and styling. Registering an asset does not create a Timeline clip; adding a clip does not copy the source image.

## Editing and rendering

Image uses the same Canvas selection, move, resize, rotate, modifier/marquee multi-selection, Timeline selection, Inspector, undo/redo, and save behavior as other components that opt into the visual contract. Edits write to the Image clip's canonical `props`. The live preview and MP4 renderer consume those same values through `TimelineComposition`.

The project scaffold automatically includes the core Image renderer. It receives only registered media IDs mapped to safe same-origin stream URLs in preview, or short-lived host streaming URLs during rendering. Host filesystem paths stay in trusted Node code. Missing or invalid PNG sources produce visible media errors and block rendering with a clear message.

## External-agent edit example

An agent may edit an Image clip in the existing `edit-timeline.json`; it must preserve the clip ID, asset ID, timing, tracks, unrelated clips, and unknown project data. For example, to move only `image-clip-1`, change its `props.x` and `props.y` values, validate the updated timeline with `editTimelineSchema`, write a temporary sibling file, recheck the original revision/hash, and atomically replace it. FloxBow refreshes a clean editor document; if there are local dirty edits, it keeps the human draft and blocks stale saving until the user explicitly reloads or reconciles.

```ts
import { editTimelineSchema } from "@motion/sdk/timeline";

const timeline = editTimelineSchema.parse(JSON.parse(text));
const clip = timeline.clips.find((item) => item.id === "image-clip-1");
if (!clip || clip.componentId !== "image")
  throw new Error("Image clip not found");
clip.props.x = 68;
clip.props.y = 30;
editTimelineSchema.parse(timeline);
```

The host separately validates the asset reference against `media.json`. Do not invent a host path, change media registrations, or modify shared application code as part of an ordinary video edit. Image crop editing, masks, image sequences, animated image properties, and source packaging are not implemented.
