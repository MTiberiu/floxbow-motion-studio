# Portal → cinematic valley → paper: reusable reference shot

This is the narrowed, user-requested reference scene, not the final four-minute montage. It replaces the active V4 floating panels and unrelated actor/monitor props. Original implementations remain on disk. The preview retains the existing duration/audio/captions; after this study the paper background holds. Do not interpret that hold as a finished edit.

## Contents and timing

- `RestoredFilmHub.tsx`: recovered amber/dark scrolling film treatment, the original globally timed curves, and the existing living emulsion. The film covers the frame; there is no freestanding rectangle in the world.
- `PortalMaterialScene.tsx`: one ThreeCanvas, one fixed background plane, a forward camera, local water shimmer, and a shader that develops the paper material across immutable image coordinates. A growing organic aperture and its luminous edge share one contour; it covers all four corners before the film overlay is removed.
- `study-state.ts` / `music-camera.json`: absolute frame evaluation; music-weighted speed knots copied from the first excursion of the analysis-derived camera cue sheet. Entry uses the saved first-excursion times. Material change uses saved cue starts at frame 496 (16.533333 s) and frame 916 (30.533333 s). Camera settles by the end of the first excursion; there is no cumulative integration.
- `assets/camera-valley-v1.png` (two folders above): original complete cinematic landscape.
- `assets/camera-valley-paper-v1.png`: generated material-edit counterpart, 1672 × 941. Prompt: retain the original camera, mountain outlines, bridge, castle, trees, shore and sun; replace materials with layered ivory/kraft paper, folded facets, fine cut trees, amber grazing light and paper-ribbon water. No new objects or framing.

The paired image preserves the broad composition, but generated details are **not pixel-identical**. Both images use identical UVs and geometry; the narrow developing band limits double exposure. This is a full-image reference as requested, not separated 2.5D scenery. Layer separation, exact alpha registration, deeper parallax and placement belong to the user's next assembly step. There is no automated segmentation and no claim of reconstructed 3D geometry. Avoid extreme camera magnification with these source dimensions.

## Copy / integration

Copy this directory and the two image assets. Within this project it reuses `motion-guides.json`, `DirectorComponents`, `DarkFilmAtmosphere`, `FilmLifeOverlay`, `LivingEmulsion` and `emulsion-field`; retain those alongside it. No dependency installation or shared application edits are needed.

The active Composition registers the two study modules against the existing clip IDs and uses `StudyLyrics` only for preview contrast. Saved lyrics, cues, verification and Timeline are unchanged. `integration.json` contains a checksummed Composition payload. Installer refuses unknown contents and creates an exclusive backup; it does not blindly overwrite another edit.

Run from `J:\floxbow\app`:

```powershell
node projects/mai-departe-cinematic-v1/scenes/portal-study/install.mjs
node projects/mai-departe-cinematic-v1/scenes/portal-study/install.mjs --apply
npx tsc --noEmit -p projects/mai-departe-cinematic-v1/scenes/portal-study/tsconfig.json
npx tsx --test projects/mai-departe-cinematic-v1/scenes/portal-study/study.test.ts
npm run validate
npm run typecheck
npm test
npm run dev
```

In the player inspect 2 s (scrolling film), 7 s (portal), 12 s (clean natural world), 23–26 s (material development), 35 s (paper), then seek back to 7 s. Rendering/export was not requested and was not run.

## Verification and known repository failures

The study's TypeScript compile passes. Electron inspection confirmed natural/paper backgrounds and backwards seeking; original audio and source hashes are checked by the local tests. The portal removes the film only after covering the viewport.

Repository validation passes. Global `npm run typecheck` reports existing TS2307 missing imports in `examples/capabilities/film-reveal-v1/JourneyReveal.tsx`, and TS2322 Three.js `<line>`/SVG conflicts in the luminous-gateway example and old project `DistantFilmBackdrop`, `JourneyConstruction`, `JourneyWorld`, `LuminousBridge`, `LuminousGateway` files. These are outside the active study, and were not changed.

`npm test`: 193/195 pass. Failures: `tests/storyboard-collaboration.test.ts:75` and `tests/storyboard.test.ts:369`, both `EPERM: operation not permitted, rename` of a temporary `storyboard.json.*.tmp` onto `storyboard.json` in the Windows temporary test directory. Reproduce with `npm test`; expected atomic save succeeds. No shared application fix attempted.
