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

If the MP4 includes audio, select the Video clip and choose **Separate video audio** in Inspector. FloxBow adds an independent `video-audio` clip to an unlocked Audio track, copies the video Timeline range and source in-point, and sets the original Video clip's `props.volume` to `0`. Both clips keep independent clip IDs and reference the same `content.assetId`; no media is copied. The detached audio contract is:

```json
{
  "id": "video-audio-intro-instance",
  "trackId": "audio",
  "componentId": "video-audio",
  "label": "Audio · Intro.mp4",
  "from": 180,
  "durationInFrames": 60,
  "content": {
    "assetId": "video-intro",
    "sourceVideoClipId": "video-intro-instance",
    "sourceStartSeconds": 0,
    "sourceDurationSeconds": 8
  },
  "props": { "volume": 1 }
}
```

The audio clip plays the registered MP4's audio stream in the same Remotion Player and export composition. It may be moved, trimmed, or deleted independently; trimming its left edge advances `sourceStartSeconds`. Deleting it leaves the Video clip muted. If the MP4 has no audio stream, FloxBow reports that and does not create an empty clip. The application preview-volume slider still controls all preview sounds together; it does not change project or export levels.

## External-agent edits and limits

An agent may change canonical `from`, `durationInFrames`, `sourceStartSeconds`, or supported `props` in `edit-timeline.json`. It must preserve the clip and asset IDs, ensure the clip range stays within project duration and the MP4 source duration, validate the whole Timeline, and use the project's existing safe external-edit/revision workflow. If local edits are dirty, FloxBow protects the draft and requires explicit reload/reconciliation.

This first video slice supports registered MP4 only. Independent user-imported audio clips, audio mixing controls, waveform editing, crop controls, transitions, and multi-source video formats are not implemented. Embedded MP4 audio stays with the Video clip until the user separates it. The existing soundtrack remains a fixed full-duration clip at frame zero; it can be moved between Audio rows or deleted, but cannot be shifted in time or trimmed. FFmpeg and `ffprobe` must be available to register, inspect, separate, or render video assets.
