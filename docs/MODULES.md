# Module discovery

Use this index to choose one guide for the current task. It describes current source boundaries, not a plugin system. Status reflects code and documentation at the index's reviewed commit; follow the linked guide for limits and verify exports in source when changing a public contract.

## Implemented modules and subsystems

| ID                     | Area                   | Find this for                                                                        | Status      | Documentation                                                                                                                                 |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-workspace`    | Desktop shell          | Open or switch editor, media, lyrics, or capability views                            | Implemented | [Architecture](ARCHITECTURE.md), [workspace behavior](TIMELINE_EDITOR.md)                                                                     |
| `project-loader-media` | Project and media      | Create/discover projects, validate manifests, link or remove audio registry entries  | Partial     | [Create a video](CREATE_VIDEO.md), [explainer workflow](EXPLAINER.md), [project media registry](PROJECT_MEDIA.md)                             |
| `motion-sdk`           | Composition SDK        | Build frame-driven compositions, scenes, transitions, or editable clip components    | Implemented | [Motion SDK](MOTION_SDK.md), [editable timeline contract](TIMELINE_EDITOR.md)                                                                 |
| `timeline-editor`      | Timeline and editor    | Edit declared clips, subtitle timing, tracks, properties, save/reload, or conflicts  | Implemented | [Timeline editor](TIMELINE_EDITOR.md)                                                                                                         |
| `lyrics-subtitles`     | Lyrics synchronization | Import/reconcile lyrics, review word timing, export subtitles, or use subtitle clips | Implemented | [Lyrics synchronization](LYRICS_SYNC.md), [subtitle clip contract](TIMELINE_EDITOR.md)                                                        |
| `characters-2p5d` | Character animation | SVG mascot motion, editor properties and subtitle-linked comic speech | Implemented | [Character module](CHARACTERS.md), [package API](../packages/characters/README.md) |\n| `animation-library`    | Reusable motion        | Find an implemented animation component, parameters, example, or registry entry      | Implemented | [Capability registry](../packages/animation-library/registry.json), [animation guide](CREATE_ANIMATION.md), [style catalog](STYLE_CATALOG.md) |
| `audio-component`      | Composition audio      | Add an explicitly imported local narration or audio file to a composition            | Partial     | [Create a video: media imports](CREATE_VIDEO.md), [capability registry](../packages/animation-library/registry.json)                          |
| `preview-player`       | Preview                | Understand playback, seeking, reload boundaries, or preview integration              | Implemented | [Architecture](ARCHITECTURE.md), [timeline and player behavior](TIMELINE_EDITOR.md)                                                           |
| `renderer`             | Video rendering        | Render a project or inspect renderer constraints                                     | Implemented | [Create and render a video](CREATE_VIDEO.md), [dependency notes](DEPENDENCIES.md)                                                             |

`Partial` means an integration is intentionally limited; for example, Media Registry audio is not automatically connected to preview, timeline playback, rendering, or lyric transcription. The `Narration` composition component can play an imported local asset, but registration in Media Registry alone does not make that asset playable. Read the linked guide before choosing an implementation.

## Examples and proposals

Technical demonstrations live under [`examples/capabilities/`](../examples/README.md); they are not user projects. Existing project examples, if any, are separate from reusable capabilities.

Proposals and experiments are not available features. [Review & Annotations](../improvements/proposals/ai-documentation-architecture.md) is proposed only: there is no implemented review-annotation module or project-data contract. Cross-module product ideas live in [`management/BACKLOG.md`](../management/BACKLOG.md); engineering designs and investigations live under [`improvements/`](../improvements/experiments/README.md). Do not infer implementation status from a proposal or backlog entry.
