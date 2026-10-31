# Mai departe, pas după pas — PROJECT HANDOFF / CURRENT STATE

> **Read this first if you are a new AI developer/director.** This is the state of the actual Electron/Remotion composition on branch `feat/storyboard-director-ux-v2`, checked against commit **`8fa358c5ec720baaeec02efa87ff5bccdeef0d30`** (“Complete music-driven world cycle with distinct landscapes and traveler finale”). The notes here describe **code confirmed in GitHub**, not a newly completed Electron render. The user's most recent instruction: **freeze the existing transitions between worlds for now. Next work is visual design of each world: exact images, lighting, materials, per-world action and image layering.**

## 1. Project / entry point — DO NOT confuse source proofs with the live preview

- Repository: `MTiberiu/floxbow-motion-studio`
- Branch: `feat/storyboard-director-ux-v2`
- Project folder: `projects/mai-departe-cinematic-v1/`
- Actual entry: **`Composition.tsx`** (see `project.json`).
- Main runtime component: **`scenes/portal-study/PortalMaterialScene.tsx`** imported by `Composition.tsx`.
- `Composition.tsx` registers it twice: `director-journey-reveal` and `director-journey-reveal-legacy`. Despite the latter's name, **both are backed by PortalMaterialScene**.
- Saved `edit-timeline.json`: clip `director-reveal-proof-30s` uses `director-journey-reveal` from frames **0–899**; clip `director-continuous-journey` uses `director-journey-reveal-legacy` from **900–7198**. They together cover the whole 7199-frame composition at **30 fps**, approximately **239.97 s**.
- If you edit `scenes/JourneyReveal.tsx`, `scenes/CameraDirector.tsx`, `scenes/RiftPushTransition.ts` or earlier V3 examples without importing them into the **active** scene, **the preview will not change**. This exact mistake happened in earlier iterations. Confirm the entry → module ID → Timeline clip chain **before touching visual code**.
- Runtime global frames in `PortalMaterialScene`: `absolute=(clip.from+frame)*30/fps`; `filmState(absolute)` drives the scene. Keep continuity over the 900-frame clip boundary.

## 2. What is implemented now (commit 8fa358c5)

The film is a **global traveler hub**: three colored markers travel along existing music-derived curves on a dark/amber scrolling film, the camera reveals/explores an image-based world, and the film/travelers return to hand off to the next world. The three paths must **never reset** just because another world or camera shot begins.

**Active scene layers:**
1. **Film hub** — `scenes/portal-study/RestoredFilmHub.tsx`: three paths/markers and dark film surface, emulsion contour, guides from `motion-guides.json`; options for destination world image, travelers-only outro, extended route coverage.
2. **World plate** — `PortalMaterialScene.tsx` → `BackgroundWorld` inside `ThreeCanvas`, large perspective plane with texture shader, camera position and local optical effects. **These are complete landscape images, NOT independently reconstructed 3D mountains/water.** Camera movement is real perspective positioning but depth movement of individual elements is limited.
3. **Material change** — first valley image `camera-valley-v1.png` with paired `camera-valley-paper-v1.png`; same UV/image composition, shader blends materials with irregular spatial progression. This PAPER treatment is **provisional, not user-approved final style**. Other five worlds use their regular plates as both inputs, so **they do not each have a matched PAPER transformation**.
4. **World handoff** — `PortalMaterialScene.tsx` moves destination film from the left; its three travelers and trailing world-front are jointly aligned by the same transform. The outgoing world is clipped/displaced to the right. `scenes/portal-study/RiftBoundary.tsx` draws textured edge effects, and `../emulsion-field.ts` supports the film-aligned contour. Fixed film rails stay screen-aligned while sprocket holes scroll. The user's instruction is to **leave this working transition mechanism unchanged for now**.
5. **Finale** — from 211.467 s the three travelers and their paths continue without a new landscape.

**Core source-of-truth files:**
- `scenes/portal-study/film-cue-sheet.json`: current six-world time ranges, music events, accents, camera speed envelopes.
- `scenes/portal-study/film-state.ts`: frame-based per-world index, entry/travel/return, deterministic camera movement.
- `scenes/portal-study/study-state.ts` and `music-camera.json`: original valley study / paper blend timing, reused by the cycle.
- `scenes/portal-study/CAMERA-MUSIC-CUE-SHEET.md`: exact world boundaries with readable musical/narrative context.
- `scenes/portal-study/README.md` and `VERIFICATION.md`: historical implementation/verification detail; their older opening descriptions refer to prior stages and may not reflect the newest six-world compositor.
- `director-shot-plan.json`: eight lyric-oriented sections and 59 original shot *entries*. `cinematic-shot-board-v1.json` supplies proposed visual intents. **These proposals are not 59 finished cinematic camera shots in the live preview.**

## 3. Real six worlds and timing (current LIVE code)

| World | World entry | World fullscreen / exploration | Return starts | Next hub | Image file |
|---|---:|---:|---:|---:|---|
| **01 · Valley** — initial hardship, decision to move | 3.700 s | 10.800 s | 52.333 s | 54.967 s | `assets/camera-valley-v1.png` |
| **02 · Harbor** — decision / carrying on | 57.600 s | 61.100 s | 93.467 s | 96.967 s | `assets/camera-harbor-v1.png` |
| **03 · Desert** — rejection, perseverance | 99.567 s | 103.067 s | 135.267 s | 138.767 s | `assets/camera-desert-v1.png` |
| **04 · Forest** — steady growth | 141.400 s | 144.867 s | 163.267 s | 166.733 s | `assets/camera-forest-v1.png` |
| **05 · Ice** — vulnerability / endurance | 169.367 s | 172.867 s | 177.233 s | 180.733 s | `assets/camera-ice-v1.png` |
| **06 · Cloud citadel** — final chorus, momentum | 183.367 s | 186.900 s | 207.033 s | 210.533 s | `assets/camera-cloud-v1.png` |

- Global **hub starts** for the six worlds: 0.000, 55.200, 97.867, 139.733, 167.733, 181.600 s.
- **Outro:** 211.467–239.967 s, only globally timed travelers/film; no seventh landscape.
- **Valley paper morph:** approximately **16.533–30.533 s**; same landscape composition with material-change shader.
- Exact durations / beat-linked easing are taken from `film-cue-sheet.json`, not hardcoded from this README.

## 4. What changed in the LAST verified commit

**`8fa358c5ec720baaeec02efa87ff5bccdeef0d30` — “Complete music-driven world cycle with distinct landscapes and traveler finale” (17 files).** The actual changes include:

- Five **new landscape plate assets**: harbor, desert, forest, ice, cloud. Valley and valley-paper plates already existed.
- Active `PortalMaterialScene.tsx` changed from one valley/paper reference to a cycle selecting six source images, with a world-specific camera plane and outgoing world clipped by a curved forward frontier.
- `film-state.ts` and `film-cue-sheet.json` added for per-world state, musical accents and six complete excursions.
- `RestoredFilmHub.tsx` supports incoming-world images, route extension, and final travelers-only mode.
- `RiftBoundary.tsx`, `StudyLyrics.tsx`, `study-state.ts`, local tests and verification notes updated.
- `CAMERA-MUSIC-CUE-SHEET.md` created with entry/fullscreen/return timestamps for all six worlds.
- Main project README appended the six-world note. It **previously** contained multiple conflicting descriptions of older 30-second proofs; this handoff replaces it.

**Not verified here:** Electron video playback, footage export, full-song listening or pixel-level comparison after that commit. Do not state “all six scenes render perfectly” based solely on the Git tree.

## 5. What is LOCKED / do NOT change next

**Current user decision:** Transitions and continuity between worlds are **good enough for this production stage**. Some details are aesthetically imperfect, but do **not** start another portal/zoom/push rewrite without explicit instruction.

Keep unchanged unless expressly asked:
- `Composition.tsx` component mapping, film hub continuity, portal and handoff physics, `film-state.ts` camera timing, `film-cue-sheet.json`.
- Music files and paths, `media.json`, `edit-timeline.json`, subtitles and vocal timing guides, music/vocal analysis.
- Existing source images until new approved art is available; retain old assets and a reversible way to compare.

Always inspect local uncommitted changes and confirm which branch Electron actually runs before committing or pulling. **GitHub changes do not automatically refresh a working local desktop copy.**

## 6. Next milestone — WORLD VISUAL BIBLE + APPROVED ASSET / LIGHT PLAN

**The next work is world appearance, not transition effects.** For each of the SIX active worlds, define a concrete and individually recognizable design, tied to the lyric passage it covers:

- **Narrative:** relevant words, emotion, what visibly happens there; avoid randomly spectacular scenery.
- **Composition:** main subject; what is behind / middle / near the camera; safe areas for subtitles, traveler paths and the active moving frontier.
- **Lighting:** time of day, key-light angle, fill level, rim/edge, volumetric mist, reflection highlights, color temperature and contrast progression.
- **Color/material:** coherent palette, atmospheric perspective, texture language, cinematic look rather than gaming gloss.
- **Art inventory:** existing source plate, replacement/reference image candidate, clean backplate, alpha cutouts for distant/mid/near masses, water, light shafts, mist, person/prop photos, material variants, masks/shadows where relevant.
- **Animation:** independently drifting atmosphere, water/reflections, foreground occlusion, restrained beat-related lighting; all effects should derive from absolute music time.
- **Camera depth:** decide which objects actually need separated layers and depth placement. Never claim a duplicated / color-treated image is a complete 2.5D reconstruction.
- **Acceptance:** storyboard still of the world at a named time + preview of the SAME active scene with lighting, modest camera movement and no broken entrance/exit.

**First world (Valley) has priority for detailed art:** retain broad geographic silhouette/anchor so the existing camera and PAPER morph remain coherent. Before replacing the old baked bridge, define clean bridge-free background and separate bridge geometry. Do not replace the matched paper plate without planning registration or a controlled morph update.

**STILL PAPER target:** actual tactile cut-paper collage, dimensional stacks, shadows, printed photographs of people, objects linked to lyrics (bills, phone, interview letter, notes). Today's first paper variant is only a textural study, not the intended final human storytelling scene. **FUTURISTIC DIGITAL / creator screens** is a future art direction concept, **not a seventh implemented world** in current film cycle; decide how to attach it to the existing six before claiming it exists.

### Pending decisions (must be recorded before generating/replacing art)

1. For each world: definitive visual reference/composition; preserve current one or replace?
2. Valley: how to create clean alpha-separated layers and remove baked bridge without a visible mismatch?
3. Which specific lyric shots need people, photos and practical props in PAPER vs world scenery?
4. Where and when should FUTURISTIC DIGITAL / creator world be integrated while preserving the six-world timing?
5. Which beat accents should affect lighting or movement (not every transient)?
6. Which old image pair must morph while retaining matching silhouettes and UV registration?

### Immediate agent deliverables

1. Inspect the current *active* scene in `PortalMaterialScene.tsx` and `film-cue-sheet.json`.
2. Prepare six world design cards: `SECTION → WORLD → LYRIC → MOOD → KEY LIGHT → FILL → BACKGROUND → MIDGROUND → FOREGROUND → PROPS → MOTION → ASSETS`.
3. Assign image/reference slots to actual shot entries. Mark approved / pending / placeholder; don't imply artwork is already prepared.
4. After user approves visual direction, modify ONLY world art / lighting components. Preserve portal/film-camera logic.
5. Verify the scene appears in Electron and capture before/after at entry, middle and return; don't just report changed source files.
6. Move to the next world in batches, with progress expressed as actual timestamped scene coverage.

## 7. Practical workflow for another AI

1. `git status --short`, `git branch --show-current` locally; note uncommitted work before pull/reset.
2. Confirm `Composition.tsx` imports and `edit-timeline.json` clip IDs; never assume a similarly named old source is active.
3. Read `film-cue-sheet.json` then `PortalMaterialScene.tsx`, `RestoredFilmHub.tsx`, `RiftBoundary.tsx`.
4. To preview: use the project's normal Electron/Remotion player; seek to **2, 7, 12, 24, 35, 53, 56, 62, 104, 145, 174, 189, 209 and 220 seconds**.
5. Existing documentation lists a local TypeScript target and tests: `npx tsc --noEmit -p projects/mai-departe-cinematic-v1/scenes/portal-study/tsconfig.json`; `npx tsx --test projects/mai-departe-cinematic-v1/scenes/portal-study/study.test.ts`. Run after code changes; previously reported results are historical, not proof of current branch health.
6. Test entire song, reverse seeks across clip 900, film-state handoffs, subtitle continuity and export before announcing a release-ready video.
7. Update this README with **checked commit SHA and actual changes** whenever a new implementation batch modifies live scene architecture.

## 8. Historical references (not the current runtime)

- `scenes/JourneyReveal.tsx`, `JourneyWorld.tsx`, `CameraDirector.tsx`, `PortalAperture.ts`, `RiftPushTransition.ts`: earlier V3 experiments/proofs; may contain useful code but **not the active video implementation**.
- `camera-integration/README.md`, `reveal-integration/README.md`, `docs/MAI-DEPARTE-V3-IMPLEMENTATION-LOG.md`: useful history; don't mistake older demonstration timings for active ones.
- `docs/MAI-DEPARTE-SECTIONS-AND-59-SHOTS.md`: lyric shot outline and concepts; must be reconciled against six-world director, not assumed to be implemented.
- `scenes/portal-study/CAMERA-MUSIC-CUE-SHEET.md`: concise current timing reference; JSON is authoritative.

**Bottom line for the incoming developer:** the **six-world scene cycle and transitions already exist** as code and are frozen for now. We are now selecting **exact world designs, lighting, photographic assets, segmented depth layers and human PAPER imagery**, then integrating them in the live composition without breaking continuity. 

## 2026-10-31 — Film transport / edge reveal polish (after handoff commit `1ffe1ae`)

**Snapshot / rollback:** the documentation commit `1ffe1aeb565ba9e336f3385863b123f05a289ba0` is the baseline for this patch. Changes were made in isolated commits; they do not alter the six-world timing file, the edit timeline, soundtrack, subtitles, transition geometry, or source plates.

**11.767-second diagnosis:** active first world is still `assets/camera-valley-v1.png`, not a newly loaded image. Entry finishes at **10.800 s**, removing the `RestoredFilmHub` entrance overlay and leaving the fullscreen ThreeCanvas textured plane. Thus the image can visibly shift from luminous emulsion/reveal styling to the simpler world shader/camera. Actual `camera-valley-paper-v1.png` morph begins at **16.533 s** and ends at **30.533 s**. That composition/lighting seam remains an art-review issue; a screenshot or Electron render is required to judge it visually. No claim of an image switch at 11.767 s.

**Implemented in ACTIVE scene:**
- `scenes/portal-study/film-transport.ts`: reusable absolute-time film-strip transport based on the **six** cue-sheet entry-complete and exit-start time pairs. Perforations stop when the camera has fully entered a world; restart when travelers reappear. Phase and cumulative paused transport are pure functions; seek-back is stable.
- `scenes/portal-study/PortalMaterialScene.tsx`: fixed screen-space perforations use `transportSeconds(state.time)` instead of raw music time. Rail geometry stays visible and fixed; only the rolling sprocket pattern parks/resumes. Music/three traveling markers remain driven by original global audio time.
- `scenes/portal-study/RestoredFilmHub.tsx`: subtle world-photo optical drift inside existing emulsion mask, maintaining the same reveal edge. No new plate, no forced zoom-to-fit, no rebuilt boundaries.
- `scenes/portal-study/film-transport.test.ts`: source tests for all six stop/start pairs, random seeking, monotonicity.

**Test visually**: 7 s entering first world; 10.7, **11.767**, 12.5 s for world handoff visual mismatch; 15 s for parked rail; 52.3–55 s for film restarting with the three travelers; 62–93 s for second world's frozen sprockets; 209–212 s for finale. Check that the current six-world reveal/frontier geometry is unaltered. No local Electron preview or compile was run through the GitHub-only session, so no runtime passing claim is made.

**Further art work**: If the sudden brightness/rigidity at 11.767 s is still distracting, tune the lighting/texture grade between the emulsion overlay and the actual Three.js background **after looking at a frame-pair from the app**. Avoid substituting a different landscape file or changing transition geometry.

## 2026-10-31 — Shared world reveal / automatic image life / reframe

**Baseline before this batch:** `8e0ecfac981903c3d9382d217bd631efd5808034`. Changes are isolated in following commits.

- `scenes/portal-study/world-reveal-director.ts` **NEW** — derives reusable `entry`, `fullReveal`, `edgeEnergy`, `settle`, `returnProgress`, `exposure`, `shimmer`, `forward`, `driftX/Y` and `centerX/Y` from the *existing* six-world `film-cue-sheet.json` + `filmState()`. No manual scene-specific time offsets or local playback timers.
- Active `scenes/portal-study/PortalMaterialScene.tsx`: `BackgroundWorld` uses those common controls to animate a source-image shader: near pixels get slightly more optical travel than distant pixels, local sunlight/reflected highlights evolve, and the Three.js camera `lookAt` progressively compensates/recenters the landscape. Movement is deliberately restrained so it doesn't crop the photograph or disrupt the valley PAPER morph. Markup has `data-world-reveal`/`data-reveal-energy` for inspection.
- `scenes/portal-study/world-reveal-director.test.ts` **NEW** — boundary/finite/deterministic checks for all six worlds and arbitrary seeks.
- **No changes** to the original film rift geometry, six-world order, music/analysis, subtitle timings, or timeline. **No new image or generated art**. Existing revealed image remains a single textured plane rather than separated alpha-geometry; faux depth motion is a preview-stage enhancement, not true parallax.
- **Check** 7–12 s for active first reveal and change at 10.8; 25 s for optical life during valley PAPER grading; 53–55 s return; 61–93 s harbor; 103–135 s desert, and one midpoint in every later world. Check that no image drifts outside its frame and that light does not pulse abruptly.
- **Status:** GitHub commits only; neither local Electron rendering nor TypeScript/test execution is claimed. Verify the result before accepting the animation as finished. The older full-world lighting seam ~11.767 s remains eligible for image-grade matching after screenshot comparison.

## 2026-10-31 — Traveler-led reveal and new-world black-frame protection

**Baseline:** `65ab0d4f3d65f01d3dd8f164821e4b92f59772e7`. Two user-identified separate concerns:
1. The portion of the *photo already revealed on the travelers' road* seemed static; movement of the full 3D-world camera did not solve that.
2. Near 97.867s, the transition into the next world sometimes appeared to flash black or wipe into the same landscape twice. This occurs at a world boundary where source images/GL uniforms swap and a new world's entry overlay begins. The exact browser-render cause cannot be confirmed from Git source alone.

**Changes (active scene path):**
- New shared `scenes/portal-study/traveler-reveal-motion.ts`: returns film-space motion synchronized to entry or return progress in the saved six-world cue sheet; it increases discoverable optical movement at the beginning and **settles to scale 1 and zero translation before full-world arrival**, reducing visual snap. Deterministic on frame seeks.
- `RestoredFilmHub.tsx`: discovered image uses shared traversal transform and modest exposure, replacing the imperceptible old image drift. The masks/curves still use existing emulsion coordinates.
- `PortalMaterialScene.tsx`: shared entry motion is also applied to the active image shader. The current full source image sits **below** the transparent ThreeCanvas within the existing world clipping layer, so shader/texture initialization has a matching source picture to show rather than a black backing. Existing active rift geometry and world index logic remain untouched.
- New `traveler-reveal-motion.test.ts` checks the shared behavior for all six worlds.

**Important:** This is still **movement of complete images**, not newly split mountains/water/vegetation and not camera direction for each world. The user's next task is to design each individual 3D scene separately. There is no evidence here that the reported frame-black flash is fixed in Electron: visually test 97.80–98.20s and each world boundary, ideally frame-by-frame, before marking it resolved. The full world art / lighting remains pending.

## 2026-10-31 — Live world reveal architecture + shared audio-directed camera (experimental)

**Rollback baseline:** `7b0af777db15d19c5d2de3a84e9d76b0f5baaee1`. This batch changes the active runtime path only and is deliberately separate from the six-world cue timings, soundtrack, subtitles, stored timeline, and original photographic plates.

**Architectural correction:** the three travelers' film must reveal the **actual Three.js world**, not a duplicate HTML `<img>` that later switches to a separate 3D image with different zoom/lighting. `RestoredFilmHub.tsx` now accepts `worldLayer` for a live Three.js view inside its existing organic emulsion mask. `PortalMaterialScene.tsx` provides that live `WorldCanvas` for the destination of a returning film, while the current world's existing Three.js canvas is already visible through the entry film's `openWorld` mask. `WorldCanvas` is shared for both uses: identical plane, material, shader, camera calculations and source image. No extra photo motion or CSS zoom in the active reveal.
 
**Audio camera:** new `world-camera-director.ts` provides a single deterministic `worldCameraAt(frame, worldIndex)` for all six worlds, reading `film-cue-sheet.json`: entry retreat from a closer framing to full landscape by entry end, then a seeded example pan/forward dolly with bounded responses to actual saved accents. Seeded direction provides different movement by world without live randomness, and no additional per-world implementation. This is a **demonstration camera move**, not the final shot direction. It is evaluated at the same global timestamp during a return and the following world's entry, clamped to the next world's start for prewarming.

**World lifecycle:** at the transition, the old world is shown in its existing outgoing clipped layer and the next world's live canvas is shown behind the incoming film mask. Once `state.returning >= 1`, the old world canvas unmounts via existing condition; the destination world remains revealed by the film. Note: the destination canvas is currently instantiated in a different React tree at the subsequent global world boundary, so the renderer/WebGL context can remount. The camera pose comes from the same absolute-time controller, but resource persistence and cache reuse are not yet guaranteed. This is *not* a claim of a single persistent WebGL renderer yet. Future optimization: lift an always-mounted world stage above the two mask regions, preserve the world keyed instance during transition, explicitly manage GPU resource retention and texture disposal.

**Source changes:**
- `scenes/portal-study/world-camera-director.ts` — shared musical camera.
- `scenes/portal-study/RestoredFilmHub.tsx` — accepts masked React Three world layer; no photo duplicate in active transition.
- `scenes/portal-study/PortalMaterialScene.tsx` — live world renderer reused in full and return film; previously existing entry overlay is kept.
- `scenes/portal-study/world-camera-director.test.ts` — deterministic camera, entry retreat, next-world framing and seek tests.

**Inspect in Electron:** 7–12 s first valley reveal; 52–62 s return into harbor; 93–104 s harbor→desert and specifically 97.867 s for any renderer remount flash; seek backward repeatedly; check exposed image/camera/light and edge alignment. Because the live environment was not available through this GitHub connection, the behavior has NOT been compiled, rendered or observed in Electron. Do not call the flicker fixed until visual frame-by-frame inspection succeeds.

## 2026-10-31 — Continuous reveal grade / destination camera prelude

**Baseline:** `d7584f7ec5c0eb701a2f247b89fffe7ec5459716`.

User reported a static destination landscape while travelers pass, a black frame near successive world switches and color snapping when film reveal becomes fullscreen 3D.

**Confirmed from source and changed:**
- `RestoredFilmHub.tsx` had `FilmLifeOverlay` and `DarkFilmAtmosphere` fully active until the component vanished. New optional `revealFinish` fades both progressively during the last 40% of the existing entry envelope, using the existing active cue timing. This removes the *abrupt post-effect cut*, but the other film visual elements remain (grid, particles, dark film ground).
- `PortalMaterialScene.tsx` passes `revealFinish` from its current world's `state.entry`; it does not change cue-sheet data.
- `world-camera-director.ts` previously used `Math.max(world.start,time)`, freezing the NEXT world camera while it was already visible in the preceding world's return reveal. It now performs a deterministic small camera movement throughout the previous world's exit-to-next-world-start interval, converging continuously to the next world's entry pose. This is real Three.js camera motion in the live world, not an HTML image zoom.
- `world-camera-director.test.ts` updated to check pre-entry motion and pose continuity.

**Unresolved/important:** There are still separate `ThreeCanvas` component instances for the destination while returning and for full-world exploration after the global world index changes. Unmount/remount may trigger GPU initialization flashes; a guaranteed flash-free pipeline requires a persistent canvas or explicitly managed compositing and prewarming, with Electron frame-by-frame verification. **Do not claim that the reported black frames are resolved by the changes above.** Do not add more duplicate static-image cover-ups or CSS zooms to conceal the issue. Original audio, 3 travelers, stored timings and film boundary geometry remain unchanged.

**Review:** 52.3–62 s and 93.4–104 s, especially 97.867 s, then every world boundary. At entry completion verify that atmospheric color treatment disappears gradually rather than in one frame. GitHub commits alone do not establish runtime behavior.

## 2026-10-31 — Stationary fullscreen world layers; film-only swipe (structural correction)

**Rollback baseline:** `c6e9c118de5675ad26e5de7096b4a5191bb88ce1`.

User-established model: world N+1 must already occupy the FULL screen behind the travelers, even before the world is visible. The world does **not** slide from the left. The FILM and its shaped mask alone translate, while old world N is occluded/pushed out to the right and unmounted only when no longer visible.

**Active composition change:** `PortalMaterialScene.tsx` now mounts world canvases as stationary fullscreen layers keyed by world index, with visibility windows from previous world's return start to the world's exit completion. Old world receives the existing outgoing-world clip; destination stage remains fixed at (0,0) and is revealed by `RestoredFilmHub`'s `openWorld` mask. The translated element now contains ONLY the film and travelers; `WorldCanvas` is no longer a child of translated `RestoredFilmHub`. During the global world-index switch, destination's world-index React key is preserved so the same ThreeCanvas may remain mounted; camera position continues to be computed from global song time.

This is still *two independent ThreeCanvas instances during overlap*, not yet one permanent WebGL context. GPU initialization and visibility must be tested carefully; the user-reported black frame is not verified resolved in Electron. Note all film FX outside the organic mask and any film atmosphere layers still require visual grade verification. No image, audio, cue timing, or transition contour changed. Verify frame-by-frame at 54.9–55.3 s and 96.9–98.1 s, then remaining world boundaries. If black frames remain, inspect the GPU initialization/scene mounting rather than replacing images or adding more photo zoom effects.

## 2026-10-31 — NEW ACTIVE CUT: four 3D worlds + real traveler-only scenes

**Important: this section supersedes the six-world ACTIVE runtime description above.** Historical files and six landscape assets remain available for rollback and later art direction. The current source path was deliberately switched to a new, smaller scene director.

**Before-edit rollback:** `471cfdf55f496f8ee7968cd723142d89d544256d` (specification after old six-world implementation). All later changes in this batch are separate commits. No audio or subtitle changes.

- `Composition.tsx` now imports `scenes/portal-study/JourneyCutScene.tsx` for the existing visual component IDs.
- `edit-timeline.json` has ONE continuous `director-journey-full-film` visual clip, frames 0–7198, replacing the old 900-frame proof and 6299-frame legacy continuation to avoid a React/ThreeCanvas reset at 30 seconds. Other 59 clips are retained as they were (captions etc.).
- `journey-cut.ts` is the new **authoritative proposed cut** (all times at 30fps), with explicit `hub`, `reveal`, `explore`, `close` phases and one 3D stage maximum. Changing world count or lyric timing is a centralized data change.
- The HUB grid and audio guide curves stay **stationary in screen space**. Only the markers travel in X, with Y from the original saved `motion-guides.json` by global time.
- During solo HUB, travelers advance from 0 to 60% of the road; **no 3D canvas is mounted**. During the next world reveal, travelers advance from 60% to 100% while a masked, fixed, full-screen 3D scene opens behind them.
- During a world closure, the travelers cross the frame while the **old world's mask** closes from left to right; the old world unmounts at 0 visible pixels. Only after closing is there a long HUB scene and later a reveal. No old+new world overlap.
- Camera is a **temporary music-cued proof**: pulls back during reveal, then uses a deterministic per-world pan/dolly and short pulses from the original `film-cue-sheet.json` accents. It is NOT final camera direction or a fully separated 2.5D environment.
- The old six-world `PortalMaterialScene.tsx`, `film-state.ts`, original `film-cue-sheet.json`, source assets, etc. were not deleted: retained as reference.

### New suggested full-song scene map

| Time (s) | Type | Meaning |
|---|---|---|
| 0–27.267 | HUB SOLO | Instrumental opening and first lines; no 3D world |
| 27.267–33.967 | 3D REVEAL | Valley (burden/promise) |
| 33.967–51.867 | 3D EXPLORE | Valley; bills, call, hesitation |
| 51.867–55.200 | 3D CLOSE | Close valley on last burden line |
| 55.200–73.267 | HUB SOLO | Fear and decision; travelers have narrative space |
| 73.267–80.300 | 3D REVEAL | Harbor; main chorus begins |
| 80.300–94.267 | 3D EXPLORE | Harbor; driving forward |
| 94.267–97.867 | 3D CLOSE | Harbor returns to film |
| 97.867–139.733 | HUB SOLO | Rejection, learning, persistence, pre-chorus; **no desert 3D stage** |
| 139.733–144.867 | 3D REVEAL | Forest; chorus |
| 144.867–163.267 | 3D EXPLORE | Forest; keep going |
| 163.267–167.733 | 3D CLOSE | Forest recedes |
| 167.733–186.900 | HUB SOLO | Quiet bridge and opening of final chorus |
| 186.900–193.700 | 3D REVEAL | Cloud citadel; chorus crescendo |
| 193.700–207.033 | 3D EXPLORE | Cloud citadel |
| 207.033–211.467 | 3D CLOSE | Cloud citadel fades to HUB |
| 211.467–239.967 | HUB SOLO | Ending with only travelers — no next world |

**4 of the previous 6 worlds are used:** Valley, Harbor, Forest, Cloud. Desert and Ice are no longer rendered in the active cut (assets stay available). All boundaries are editorial PROPOSALS based on known source lyric/shot boundaries, awaiting listening and in-app review; not newly validated frame-accurate vocal alignment. No lyric cue was modified.

### Checkpoints and caveats

Inspect 0–13; 26.9–34; 51–56; 69–81; 94–100; 139–145; 167–188; 206–213 and 220–240 s. Confirm at **30 s** that the same ThreeCanvas continues through the old clip split, at **97.867 s** no 3D scene is mounted, that fixed HUB lines never translate, and that every world closure fully removes the scene before next discovery. Check direct seek and reverse seek.

This batch is GitHub-source implementation only; NO Electron playback, TypeScript build, or video export was performed. Do not claim the new design visually passes until local review. The mask edge and film appearance are a simplified proof, not the final prior film texture effects. Future work: decide final 2D storytelling, number/timing of worlds with the song in hand, and cinematic cameras/lighting/assets.

## 2026-10-31 — Rider/reveal synchronization and luminous rupture restored

Following preview screenshots showing the basic single-stroke edge overtaking the three markers, the active four-world cut was updated. **No music, world counts, subtitle cues or 3D world overlap were changed.**

- In `journey-cut.ts`, travelers enter each reveal at X=1152 (60% width), advance beyond the right edge during the first 38% of the musical reveal interval, and then stay offscreen while the reveal contour continues to open on the saved timeline. The new opening edge is music-timed but no longer permitted to overtake on-screen markers.
- During old-world closure, travelers enter from the left first; the mask begins closing only after about 58% of that crossing. They lead the contour rather than riding a slide.
- In `JourneyCutScene.tsx`, reinstated the original `RiftBoundary` with its glow, layered filaments, specks and animated strand texture; its `sampleAt` explicitly samples the **same organic edge geometry** as the clipping polygon, avoiding a separately animated ornamental line.
- Added a unit regression checking separation of frontier and visible riders and checking late closure.
- This is a provisional choreography; actual Electron preview and tests **were not executed** via GitHub. Verify first reveal 27–34s, later reveals 73–80, 139–145 and 187–194s; check old-world closures as well.

Previous four-world baseline: `5aa398409dd285a5158b1c47987042444bb0d748`.

## 2026-10-31 — Fix source of rider/curve desynchronization and artificial sprint

The active four-world `JourneyCutScene.tsx` formerly drew each visible line with `pathY(time+(x-960)/roadSpeed, i)` but the marker at X used `pathY(time,i)`. Those are DIFFERENT positions except at X=960, therefore riders visibly detached from displayed curves. Both now sample **the same `visibleRoadY(time,x,i)` helper**.

In `journey-cut.ts` the reveal rider X is now linear over its reserved music interval, not an accelerated smoothstep saturating at 38% of the reveal. The opening frontier also progresses linearly over the same interval, stays behind visible riders, and continues as riders depart. The outgoing old-world closure has a small 20% lead before the frontier starts (instead of an aggressive late snap).

`edgeX` now uses irregular multiscale harmonics; both the CSS clip polygon and original `RiftBoundary` filaments/particles draw from the SAME edgeX. Full-height 145 samples align the mask and the rift geometry. Old-world photos and two-ThreeCanvas overlap are not restored.

Commit baseline preceding these changes: `c0085100c636ce1ae08a8b9e7c04e1c11ca7edb5`. Verify in Electron, especially the first reveal at 27–34s, old-world closure at 51–55s and late reveals. No runtime preview or tests were executed through remote GitHub; visually verify the exact edge and camera. The future creative design can introduce physically authored edge textures beyond the current procedural multi-strand glow.

## 2026-10-31 — Actual root cause of split rider marker and scene-entry speed boost

The previous fix updated only the 28px glow circle to `visibleRoadY(time,travelerX,index)`; the three INNER circles still used `pathY(time,index)`, causing visible marker/line desynchronization. Now **all four concentric circles** use the exact same `visibleRoadY` that the displayed line uses.

Previously `journeyAt` computed HUB traveler X from `progress*1152` and reveal X from `1152+1400*revealProgress`. Those had dramatically different px/s velocities and thus produced a boost at reveal begin. Now `approach(next,hubStart,time)` computes X from ABSOLUTE SONG TIME and a per-journey constant px/s speed, used identically for HUB, REVEAL and EXPLORE; 3D camera/reveal variables cannot influence X. Travelers persist into exploration until they leave viewport naturally, instead of popping at the reveal/full threshold. Old-world CLOSE remains a separate entrance choreography requiring future edit against song timing.

Added a regression in `journey-cut.test.ts` for position and velocity continuity at each HUB->REVEAL boundary and position continuity around REVEAL->EXPLORE. NOTE: no local Electron render or test execution available from GitHub edits, and some aesthetic/timing problems may remain. New baseline for this fix: `f855f75bd6377e0dfc05727fae8bc7234cbfbe69`.

## 2026-10-31 — Initial traveler origin and road time origin corrected

Preview showed riders at X≈30 near the start and the first ~half of each visible path as an implausibly flat line. Root causes:
- `approach()` previously used `Math.max(1152/hubDuration,768/available)`, allowing a faster reveal-imposed velocity that made rider X start *before* zero and changed the intended origin. Now each HUB starts strictly X=0 at its first music frame, continues at a single constant `1152/hubDuration` px/s through reveal and exploration. The camera and portal cannot modify rider speed.
- `visibleRoadY()` sampled `time+(x-960)/roadSpeed` and clamped negatives to zero. At the beginning this drew the first half-screen as a constant Y line regardless of musical variation. It now samples `time+x/roadSpeed` from the left edge. The same function remains the single source for ALL concentric rider circles and all visible line points.
- Added start-of-HUB and 60%-entry checks to `journey-cut.test.ts` (not executed in Electron).

This changes the displayed path time window; verify musical subjective feel and the first 0–10 seconds before further art direction. GitHub source edits were not compiled or rendered on the user's Electron machine. Rollback baseline `9b0922315ea816dacb15aae7972ebb93e875bb6f`.

### Follow-up correction: fixed rail is an inverse of absolute song-time rider position
Further inspection: simply shifting the sample window to `time+x/roadSpeed` still made the road scroll in DATA with current time, even without CSS translation. The active `JourneyCutScene` now uses `roadTimeAt(time,x)`: each fixed X coordinate maps to its immutable absolute music time for that HUB/reveal passage, with the same exact px/s velocity used by `journeyAt().travelerX`. Thus at the actual rider X, the line Y is `pathY(currentSongTime)` by construction. Separate mappings are used for the closure entrance and final HUB. The same function draws lines and all 4 rider circles.

This is the intended architecture for static 2D musical paths; no viewport center offset, global time shift, or reveal progress enters the rider's vertical position. Validate the visuals and tests locally before confirming.

## 2026-10-31 — Fixed swapped 2D timelines on CLOSURE → HUB → REVEAL

Four screenshots showed a distinct set of three riders on world closure, followed by a different set on HUB solo; the plotted curves jumped at the transition. This was an actual bug in the preceding `roadTimeAt` function: `close` used `w.close+(x+120)/speed`; HUB used `previousWorld.end+x/speed`; REVEAL used `previousWorld.end+x/speed`. Also `journeyAt` previously reset rider X on close.

**New source-of-truth:** `travelerPassage(time)` in `journey-cut.ts` defines a passage from previous-world **close start** through HUB and the **next** world's reveal/exploration, ending only when that next world begins closing. Both the marker's `travelerXAt(time)` and the plotted curve `roadTimeAt(time,x)` use the same passage start and speed, with song-global absolute time. World camera, renderer and clip masks use separate parameters but cannot change musical line data or traveler velocity. The next passage starts once, at the new world close start, even though that world is still visible.

The four-world song cut, audio, subtitles, textures and masking were not changed in this fix. Added closure→HUB and HUB→REVEAL clock continuity regression source tests (NOT EXECUTED); Electron verification needed at 51.8–55.3s and 94.2–98s, as well as intro and next reveals. Baseline before change: `8dd19fd4a922f96e34980300e4e1a031eb22fedb`.

## 2026-10-31 — Shorter HUB wait and three modular flying actors

**Active four-world cut update.** Music/lyric section timing was shifted to let initial solo passage last about 10–14 seconds, not 27–42 seconds: starts of 3D reveals are now 12.8, 62.267, 108.3, 177.233s; full reveal at 20.133, 69.933, 118.467, 186.9s. Four worlds retained; closing and ending timestamps unchanged. These are editorial trial positions from existing song phrase boundary data, to preview against actual vocals.

`traveler-choreography.ts` now provides `travelerPoseAt(time,index)` for three independently staged glowing orbs: detach at staggered times, scale up, make deterministic music-time flights, and blend back to their canonical road coordinates/scale BEFORE world closure. `JourneyCutScene.tsx` draws each performer in its own transformed SVG group over the fixed road and world. Crucially, `journey-cut.ts` remains the authority for musical road time, and no actor poses affect the world mask or camera.

The prototype actors are STILL screen-space SVG orbs layered above the Three.js world; this is **not yet genuine in-world geometry or 3D parallax**. Their future `costume` property is reserved for visual character / alpha-texture substitution without altering the time model. The current screenshots' narrative and world assets remain provisional. Source tests for staggered flight and pre-close rejoin are added, but not executed in Electron. Check first 8–25s and all handoffs for the subjective result.

## 2026-10-31 — Reverse the successful reveal choreography at exit

User confirmed that launch, staggered orb flight, arrival reveal speed, and 3D exploration work; exit was too fast and orbs escaped toward the right instead of rejoining. Active fixes:

- `journey-cut.ts`: every world now starts closing at `end-(full-enter)`, so outgoing mask duration **exactly equals** opening mask duration. Both use the same linear progress curve in reverse (the earlier 20% waiting window on closure is gone). No overlapping WebGL world stages.
- `traveler-choreography.ts`: three actors stay detached through exploration and **gradually reattach during close**, in reverse departure order, with the same screen-space character flight / scale transitioning back to each orb's exact audio-road `home` position. No separate exit toward the right.
- `JourneyCutScene.tsx`: camera undoes its reveal/explore framing over the whole closing window rather than instantly cutting or leaving the world zoomed. Note the camera choreography is provisional and still uses a flat photographic 3D plate.
- `traveler-choreography.test.ts`: assertions updated for reattachment DURING close, inverse stagger, equal close/reveal duration.
- Exact music, subtitles, four 3D worlds and HUB structure remain unchanged. Scene closing starts earlier to preserve end boundaries, so exploration is shorter by a few seconds; this is intentional.

Preview these exact windows: Valley **47.867–55.200**, Harbor **90.200–97.867**, Forest **157.567–167.733**, Cloud **201.800–211.467**. Confirm at the start of each window points are still free in the 3D world, their scale drops gradually, and their final positions coincide with original song lines; no x-axis sprint. Remote changes were not executed in Electron or via local tests. Baseline before this change: `e82bd7c633cd19522a6373eeb1e5eb78ac29b6e0`.
