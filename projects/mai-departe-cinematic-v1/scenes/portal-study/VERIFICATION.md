# Verification — complete film cycle
Project: mai-departe-cinematic-v1. No video or still render performed.

- `npx tsc --noEmit -p projects/mai-departe-cinematic-v1/scenes/portal-study/tsconfig.json`: PASS.
- `npx tsx --test projects/mai-departe-cinematic-v1/scenes/portal-study/study.test.ts`: 6/6 PASS, including all 7199 frame states, seek determinism and protected source hashes.
- `npm run validate`: 8 projects PASS.
- `npm test`: initial restricted run 193/195 (EPERM: operation not permitted, rename temporary storyboard.json files); rerun with filesystem permission: 195/195 PASS.
- `npm run typecheck`: FAIL on 9 preexisting errors outside the active director: TS2307 missing ./JourneyWorld and ../motion-guides.json in examples/capabilities/film-reveal-v1/JourneyReveal.tsx; TS2322 geometry on SVG line in examples/capabilities/luminous-gateway/JourneyConstruction.tsx and project DistantFilmBackdrop.tsx, JourneyConstruction.tsx, JourneyWorld.tsx, LuminousBridge.tsx; TS2322 number[] position in example and project LuminousGateway.tsx. Reproduce with npm run typecheck; expected repository-wide exit 0. Those files were not changed.
- Electron: direct seeks at 75, 115, 155, 175, 198, 209, 235, 239.9 seconds. Forest/ice/cloud texture reuse issue found and fixed by remounting the world material per world index, then visually rechecked. Playback advanced from 150s through subsequent scenes; paused in the outro. No frame-rate benchmark or uninterrupted full-song review claimed.
- Earlier TypeScript compatibility error from findLastIndex fixed using filter; one-frame floating point finale boundary corrected to compare integer frames.

No installation required. Use the existing running development player or `npm run dev`; open mai-departe-cinematic-v1. Cue timings are in CAMERA-MUSIC-CUE-SHEET.md. Assets are complete images on a Three plane; user-authored depth separation is still needed for actual multi-plane parallax.
