# Standalone Text clip

The core `text` clip is available in every editable project without registering a specialized module. It is part of the existing Timeline v1 contract and is rendered by `TimelineComposition` in both live preview and MP4 rendering. Use **Add Text** in the editor, then edit the selected clip in Inspector.

## Saved JSON contract

The clip is stored in `edit-timeline.json`. Timing remains integer project frames; the text and editable appearance are stored once in the clip's `content` and `props`:

```json
{
  "id": "text-title",
  "trackId": "visuals",
  "componentId": "text",
  "label": "Title",
  "from": 60,
  "durationInFrames": 90,
  "content": { "text": "A title edited by an agent" },
  "props": {
    "x": 68,
    "y": 24,
    "fontSize": 84,
    "color": "#00ff00",
    "alignment": "right"
  }
}
```

`x` and `y` are percentages of the composition (0–100), `fontSize` is 8–500 pixels, `color` is a six-digit hex color, and `alignment` is `left`, `center`, or `right`. If optional appearance values are omitted, defaults are x/y 50, font size 72, white, and center. Text content is limited to 20,000 characters. The editor also exposes these same six values in Inspector.

## External agent editing

An agent edits the existing canonical timeline file; it does not create a sidecar document or modify shared application code. Preserve clip IDs, track IDs, timing, unrelated clips and unknown project data. Change only the requested `content.text` or supported `props` fields. Write a temporary file beside `edit-timeline.json`, validate that the JSON parses, then replace the original file atomically when possible.

The running editor checks the file revision. When there is no local draft, the new JSON appears in Inspector and Canvas automatically. When a local draft exists, FloxBow keeps the human draft and blocks saving on conflict; the user can export the draft or explicitly reload from disk. Do not overwrite or resolve that conflict on the user's behalf.

After the user edits the same property in Inspector and saves, the value is written back to this clip in `edit-timeline.json`. Preview and render use the same `TimelineComposition` and saved values. Render with `npm run render -- <project-id>` after saving.

The built-in renderer uses an absolute percentage position, one font size, color and text alignment. It does not provide transforms, animation, text boxes, font selection, wrapping controls or keyframes. Projects may still contain custom React compositions, but those remain code-owned unless their values are represented by real editable clips and Inspector fields.

## Public API

`@motion/sdk/editor` exports `standaloneTextModule`, `standaloneTextFields`, `standaloneTextClipSchema`, and `standaloneTextPropsSchema`. `TimelineComposition` includes the core Text renderer automatically. The editor publishes the declared fields to Inspector metadata, and the save and render paths validate the documented data limits. Timeline v1 and existing clips remain unchanged.
