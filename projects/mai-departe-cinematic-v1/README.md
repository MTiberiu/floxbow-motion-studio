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
