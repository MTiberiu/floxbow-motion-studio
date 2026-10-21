# Milestone 001 verification

Executed on Windows, 2026-10-20, using Node 22.16.0 / npm 11.4.2.

## Implemented

Electron/React/TypeScript/Vite npm workspace; isolated Remotion preview; automatic validated project discovery; live composition reload; manifest and runtime error states; stable Motion SDK; six reusable animations with machine-readable catalog; two independent projects; lyrics inspector, schemas, conservative word reconciliation and four export formats; optional local Whisper CLI; external-agent instructions; improvement proposal workflow; independent production project builds; MP4/still rendering CLI.

## Actual checks

- `npm install`: successful; npm audit reported zero vulnerabilities at installation. Electron's runtime downloaded on first use.
- `npm run typecheck`: passed.
- `npm test`: four test groups passed (manifest/path rejection, discovery/malformed project isolation, real timestamp reconciliation/repetition/exports, timeline invariants).
- `npm run validate`: both starter projects passed.
- `npm run dev`: launched Electron successfully; left running for review.
- `npm run build`: shell and both independent preview bundles succeeded. Nonfatal dependency annotation and bundle-size warnings remain.
- `npm run test:smoke`: actual Electron window launched; both videos visible; new project discovered without host changes; live edit reflected; intentional syntax error displayed; healthy project remained accessible; repaired project loaded; intentional render exception displayed; shell Node API absent; lyrics controls visible. The test deliberately logs compiler/React errors and removes its owned fixture afterward.
- Built Electron check (`npm run test:built`): both built previews, switching, lyrics inspector and selection persistence across reload passed.
- `npm run render -- first-tutorial`: completed MP4. FFprobe confirmed H.264, 1920×1080, 30 fps, 18.000 seconds. File: `out/first-tutorial.mp4`.
- `npm run render:still -- gi-go-lo`: produced a 1920×1080 karaoke proof frame, visually inspected at `out/gi-go-lo.png`.
- Real local Whisper worker: generated 5.8-second English speech WAV; cached base model returned acoustic word timings. Full `sync:lyrics` CLI matched 12/12 original words and produced JSON/SRT/LRC/word JSON. This was speech, not song audio. Temporary project test assets were removed; outputs remain in `out/gi-go-lo/` and `out/alignment-*`.
- Screenshot inspected: `out/studio-smoke.png`.

## Architecture refinements

Two loopback origins separate the shell from project code. Vite explicitly transforms selected project URLs in development; builds compile projects independently. This avoids assuming arbitrary dynamic imports will be bundled. Reliable preview-frame reload is used instead of preserving playback state through hot updates. Electron main is a minimal CommonJS host; the rest is TypeScript. No MCP server or extra animation engine was added.

## Incomplete / limits

No real song/audio was supplied for GI GO LO: its timing is deliberately synthetic. No song accuracy benchmark, vocal separation, WhisperX forced alignment, cloud AI provider, narration generation, waveform editing, background job UI, signed installer or updater. Rendering/transcription are CLI tools, not UI buttons. Python dependencies/models are optional and not installed by npm. Whisper's Triton timing kernels fell back to slower implementations successfully here. Untrusted hostile code must not be run in this local developer workspace; browser restrictions do not sandbox Node build tools or repository agents. Preview reload resets playback. Built projects need a rebuild after editing. Ports 5173/5174 and HMR 24680/24681 must be available.

## Next milestone

Use a licensed real song and correct lyrics to benchmark alignment, add waveform/audio seeking and editable timing visualization, then introduce a supervised Node job queue for render/transcription progress and cancellation. Evaluate vocal separation/forced alignment from measured failures before adding dependencies. Keep installer packaging and stronger hostile-code isolation as explicit separate work.
