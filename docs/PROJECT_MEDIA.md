# Project Media Registry

The Media Library appears in the left project browser and supports linked MP3/WAV audio, PNG images, and MP4 video. It gives each project asset a stable ID and human-readable name while leaving the source file at its original location. Registration does not copy or move media. An asset ID identifies a source file; Timeline clip IDs identify separate uses of that asset.

## Public API

Import the schema and Node-side resolver from `@motion/project-loader/media`:

```ts
import {
  mediaRegistrySchema,
  resolveMedia,
  type MediaRegistry,
} from "@motion/project-loader/media";

const registry: MediaRegistry = mediaRegistrySchema.parse(JSON.parse(text));
const result = await resolveMedia(projectRoot, registry, "song-main");
```

The resolver returns `ready` with a host-only path, `missing` when a registered file no longer exists, or `invalid` when its entry, path, file type, extension, or basic format signature is unsuitable. MP4 registration additionally probes for a usable video stream and duration. It only resolves IDs present in a valid registry. Keep the `ready.path` in a Node host process; do not send it to the browser preview. The left Media Library shows PNG thumbnails, audio/video icons, availability and actions. For audio, choose **Soundtrack**. For a PNG or MP4, **Add** places an editable clip at the playhead; dragging the asset onto Canvas creates a clip at that position, and dragging it onto a visual Timeline track creates a separately timed clip. Preview and rendering receive same-origin streaming URLs, not host paths. See [Standalone Image](STANDALONE_IMAGE.md) and [Standalone Video](STANDALONE_VIDEO.md) for clip contracts.

## Project file format

Store the optional file at `projects/<project-id>/media.json`:

```json
{
  "version": 1,
  "assets": [
    {
      "id": "song-main",
      "type": "audio",
      "displayName": "Main song",
      "source": {
        "kind": "external-file",
        "path": "C:\\Music\\song.wav"
      }
    }
  ]
}
```

Asset IDs are stable project identifiers and are independent of filenames. Version 1 accepts unique slug IDs, non-empty display names, `audio`, `image`, or `video` media types, and an absolute host filesystem path for an `external-file` source. MP3/WAV are supported for audio, PNG for images, and MP4 for video. The host resolver checks a basic file signature; registration also confirms that MP4 has a usable video stream. A missing source keeps its registry entry so other project data remains intact.

Projects without `media.json` are treated as having an empty version 1 registry. The editor creates the file only when the first asset is registered. The current UI generates IDs and names from the native file selection; an external agent may edit the same JSON file, but must preserve IDs for existing assets and validate changes against the public schema.

## Editing and conflict handling

The shell reads the current registry revision and polls for valid external edits. Registration submits that revision to the host, which opens the native file picker and then validates and atomically saves the updated registry. Removal targets one stable asset ID and submits the same revision through the host's specific remove operation. It requires user confirmation and deletes only that registry entry; the original source file is never deleted, even when the entry is already missing. Unknown IDs return a clear error. If the file changes before a UI operation saves, the host returns a conflict and preserves the external edit; reload the panel before trying again. Malformed external JSON or schema data is reported instead of being silently replaced.

The browser sends no file path. The host accepts a revision and media type, checks the exact shell origin, and obtains the selected path from a native picker restricted to MP3/WAV audio, PNG images, or MP4 video. The read API returns names and availability, never source paths. Registry paths are local and may not work on another computer; users and coding agents need filesystem access to the referenced file. Do not commit personal media paths or user media to the public framework repository.

## UI and external-agent round trip

Use an explicit project folder and the stable ID supplied by the user. Do not identify a target by display name alone.

**UI to agent:** register two or more files in the left Media Library, remove one there, then have the external agent read that project's `media.json`. Validate it with `mediaRegistrySchema` from `@motion/project-loader/media` and report the remaining IDs. Confirm only the chosen ID is absent and the other entries and source files remain unchanged.

**Agent to UI:** ask the external agent to remove exactly one named stable ID from the explicit project's `media.json`. The agent should read the file and its hash, parse and validate the registry, confirm the requested ID exists, remove only that entry, validate the result, write a temporary file beside `media.json`, recheck that the original hash has not changed, and atomically rename the temporary file over `media.json`. It should reread and validate the result, confirm every other entry is unchanged, and verify the original media file remains untouched. The left Media Library should update within its polling interval without restarting the app.

For a real external coding agent, use this manual acceptance checklist:

- [ ] Give the agent the exact project folder and one stable asset ID to remove.
- [ ] Confirm it validates `media.json` before and after editing and leaves every other asset unchanged.
- [ ] Confirm the left Media Library reflects the edit without restarting FloxBow.
- [ ] Confirm the original media source still exists and is unchanged.

The automated smoke test exercises the same file contract using a test process; it does not call a separate AI coding agent. Mark the checklist only after a real agent run.

Direct file edits do not share the editor process's in-memory write lock or revision token. The UI detects edits made before its final revision check and refuses stale writes, but there is no cross-process lock that can eliminate the narrow race between an external agent's last hash check and rename. For this first slice, do not edit the registry from the UI and an agent at the same time. If either writer observes a changed hash/revision, stop, reread, and reconcile before retrying.

## Soundtrack workflow

1. Create or select a project and use the **Media Library** in the left project browser.
2. Choose **Add Audio**, select an MP3 or WAV in the native file picker, then choose **Use as soundtrack** for that asset.
3. FloxBow adds a visible clip to the **Audio** track at frame zero. It extends the editable Timeline and project duration when the audio is longer, without shortening other clips. Selecting another soundtrack replaces the existing soundtrack clip; this is not a mixing workflow.
4. Save the project. The preview uses the existing Remotion Player transport for sound, Canvas and playhead; the detached Timeline controls that same transport. The project can keep its saved subtitle clips in the **Captions** track, and the starter composition renders a black frame behind white captions.
5. Run `npm run render -- <project-id>` to write `out/<project-id>.mp4`. The renderer checks the referenced asset and its duration before rendering. If an asset is missing or invalid, relink it in Project Media before preview or render.

Audio is linked, not copied. The local path stays in `media.json` and trusted host code. The preview stream route accepts a registered asset ID; it does not accept a renderer-supplied path. The render adapter similarly resolves IDs on the Node side. Removing a registry entry does not delete the source file or a soundtrack clip; the resulting unresolved clip produces a clear playback/render error until the media is relinked or the clip is removed.

In the live development editor, **Generate Subtitles** runs the existing local Whisper worker on the selected soundtrack and imports its actual recognized segments as unverified editable subtitle clips. It does not require supplied lyrics, reconcile text, or invent missing timestamps. Segments beyond project duration are reported and skipped without truncation; unusable word timing is reported while segment captions are retained. The built snapshot does not expose local transcription. Waveform editing, mixing multiple tracks, audio effects, and packaging linked media are not implemented. FFmpeg and `ffprobe` must be available to the host for audio duration checks and Whisper decoding. Electron enables the trusted preview's playback initiated through the editor transport; in a browser with stricter autoplay policy, FloxBow reports that sound must be allowed before playback can start.

## Standalone MP4 video

Choose **Add Video** to link an MP4 in the left Media Library. Select the asset's **Add** action, or drag it to Canvas/a visual Timeline track, to create a separate `componentId: "video"` clip that references the registered asset ID. The source duration and dimensions are probed by host-side FFmpeg tools; Timeline placement has its own clip ID and duration. See [Standalone Video](STANDALONE_VIDEO.md) for the saved JSON contract, editable fields, trimming behavior, and current audio limitations. MP4 is the only supported ordinary video source format in this slice.

## Future timeline safety

The Timeline currently has one soundtrack clip on an Audio track and subtitle clips on the Captions track. Multiple simultaneous audio clips, soundtrack trimming/fades, relinking moved files, and packaging are not implemented. Removing media leaves the soundtrack clip in place and reports the unresolved reference; it never silently deletes timeline data.

## Current limitations

The registry is an initial linked-media slice, not a general media manager. It does not copy/collect files or relink moved sources. PNG and MP4 clips share the Core Canvas transform contract and the same Timeline v1 JSON as other editable clips. Image sequences, masks, crop handles and image animation controls are not implemented. Soundtrack selection, preview/render playback and local Whisper subtitle generation are available in the live editor; the built snapshot currently reports that registry editing and local transcription are unavailable. Flexible audio clips, soundtrack trimming, audio mixing/effects, waveform editing, and media collection are future work.
