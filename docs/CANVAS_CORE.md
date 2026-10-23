# Core Canvas interaction

Text Core defines text content and typography. **Canvas Core defines how any opted-in visual element is selected and transformed.** The Canvas interaction layer is shared by Text, Image, subtitles, and future components; individual modules do not implement their own selection handles or drag logic.

## Shared contract

The serializable `canvas` field on `ComponentInfo` describes a component's stable transform contract. The clip ID is the visual element ID; `owner` identifies the capability that owns its behavior. A component maps position, size, rotation, and anchor to its declared editable `fields`. It can also declare move, resize, rotate, aspect-ratio mode, numeric `resizeScaleFields`, lock field, and visibility field. A visual component opts in only to operations its rendering and fields support.

The `@motion/sdk/canvas` package export provides:

- `CanvasAnchor`, `CanvasTransform`, and `CanvasVisualElement` types.
- `getCanvasVisualElement(clip, definition)` and `getCanvasVisualElements(timeline, components, frame)` to resolve current visible visual clips from canonical Timeline data.
- `applyCanvasTransform(clip, definition, transform)` to validate and write a transform through the declared canonical fields.
- `canvasVisualBounds(element)` for rotated composition-space bounds.

Positions and dimensions use composition percentages. The transform mapping must point to real fields in `ComponentInfo.fields`; those same JSON values must drive the renderer. The Canvas contract is metadata, not executable code, and contains no React or Electron objects.

## Editor behavior

The Core Canvas controller renders selection overlays outside the preview iframe, so handles never enter preview or MP4 output. Click an element to select it, drag to move it, and use shared resize or rotation handles when declared. Modifier-click and marquee selection support multiple visual clips. Supported group movement and transforms update each clip's own canonical properties through the same editor session and undo history. Timeline selection and Inspector remain synchronized with Canvas selection; small, overlapping, hidden, or offscreen clips can still be selected from Timeline.

The Inspector is the precise editing path. It edits the declared fields of the primary selected clip. For multiple selection it reports the count and directs the user to Canvas group handles; per-clip fields remain independent. Locked elements and unsupported operations do not receive applicable transform controls.

## Implementing an opted-in visual component

Declare transform fields using the existing `EditableComponent` metadata and add a serializable `canvas` contract to the component definition. Render from those same properties. Numeric `resizeScaleFields` are scaled proportionally by the shared transform operation and validated against their declared limits. Standalone Text opts in for `fontSize`, so Canvas resizing changes the visible glyph size as well as the geometry. For example:

```ts
const imageDefinition = {
  id: "image",
  name: "Image",
  fields: imageFields,
  canvas: {
    owner: "core.image",
    coordinateSpace: "composition-percent",
    transform: {
      x: "x",
      y: "y",
      width: "width",
      height: "height",
      rotation: "rotation",
      anchor: "anchor",
    },
    operations: { move: true, resize: true, rotate: true },
    resizeMode: "free",
  },
};
```

Use `canvasElementContractSchema` and `componentInfoSchema` from `@motion/sdk/timeline` to validate registration metadata. Use `getCanvasVisualElements` and `applyCanvasTransform` from `@motion/sdk/canvas` in non-UI tooling or tests. The application owns selection state, handles, gesture math, undo checkpoints, and persistence. Do not add a component-specific Canvas controller.

Current application support is implemented for standalone Text, Image, Video, and subtitles. Other visual components must declare and validate the same contract before the editor offers spatial manipulation. A renderable React component or registry parameter alone does not promise Canvas or Inspector editability. Audio-only clips do not opt into spatial transforms.

## Compatibility and limits

Canvas metadata is optional, serializable `ComponentInfo` metadata. Existing Timeline v1 documents remain unchanged; transforms are stored in each clip's existing `props`. Components without `canvas` keep their existing behavior and can still be selected and edited through Timeline/Inspector where supported. The current coordinate space is composition percent. There is no generalized layer tree, persistent Canvas layout, nested transform hierarchy, or editor-handle rendering in exported video.
