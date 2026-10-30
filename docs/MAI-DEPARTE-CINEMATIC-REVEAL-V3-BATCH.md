# Cinematic Reveal V3 — ONE-BATCH IMPLEMENTATION

Status: implementation brief, NOT completed code. Owner: developer working in the shared local Electron project.
Branch: `feat/storyboard-director-ux-v2`
Scope: `projects/mai-departe-cinematic-v1` visuals only.
No independent HTML demo, screenshot mockup, new global app system or installer for each effect.

## North star / actual on-screen result
The film moves forward at all times. A **physically textured burnt tear** travels across the film and reveals an **already-moving world**. Inside the tear, valley, sky, terrain, mist and water have different depth responses, even while the opening is small. The orange traveler's camera approaches and **passes through the same tear**, with the torn edge sweeping outside the field of view, continuing into the **same 2.5D scene**, not cross-dissolving between unrelated pictures. The bridge must be assembled from light, not left baked in a still background. Aim for tactile photographic emulsion, NOT neon/gaming sheen.

## Read / preserve before changes
- `scenes/JourneyReveal.tsx` — guides, three curves, emulsion mask, overlays, visual camera wrapper
- `scenes/LivingEmulsion.tsx`, `scenes/emulsion-field.ts` — existing unique frame-addressable frontier
- `scenes/CameraDirector.tsx`, `scenes/CameraWorld.tsx`, `scenes/camera-state.ts`, `scenes/camera-shots.json`
- `scenes/JourneyWorld.tsx`, `scenes/CinematicPlate.tsx` (may only exist locally; NEVER replace with guessed source)
- `assets/film-valley.png`, `assets/camera-valley-v1.png`, `assets/journey-near-slope-v1.png`
- inspect local diffs FIRST. Shared workspace may have uncommitted edits and ignored dependencies.
- `edit-timeline.json`, `media.json`, lyric/audio/subtitle IDs and motion guides are read-only. No modifications.

## Deliver ALL six work packages together (one preview review)

### A. World continuity and reveal-aware parallax
Build one `RevealWorldScene` rendered through the pre-existing frontier mask while in overview, AND by CameraDirector while approaching / fullscreen. Do NOT run independent duplicate world animations with different time origins. All motions frame-derived (Remotion frame/fps).
Use **true Z depth** for foreground banks, distant ridges, midground, water, bridge geometry, drifting mist, plus a slow optical-flow-like forward camera drift even before 8s. Background need not be photoreal 3D, but cannot be one photo plane pretending to fly through. In the film view, the actual world pixels revealed behind the existing frontier MUST evolve continuously with time and camera progression, while undiscovered pixels remain masked.

### B. Split existing art into compositable layers
Extract separate assets or procedurally replace portions (sky, far mountain, mid mountain, left/right banks, foreground), preserving transparent edges and filling exposed occlusion gaps. Do not merely crop a single photo into rectangular tiles; genuine alpha silhouettes and occlusion matter. If baked bridge cannot be cleanly removed, create a clean background plate / inpainted replacement; do not overlap two bridges. Output layered sources and provenance, and load them in existing scene. Avoid generative claims of perfectly reconstructed hidden surfaces. If local image asset is missing, report and halt just the destructive portion; keep others.

### C. Physical burnt emulsion edge
Use the *same* analytic frontier for reveal mask, scorch border, frayed fiber texture, soot specks, tiny holes and embers. Replace smooth uniform laser strokes with uneven thickness, dark char, ocher exposed emulsion and only isolated warm highlights. The border must attach exactly to the reveal at all frames, without pixel separation or floating sparks. Seeded deterministic behavior, no animated clock outside frame. Never turn film into a bright fantasy portal ring.

### D. Actual portal traversal
Camera frame 240–450: front view continues to advance; align perceived entrance with the moving rupture as it approaches, not an unrelated hole appearing at a fixed percent coordinate. As the camera advances, the tear expands via a consistent projection or coherent camera-relative mask until edges pass OUTSIDE the frame. No overall scene opacity dissolve and no second scene jump. Camera World visible inside the small tear and fullscreen must be the **same World scene / same camera state**, avoiding a photographic composition pop. On exit frame 690–810 reverse coherently, preserve traveler curve positions. Preserve `camera-shots.json` as shot schedule if feasible.

### E. Bridge materializes from light
Remove baked bridge from all visible art plates (film reveal AND camera world). Build `LuminousBridge` with an elegant bridge deck/arch geometry, appearing progressively from the orange traveler's reveal progress; sparse contours then filaments then lit surfaces. Bridge appears in both film aperture and fullscreen with matching spatial registration. Do NOT add an overlaid neon bridge on top of a painted bridge. Prefer quiet luminous strokes + believable architecture to arcade colors.

### F. Film, water and cinematic finishing
Visible but understated surface grain/scratches, rough burnt perforations, warm glints on water and slow mist. Avoid big additive glows, reflective plastic, UI grid exaggeration. Water time derived from frame and reflected scene; no flickering discontinuity under direct seek. Keep render cost in check, preferably reuse a single WebGL world context instead of two active `ThreeCanvas` when practical.

## Concrete scene architecture (adapt if better; minimize moving parts)
- `RevealWorldScene.tsx`: shared Z-layered world primitives, receives `frame, progress, travelerPosition`
- `WorldLayers.tsx`: sky/mountain alpha layers, midground and foreground meshes, parallax movement
- `LuminousBridge.tsx`: procedural build by reveal progress, not literal time playback history
- `BurntFilmEdge.tsx`: boundary edge texture powered by `emulsion-field`
- `FilmPortal.tsx`: aperture geometry aligned with frontier, tied to camera projected motion
- `CameraWorld.tsx`: host ThreeCanvas, import shared scene and camera rig
- `CameraDirector.tsx`: compositing and camera transition; do not duplicate a separate photograph behind the hole
- Prefer narrow diffs in `JourneyReveal.tsx`, `JourneyWorld.tsx` and stable existing shared files.

## Quality gates / deterministic tests
1. Seek equivalence: frame 150, 270, 360, 450, 540, 720, 810 equals sequential playback.
2. Frontier continuity: mask, char edge, particles and portal opening share geometry and produce no seams.
3. Parallax: compare 2+ camera positions to demonstrate nonidentical optical displacement for foreground, midground and far mountains; no cropping gaps.
4. Bridge: frame before construction has NO painted bridge anywhere; construction advances monotonically and respects reveal position.
5. Camera: no opacity cross-dissolve; physically understandable pass-through at 8–15s and reverse at 23–27s.
6. Media/timeline/lyrics/subtitles unchanged (file hashes); preserve existing curve keys and timing.
7. Check video visual output at **5s, 9s, 11s, 13s, 16s, 20s, 24s, 27s**; include image/video evidence where available, and one continuous playback 7–28s.
8. Run local targeted TS/build/tests and report preexisting global failures separately. Test at target preview resolution and note FPS/renderer context count.

## Delivery and collaboration
- This task is **one integrated batch**. Do not stop after changing only camera zoom or adding 1 overlay.
- Work directly in shared project folder, preserve local uncommitted files, commit only tracked safe visual changes if requested.
- If the current local code differs from GitHub, inspect and adapt; do not overwrite with remote baseline.
- State exactly what actually ships vs postponed; avoid claiming layered image / physical portal if still an opacity mask.
- Report changed files, brief architectural map, screenshots/timestamps or observed results, test outputs and limitations.
- No request for user to run successive per-effect installers. Developer tests in the shared workspace.
