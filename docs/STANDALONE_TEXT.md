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
    "width": 80,
    "height": 20,
    "rotation": 0,
    "anchor": "center",
    "fontSize": 84,
    "fontFamily": "Arial",
    "fontWeight": "700",
    "italic": false,
    "color": "#00ff00",
    "alignment": "right",
    "opacity": 1,
    "lineSpacing": 1.15,
    "fadeInFrames": 0,
    "fadeOutFrames": 0,
    "slideInFrames": 0,
    "slideOutFrames": 0,
    "scaleInFrames": 0,
    "scaleOutFrames": 0,
    "slideDirection": "up"
  }
}
```

`x` and `y` are percentages of the composition (0–100). `width` and `height` are text-box percentages (1–100); `rotation` is degrees; `anchor` is one of the nine named box anchors. `fontSize` is 8–500 pixels. `fontFamily` is one of Arial, Georgia, Impact, Times New Roman or Verdana. `fontWeight` is a string from `400`, `500`, `600`, `700`, `800`, `900`; `700` and above are bold weights. `italic` is boolean. `color` is a six-digit hex color, `alignment` is left/center/right, `opacity` is 0–1, and `lineSpacing` is 0.5–3. Text content is limited to 20,000 characters.

The frame-based animation controls are declarative and default to zero (disabled): `fadeInFrames`, `fadeOutFrames`, `slideInFrames`, `slideOutFrames`, `scaleInFrames`, and `scaleOutFrames`, each 0–900 frames. `slideDirection` is up/down/left/right. Animation runs deterministically from the clip-local frame in both preview and MP4; no editor-only handle or canvas state is saved. Existing Text clips may omit the new optional properties and continue using the compatible defaults.

Inspector exposes the same supported properties. Timeline timing remains integer frames. Canvas transforms, Inspector controls, external JSON edits and rendering all use the saved clip's canonical `props`.

## External agent editing

An agent edits the existing canonical timeline file; it does not create a sidecar document or modify shared application code. Preserve clip IDs, track IDs, timing, unrelated clips and unknown project data. Change only the requested `content.text` or supported `props` fields. Write a temporary file beside `edit-timeline.json`, validate that the JSON parses, then replace the original file atomically when possible.

The running editor checks the file revision. When there is no local draft, the new JSON appears in Inspector and Canvas automatically. When a local draft exists, FloxBow keeps the human draft and blocks saving on conflict; the user can export the draft or explicitly reload from disk. Do not overwrite or resolve that conflict on the user's behalf.

After the user edits the same property in Inspector and saves, the value is written back to this clip in `edit-timeline.json`. Preview and render use the same `TimelineComposition` and saved values. Render with `npm run render -- <project-id>` after saving.

Custom React compositions remain valid for visual behavior. A component's renderability or declared props do not make those values editable automatically; only documented canonical fields with real editor controls are user-editable.

## Public API

`@motion/sdk/editor` exports `standaloneTextModule`, `standaloneTextFields`, `standaloneTextClipSchema`, and `standaloneTextPropsSchema`. `TimelineComposition` includes the core Text renderer automatically. The editor publishes the declared fields to Inspector metadata, and the save and render paths validate the documented data limits. Timeline v1 and existing clips remain unchanged.

The module declares `canvas` metadata on its serializable `ComponentInfo`. This is the shared Core Canvas contract: stable element identity comes from the Timeline clip ID; `owner` identifies the capability; the transform maps to the same declared `props` fields used by the renderer; and `operations` declares move, resize and rotate support. `@motion/sdk/timeline` validates that each mapped field exists and has the correct editable type. The shared Canvas controller uses this metadata for selection and spatial editing; Text does not implement its own handles or drag logic. See [Core Canvas interaction](CANVAS_CORE.md) for the contract and current support boundaries.
