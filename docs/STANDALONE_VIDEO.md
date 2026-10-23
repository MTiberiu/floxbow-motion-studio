# Standalone Video clip

Register an MP4 in the left Media Library with **Add Video**. The native host probes its video stream and duration. Choose **Add** on the asset or drag it to Canvas/a visual Timeline track to create an independent Timeline v1 clip. Asset registration and clip placement are separate: the stable media asset ID identifies the source, while each placement has its own clip ID, timing, and transform.

## Canonical JSON

The supported contract is validated by `standaloneVideoClipSchema` from `@motion/sdk/editor` and the shared `editTimelineSchema` from `@motion/sdk/timeline`:

```json
{
  "id": "video-intro-instance",
  "trackId": "visuals",
  "componentId": "video",
  "label": "Intro.mp4",
  "from": 180,
  "durationInFrames": 60,
  "content": {
    "assetId": "video-intro",
    "sourceStartSeconds": 0,
    "sourceDurationSeconds": 8
  },
  "props": {
    "x": 50,
    "y": 50,
    "width": 80,
    "height": 80,
    "rotation": 0,
    "anchor": "center",
    "opacity": 1,
    "fit": "contain",
    "volume": 1
  }
}
```

`content.assetId` must reference a registered MP4 entry in the project's `media.json`. `sourceDurationSeconds` is host-probed metadata captured when the clip is created; the renderer probes the actual source again and rejects a mismatch. `sourceStartSeconds` is the in-point in the source MP4. `from` and `durationInFrames` are the clip's project-time placement. The Editor Inspector exposes source in-point, transform, fit, opacity, and embedded clip volume. Left-edge trim advances the source in-point; right-edge trim preserves it. A trim that would exceed the source is rejected.

## Canvas, preview, and render

Video opts into the same Core Canvas selection/move/resize/rotate contract as Text and Image. Its transform fields remain on the canonical clip `props`; handles are editor overlays and do not enter preview or exported MP4. Preview and MP4 rendering resolve the stable asset ID through the trusted host and stream the registered file. The preview uses the existing Remotion Player transport, and render uses the same source in-point, Timeline timing, transforms, and clip volume.

## External-agent edits and limits

An agent may change canonical `from`, `durationInFrames`, `sourceStartSeconds`, or supported `props` in `edit-timeline.json`. It must preserve the clip and asset IDs, ensure the clip range stays within project duration and the MP4 source duration, validate the whole Timeline, and use the project's existing safe external-edit/revision workflow. If local edits are dirty, FloxBow protects the draft and requires explicit reload/reconciliation.

This first video slice supports registered MP4 only. Independent audio-only clips, audio trimming/mixing, waveform editing, crop controls, transitions, and multi-source video formats are not implemented. Embedded MP4 audio is controlled by the clip's `volume`; the existing separate soundtrack remains a fixed full-duration clip at frame zero. Do not move or trim that soundtrack. FFmpeg and `ffprobe` must be available to register, inspect, or render video assets.
