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

The resolver returns `ready` with a host-only path, `missing` when a registered file no longer exists, or `invalid` when its entry, path, file type, extension, or basic audio header is unsuitable. It only resolves IDs present in a valid registry. Keep the `ready.path` in a Node host process; do not send it to the browser preview. This first slice does not provide preview, render, playback, waveform, or transcription adapters.

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

## Future timeline safety

Audio assets are not currently connected to timeline clips. When that integration is added, removing a media registry entry must never silently delete clips or corrupt the edit document. The editor will need an explicit policy for references to missing or removed media before timeline operations are implemented.

## Current limitations

The registry is an initial linked-audio slice, not a general media manager. It does not copy/collect files, relink moved sources, play audio, attach audio to timeline clips, or integrate with Remotion rendering or Whisper. The development shell provides native registration and project-entry removal; the built snapshot currently reports that registry editing is unavailable. Those integrations require a documented adapter contract and separate verification before use.
