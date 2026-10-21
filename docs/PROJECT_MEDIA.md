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

The shell reads the current registry revision and polls for valid external edits. Registration submits that revision to the host, which opens the native file picker and then validates and atomically saves the updated registry. If the file changes during selection or before saving, the host returns a conflict and preserves the external edit; reload the panel before trying again. Malformed external JSON or schema data is reported instead of being silently replaced.

The browser sends no file path. The host accepts a revision only, checks the exact shell origin, and obtains the selected path from a native MP3/WAV picker. The read API returns names and availability, never source paths. Registry paths are local and may not work on another computer; users and coding agents need filesystem access to the referenced file. Do not commit personal media paths or user media to the public framework repository.

## Current limitations

The registry is an initial linked-audio slice, not a general media manager. It does not copy/collect files, relink moved sources, play audio, attach audio to timeline clips, or integrate with Remotion rendering or Whisper. The development shell provides the native registration workflow; the built snapshot currently reports that registration is unavailable. Those integrations require a documented adapter contract and separate verification before use.
