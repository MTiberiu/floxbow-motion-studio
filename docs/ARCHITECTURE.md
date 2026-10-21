# Architecture

The npm workspace separates host, player, renderer, SDK, animation library, audio, lyrics and project discovery. Node 22 runs orchestration using tsx. Electron main is intentionally a small CommonJS entry using Electron's native API; app/project/package code is TypeScript.

`npm run dev` starts two loopback servers then Electron. The shell origin has navigation and metadata only. The preview origin serves a repository-root Vite pipeline, so `/projects/<id>/<entry>` is a real transformed module URL. The selected module alone is dynamically requested; broken unselected compositions do not prevent shell startup. The manifest scanner returns per-project errors and requires the folder name to equal the unique ID. Missing entries, invalid paths, unsupported SDK versions and malformed JSON are reported. Realpath containment protects manifest/entry/timing/audio lookups against traversal and escaping symlinks.

Vite watches the project tree. A debounced event reloads the preview frame on add/change/delete, so new component dependencies and compile-error recovery are reliable. The shell polls manifests every 1.8 seconds. This deliberately resets playback rather than promising state-preserving fast refresh. Core shell editing still uses Vite HMR. No Electron rebuild is needed for scene edits.

Build uses a generated entry per project under `.studio/build/`, followed by independent Vite builds. Built projects use relative hashed asset URLs and a validated `dist/projects.json` catalog. Invalid projects retain error entries; build exits nonzero. `npm start` serves that snapshot on two loopback origins. New source projects require rebuilding in this mode.

The Remotion renderer CLI creates a temporary registerRoot entry, bundles only one project with Remotion's supported bundler, selects its composition and renders H.264 in headless Chrome. Rendering is never performed in the Electron renderer. The optional Python Whisper process similarly runs outside the UI. FFmpeg used by Remotion is managed by Remotion; the local Python worker needs FFmpeg on PATH.

## Security model

- Electron: sandbox, context isolation and webSecurity enabled; Node disabled; no preload or IPC API. No remote navigation, popups or webviews; permissions denied.
- Project frame: separate origin, `sandbox="allow-scripts allow-same-origin"`, no top navigation, popup or download grants. Same-origin is needed for Vite modules, but the preview has a different port from the shell, so it cannot remove its parent sandbox or read shell state.
- CSP: only local origin scripts/media, inline styles, local HMR websocket. No external fetch, object embedding or nested frames. No remote fonts.
- Node: loopback-only HTTP listeners; read-only endpoints; project paths validated; no generic filesystem or command endpoint.
- Important limits: loopback ports are not authentication. Vite exposes development source inside its allowed workspace. Project imports are not confined to their own folder by an OS policy. Infinite loops, resource exhaustion, browser exploits and malicious build-time imports are outside this boundary. Inspect external code; use a disposable OS account/container for hostile content. Production packaging, per-project worker processes and stronger resource isolation remain future work.

The file-system separation is an agent contract, not an adversarial sandbox. Tests cover ordinary compile/runtime exceptions, not arbitrary denial of service.

See [Module APIs and Integration Blueprint](MODULE_INTEGRATION_BLUEPRINT.md) for current public entry points, cross-module connection contracts, and the smallest recommended steps toward independently extensible capabilities.
