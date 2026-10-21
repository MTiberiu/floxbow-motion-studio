# Module APIs and Integration Blueprint

This is an inventory of the current boundaries, not a proposal to add a plugin framework. Package names and exported paths below are the supported import points in this repository today. Source files describe implementations; consumers should use package exports rather than reaching into another package's `src/` directory.

## Current connection points

| Subsystem | Public entry points | Current responsibility and connection |
| --- | --- | --- |
| Project loader and media registry | `@motion/project-loader`, `@motion/project-loader/schema`, `@motion/project-loader/media` | Parses project manifests, discovers project folders, validates IDs and resolves contained project files. The optional version-1 `media.json` schema and Node-side linked-audio resolver are also public here. The shell and renderer both consume the loader; only the host should call the resolver. |
| Timeline data | `@motion/sdk/timeline` | Owns the version-1 frame-based edit document, clips, tracks, editable-field metadata (including optional serializable timeline behavior IDs), parsing, field validation and generic clip range changes. Registered behavior hooks are trusted application code selected by metadata; project JSON format remains version 1. |
| Editable composition API | `@motion/sdk/editor` | Exposes `EditableComponent`, `EditableVideoProps` and `TimelineComposition`. A project exports its component registrations; the composition maps timeline component IDs to React renderers. |
| Creative SDK | `@motion/sdk` | Exposes Remotion-backed scene primitives and frame helpers used by project compositions and reusable visual components. |
| Subtitle / lyric data | `@motion/lyrics-sync`, `@motion/lyrics-sync/subtitles` | Owns seconds-based word/line timing, reconciliation and SRT/LRC/JSON conversion. `subtitleClips` and `exportSubtitles` bridge that data to frame-based editor clips. |
| Subtitle rendering component | `@motion/lyrics-sync/component` | Exports `subtitleModule`, its declared editable fields and the React renderer. Content/timing live on the clip; appearance and karaoke behavior live in props. |
| Preview player and bridge | `@motion/player`, `@motion/player/host` | `StudioPlayer` hosts a Remotion composition. `mountPreview` receives the project module and manifest, exposes registered component metadata, and exchanges ready/frame/error/document/seek/play/pause messages on `motion-editor-v1`. The bridge checks the parent origin, source, channel and project ID. |
| Desktop editor shell | `apps/desktop/src/main.tsx`, `TimelineEditor.tsx` | Discovers projects, loads a project's preview, edits the timeline and reads component metadata from the preview bridge. It currently imports the lyric workbench and subtitle data helpers directly. |
| Renderer | `@motion/renderer` | `renderProject(root, id, still?)` resolves a project through the loader, bundles its declared entry with Remotion and writes a still or MP4. Rendering is outside the Electron renderer process. |
| Animation library | `@motion/animations` | Exports reusable React motion components built on the SDK primitives. Projects opt in by importing them. |
| Audio | `@motion/audio` | Currently exports a small Remotion `Narration` component. It uses `AudioReference` from the SDK; the player and editor do not discover audio capabilities through a registry yet. |
| Project media registry | `@motion/project-loader/media` and `scripts/media-store.ts` | Defines project-local linked MP3/WAV metadata and host resolution. The development shell provides native registration and availability UI. Source paths stay in the host and project JSON; preview, renderer, timeline and Whisper adapters are not implemented. See [Project Media Registry](PROJECT_MEDIA.md). |

### Data and runtime flow

1. A project manifest points to its composition and optional editable timeline. The project loader validates paths and metadata.
2. The project's composition imports the modules it needs and exports `editorComponents` alongside the composition. This is explicit project registration, not automatic package discovery.
3. The preview host renders the composition with the Remotion player. It sends serializable component metadata, including an optional timeline behavior ID, to the parent shell; renderer functions remain inside the preview and behavior IDs resolve only through a static trusted desktop map.
4. The editor sends the current timeline and transport commands through the validated `motion-editor-v1` message channel. Timeline clips identify registered renderers by `componentId`.
5. The renderer bundles the project's own composition entry. It shares the project and composition contracts but does not depend on the desktop editor UI.
6. In the development shell, an optional project `media.json` is read by the host media store. The UI receives display names and availability only; a native picker supplies paths during registration. The public resolver returns a local path to Node callers only and is not a browser-preview API.

For lyrics, canonical synchronization data is seconds-based while editable clips are frame-based. The subtitle bridge converts at the project FPS and stores word offsets relative to each segment. Import/export and the Lyrics Sync workbench are currently explicit user workflows; they are not a background editor service.

## Coupling and limits found

- The editor shell still has subtitle-specific add/import/export actions in `TimelineEditor.tsx`; subtitle clip construction, text correction and stale-karaoke detection live in `@motion/lyrics-sync/subtitles`. Other modules cannot currently declare equivalent custom editor actions through the component contract. This task does not add a descriptor because there is not yet a second real module with the same integration need.
- `TimelineComposition` and timeline schema are both exported by `@motion/sdk`; the timeline is a public reusable API, but it is not yet its own package boundary.
- `@motion/sdk` re-exports lyric types, while `@motion/lyrics-sync` imports timeline/component contracts from `@motion/sdk`. This creates a package-level type dependency cycle, even though the exports used at runtime are explicit.
- The preview bridge sends serializable component fields and optional timeline behavior IDs, not executable integration code or descriptors for custom inspector panels and import/export actions. The desktop editor owns a static trusted map; unknown or missing behavior IDs receive generic semantics (with a legacy subtitle fallback). Subtitle add/import/export remain explicit editor actions.
- Linked audio is registered and checked on the host, but no stable media-reference contract is wired into project compositions, preview, rendering, timeline clips, or Whisper. `media.json` paths are machine-specific, and this first slice does not include a relink or package-collection workflow.
- Public formats carry version markers (`sdkVersion`, timeline `version`, lyrics `version`, bridge channel `motion-editor-v1`), but there is no general migration registry. Changes need to remain additive or include an explicit migration before old project files are rejected.
- Package APIs are tested from the root test suite. Package-local API documentation and examples are uneven; the root timeline and lyrics docs currently carry much of the integration guidance.

## Minimal improvement sequence

These steps can be done incrementally without rewriting the app or introducing a plugin framework:

1. Treat existing package exports, `EditableComponent` metadata, `editTimeline.json`, subtitle timing JSON and `motion-editor-v1` messages as public contracts. Add focused contract tests for any behavior changed at those seams.
2. Remove the SDK-to-lyrics type re-export and have consumers import lyric types from `@motion/lyrics-sync`; this makes dependency direction clearer without changing the data format.
3. Keep the timeline schema and helpers stable while adding missing timeline operations there, rather than putting timeline semantics in React UI handlers. Extract a separate package only if multiple consumers need that boundary and the dependency graph can remain one-way.
4. Keep subtitle-only editor actions explicit until another real module needs them. Timeline behavior IDs may select only trusted static operations; do not turn the metadata into executable plugin loading.
5. Add package documentation when a subsystem is next changed: a README for purpose/setup, API reference for actual exports and compatibility, EXTENDING guidance, and a small runnable example. Do not add empty placeholders; keep project examples as end-to-end integration examples.
6. Keep schema versions explicit. For incompatible persisted data, add a migration from the prior version and tests for both old and new fixtures before changing the reader.

Do not make the editor load arbitrary executable plugin code, add a global plugin registry, or split packages solely to satisfy a directory layout. Project compositions remain the explicit place where rendering modules are selected.

## Compatibility and contribution rule

Before changing an exported function, message, manifest field, or persisted schema, search all workspace consumers and example projects. Prefer optional additive fields. For a breaking persisted-format change, provide a versioned migration and retain a fixture for the old format. Test the contract independently of the UI, then run the existing project validation, typecheck, tests, build and smoke checks as appropriate.
