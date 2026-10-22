# Project Media Registry

The first media registry supports linked MP3 and WAV files. It gives a project a stable asset ID and a human-readable name while leaving the source file at its original location. Registration does not copy or move media.

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

The resolver returns `ready` with a host-only path, `missing` when a registered file no longer exists, or `invalid` when its entry, path, file type, extension, or basic audio header is unsuitable. It only resolves IDs present in a valid registry. Keep the `ready.path` in a Node host process; do not send it to the browser preview. In the live editor, the user can choose **Use as soundtrack** for a ready asset. The host resolves and duration-probes the asset, while the preview receives only a stable asset ID and a same-origin streaming URL. Rendering resolves the same ID in Node and streams it to Remotion from a short-lived loopback endpoint.

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

Asset IDs are stable project identifiers and are independent of filenames. Version 1 accepts unique slug IDs, non-empty display names, the `audio` media type, and an absolute host filesystem path for an `external-file` source. MP3 and WAV extensions are supported; the host resolver checks a basic file header. A missing source keeps its registry entry so other project data remains intact.

Projects without `media.json` are treated as having an empty version 1 registry. The editor creates the file only when the first asset is registered. The current UI generates IDs and names from the native file selection; an external agent may edit the same JSON file, but must preserve IDs for existing assets and validate changes against the public schema.

## Editing and conflict handling

The shell reads the current registry revision and polls for valid external edits. Registration submits that revision to the host, which opens the native file picker and then validates and atomically saves the updated registry. Removal targets one stable asset ID and submits the same revision through the host's specific remove operation. It requires user confirmation and deletes only that registry entry; the original source file is never deleted, even when the entry is already missing. Unknown IDs return a clear error. If the file changes before a UI operation saves, the host returns a conflict and preserves the external edit; reload the panel before trying again. Malformed external JSON or schema data is reported instead of being silently replaced.

The browser sends no file path. The host accepts a revision only, checks the exact shell origin, and obtains the selected path from a native MP3/WAV picker. The read API returns names and availability, never source paths. Registry paths are local and may not work on another computer; users and coding agents need filesystem access to the referenced file. Do not commit personal media paths or user media to the public framework repository.

## UI and external-agent round trip

Use an explicit project folder and the stable ID supplied by the user. Do not identify a target by display name alone.

**UI to agent:** register two or more files in the Media panel, remove one there, then have the external agent read that project's `media.json`. Validate it with `mediaRegistrySchema` from `@motion/project-loader/media` and report the remaining IDs. Confirm only the chosen ID is absent and the other entries and source files remain unchanged.

**Agent to UI:** ask the external agent to remove exactly one named stable ID from the explicit project's `media.json`. The agent should read the file and its hash, parse and validate the registry, confirm the requested ID exists, remove only that entry, validate the result, write a temporary file beside `media.json`, recheck that the original hash has not changed, and atomically rename the temporary file over `media.json`. It should reread and validate the result, confirm every other entry is unchanged, and verify the original media file remains untouched. The open Media panel should update within its polling interval without restarting the app.

For a real external coding agent, use this manual acceptance checklist:

- [ ] Give the agent the exact project folder and one stable asset ID to remove.
- [ ] Confirm it validates `media.json` before and after editing and leaves every other asset unchanged.
- [ ] Confirm the Media panel reflects the edit without restarting FloxBow.
- [ ] Confirm the original media source still exists and is unchanged.

The automated smoke test exercises the same file contract using a test process; it does not call a separate AI coding agent. Mark the checklist only after a real agent run.

Direct file edits do not share the editor process's in-memory write lock or revision token. The UI detects edits made before its final revision check and refuses stale writes, but there is no cross-process lock that can eliminate the narrow race between an external agent's last hash check and rename. For this first slice, do not edit the registry from the UI and an agent at the same time. If either writer observes a changed hash/revision, stop, reread, and reconcile before retrying.

## Soundtrack workflow

1. Create or select a project and open **Media**.
2. Choose **Add Audio**, select an MP3 or WAV in the native file picker, then choose **Use as soundtrack** for that asset.
3. FloxBow adds a visible clip to the **Audio** track at frame zero. It extends the editable Timeline and project duration when the audio is longer, without shortening other clips. Selecting another soundtrack replaces the existing soundtrack clip; this is not a mixing workflow.
4. Save the project. The preview uses the existing Remotion Player transport for sound, Canvas and playhead; the detached Timeline controls that same transport. The project can keep its saved subtitle clips in the **Captions** track, and the starter composition renders a black frame behind white captions.
5. Run `npm run render -- <project-id>` to write `out/<project-id>.mp4`. The renderer checks the referenced asset and its duration before rendering. If an asset is missing or invalid, relink it in Project Media before preview or render.

Audio is linked, not copied. The local path stays in `media.json` and trusted host code. The preview stream route accepts a registered asset ID; it does not accept a renderer-supplied path. The render adapter similarly resolves IDs on the Node side. Removing a registry entry does not delete the source file or a soundtrack clip; the resulting unresolved clip produces a clear playback/render error until the media is relinked or the clip is removed.

The built-in player does not yet transcribe a song, reconcile lyrics, create subtitle timing, provide waveform editing, mix multiple tracks, apply audio effects, or package linked media. Supply or import subtitle timing separately; Whisper-based lyric timing is a later workflow. FFmpeg and `ffprobe` must be available to the host for audio duration checks. Electron enables the trusted preview's playback initiated through the editor transport; in a browser with stricter autoplay policy, FloxBow reports that sound must be allowed before playback can start.

## Future timeline safety

The Timeline currently has one soundtrack clip on an Audio track and subtitle clips on the Captions track. Multiple simultaneous audio clips, soundtrack trimming/fades, relinking moved files, and packaging are not implemented. Removing media leaves the soundtrack clip in place and reports the unresolved reference; it never silently deletes timeline data.

## Current limitations

The registry is an initial linked-audio slice, not a general media manager. It does not copy/collect files or relink moved sources. Soundtrack selection and preview/render playback are available in the live editor; the built snapshot currently reports that registry editing is unavailable. Automatic transcription, audio mixing/effects, waveform editing, and media collection are future work.
