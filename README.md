# AI Motion Studio

An AI-first desktop motion graphics workspace. External coding agents create independent React video compositions; Electron supplies the project browser and Remotion preview. This is a working foundation, not a traditional video editor or an autonomous AI service.

**Status: experimental baseline.** Project formats and editor contracts may change while the foundation is developed. The repository does not currently grant a general-purpose license for reuse; third-party dependencies keep their own terms. See [dependency and license notes](docs/DEPENDENCIES.md).

## Run

Requires Node.js 22.12+ and npm. First installation/launch needs network access for npm and Electron. Rendering may download Remotion's headless Chrome runtime.

```sh
npm install
npm run dev
```

Electron opens to a clean workspace when no user projects exist. Use **Create Project** to make an empty editable composition, or open **Capabilities** to explore reusable modules and their technical examples. Preview controls include play, seek, mute and fullscreen.

```sh
npm run typecheck
npm test
npm run validate
npm run test:smoke
npm run build
npm start
npm run render -- <project-id>
npm run render:still -- <project-id>
npm run create:project -- my-explainer
```

MP4s and stills go to `out/`. `npm start` opens the built snapshot; rebuild to include new projects there. `npm run dev` discovers new projects and reloads edited compositions without restarting Electron. Build compiles projects separately: a bad project is recorded as an error, other projects still build, and the command exits nonzero.

## Repository

- `apps/desktop`: Electron host, React shell, isolated preview bootstrap.
- `packages/player`, `renderer`: reusable Remotion player and Node render pipeline.
- `packages/motion-sdk`, `animation-library`: stable imports, deterministic components, validated capability registry.
- `packages/audio-engine`, `lyrics-sync`: audio references and canonical timing/reconciliation/export.
- `packages/project-loader`: manifest validation and filesystem discovery.
- `projects/<id>`: complete video content, local assets, timing and README.
- `examples/capabilities`: small technical examples; these are not user projects.
- `improvements`: proposals, isolated experiments, explicitly accepted changes.

## Agent workflow

Read [AGENTS.md](AGENTS.md), [CREATE_VIDEO](docs/CREATE_VIDEO.md), [the capability guide](docs/STYLE_CATALOG.md), and the [capability registry](packages/animation-library/registry.json). Create a project in the editor or run `npm run create:project -- my-video`; edit only that project. Default-export a component from the manifest entry. Reuse the public imports and technical examples. Start the studio, select the discovered project, iterate, validate, then render when requested.

## Loading and preview

The Node process enumerates and validates manifests. The shell polls the list; the preview loads only the selected entry through Vite's HTTP module transformer. These are explicit URL imports served by a repository-root Vite server, not arbitrary unresolved variable imports in a production bundle. A project watcher reloads only the preview frame. Each production preview is bundled independently into its own directory. Compile and runtime failures appear in that project's frame, leaving project navigation available.

## Lyrics sync

The Lyrics Sync workbench imports canonical JSON, edits word boundaries and exports JSON, word JSON, SRT or LRC. Edits remain in the panel until downloaded; replace the project file to update the video. Missing timing remains null. Incomplete lines are omitted from subtitle exports. Original lyrics can be reconciled against WhisperX, stable-ts or Whisper word JSON with order-preserving matching; this is not a substitute for listening and reviewing. Subtitle clips keep their synchronization data separate from appearance so the same timing can be reused with another visual style.

An optional Python Whisper worker is implemented and tested on generated speech in this environment. It requires `openai-whisper`, PyTorch, FFmpeg and a cached `base.pt` model. It never silently downloads models. Set `STUDIO_PYTHON` to select Python.

```sh
npm run sync:lyrics -- <project-id> assets/song.wav assets/lyrics.txt
```

This writes unverified results beneath the selected project in `out/`; inspect before replacing project timing data. No vocal separation, WhisperX forced alignment, AI correction provider, or song-accuracy guarantee is included. See [LYRICS_SYNC](docs/LYRICS_SYNC.md).

## Boundaries and limitations

Electron uses sandboxing, context isolation, disabled Node integration, denied permissions, blocked popups and no IPC bridge. Compositions run on a separate loopback origin in a sandboxed iframe. CSP restricts remote requests. This developer workspace is for locally reviewed code, **not a secure service for executing arbitrary hostile projects**. Repository-level coding agents retain their own filesystem/shell permissions; application sandbox settings do not restrict those agents. Review external code before copying it into `projects/`. Rendering and Vite compilation run as local Node tools and are not OS-sandboxed. See [ARCHITECTURE](docs/ARCHITECTURE.md).

Build is a runnable local snapshot, not an installer; signed packaging and updates are future work. Frame reloads reset playback. Loopback ports 5173/5174 and HMR ports 24680/24681 must be free. Rendering is a CLI operation outside Electron. Built preview is not hot-reloaded. Audio is supported via explicit local imports but no song or narration is supplied. Dependency notices and licensing research are in [DEPENDENCIES](docs/DEPENDENCIES.md); Remotion has special licensing terms, not a blanket MIT license.

See [VERIFICATION](docs/VERIFICATION.md) for actual execution results and the next milestone.

