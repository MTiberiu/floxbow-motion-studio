# Mai departe — Cinematic Reveal V3: implementation decisions & evidence

**Status:** incremental in-repository implementation; not yet certified in Electron.  
**Branch:** `feat/storyboard-director-ux-v2`  
**Protected:** audio, `media.json`, `edit-timeline.json`, subtitles, guides, 3 path values, shared FloxBow app.

This is the running decision log. Every change must answer four questions:
1. **Observed problem** — what the viewer sees that breaks the illusion.
2. **Actual cause** — source file and technical reason, not a hypothetical diagnosis.
3. **Modification + intent** — why this code is better than another surface effect.
4. **Acceptance / remaining gap** — what a developer can actually verify, and what is still unfinished.

## 2026-10-30 — V3 baseline reviewed from GitHub source

### 1. Portal
**Problem:** Film-to-world entry reads as a graphic mask / digital transition, not a physical rupture through which the camera travels.

**Cause:** `CameraDirector.tsx` masks a second ThreeCanvas with a CSS `clip-path`. `PortalAperture.ts` grows this polygon, but its transformation is not a perspective projection of physical edge geometry. This remains a 2D opening, even after linking its center to `frontierX`.

**Current modification:** Moving tear position tied to `emulsion-field.ts`; char lip rendered on the exact polygon vertices. This is a better spatial editorial cue than a fixed-centre vignette and avoids lip/mask separation.

**Not solved:** Still a projected 2D mask, NOT a truly three-dimensional membrane passing the camera. Fullscreen image is a prepared 2.5D view, not a reconstructable geometry of the original valley.

### 2. Moving world beneath reveal
**Problem:** Revealed scenery feels frozen while the three paths advance.

**Cause:** Original `CinematicPlate` used a single HTML image with minimal 8px oscillation, and `CameraWorld` had a giant photo plane. The mask was alive, the image beneath it mostly still.

**Current modification:** `CinematicPlateV3.tsx` moves sky/mountain/water zones at separate rates while remaining entirely clipped by the existing JourneyWorld/emulsion mask. Camera-world plate also has depth-weighted drift; world has two drifting mist planes and true 3D bank cards.

**Not solved:** Current V3 plate bands still sample the SAME PNG, with gradient transitions, not real independent natural-alpha masks. Some objects can ghost at zone boundaries and original painted bridge remains visible. Do not call these genuinely separated visual layers.

### 3. Bridge materialization
**Problem:** The bridge is painted into the valley, so adding filaments on top gives two competing bridges rather than construction from nothing.

**Cause:** `film-valley.png` and `camera-valley-v1.png` are prepared backgrounds containing baked structural detail; `LuminousBridge.tsx` adds geometry on top. The bridge geometry originally interleaved ribs/deck/post segments, so `pieces.slice(0,n)` lights up scattered pieces across the full span instead of building from left to right.

**Current modification target:** Group bridge geometry by progressive span first, then reveal a contiguous front following time, and keep all coordinates under one progress calculation. This fixes temporal visual logic before working on baked bridge removal.

**Not solved:** Need clean inpainted source art and precise scene registration, NOT a covering color rectangle; asset replacement is a separate concrete deliverable. Until then, bridge remains a construction proof, not the finished replacement.

### 4. Continuity and review
**Required on-screen check:** 5s reveal, 9s first opening, 11s parallax and advance, 13s edge crossing, 16s world, 20s bridge completion, 24s exit, 27s overview. Continuous playback 7–28s plus direct seek 9/13/20/27.

**Validation:** All visual time comes from Remotion frame. Never claim browser/Electron tested from GitHub edits alone. Developer must verify typecheck and screenshots in shared local project. Missing local ignored scene files may still prevent clean global compilation in CI.

### Next necessary deliverables
1. Real bridge-free background source and natural-alpha sky/mountains/banks layers, with existing artwork style preserved.
2. Actual camera-space gateway geometry and a consistent reveal-world scene (avoid two diverging compositions).
3. Renderer performance assessment when both canvases coexist.
4. A full integrated Electron review before declaring V3 finished.

## Change log convention

Append for each code change:
- **Files:**
- **Why:**
- **Visible outcome:**
- **Verified:**
- **Still missing:**

## 2026-10-30 — ordered luminous bridge construction

- **Files:** `projects/mai-departe-cinematic-v1/scenes/LuminousBridge.tsx`
- **Why:** Previously the bridge fragments were interleaved and the slice count created the impression that disconnected pieces were lighting up all over the bridge. This contradicted a traveler physically constructing a world by moving forward.
- **Change:** Each deck, arch and hanger now carries a common span index. A single monotonic build-front traverses spans 0–83 from left to right, and every segment's intensity appears only as that front reaches it. Embers follow the same left-to-right progress.
- **Visible outcome expected:** A continuous structure grows toward the opposite bank. The arch and deck emerge together, with restrained warm filament intensity rather than additive neon.
- **Verified:** source written to branch; no Electron or offline render performed here.
- **Still missing:** the rasterized old bridge in both valley images needs actual bridge-free source art, and the 3D bridge geometry must be aligned to these cleaned images. Until then there may be duplicate structures.

## 2026-10-30 — improved forward optical flow inside the revealed world

- **Files:** `projects/mai-departe-cinematic-v1/scenes/CinematicPlateV3.tsx`
- **Observed problem:** During the film reveal the valley reads as a stationary poster even though the three travelers and the frontier are moving. Earlier depth-band masks had overly broad overlaps and the parallax travel was subtle.
- **Cause:** The illustrated source is still one PNG; the original V3 implementation reused it in only three softly masked regions and limited most motion to a few pixels.
- **Modification and intent:** Divided the 2D sampling into four conservative depth bands: sky, far ridges, valley and near water. Each samples the original art with independently calculated forward displacement and scale; motion and water highlights remain functions of composition time. Corrected opacity-band calculations to use ordered linear-gradient stops. This is a practical improvement to the film-view optical flow while real alpha-layer source art remains unavailable.
- **Visible outcome expected:** The scenery already visible behind the existing reveal edge advances continuously, with progressively faster motion toward the water/near region. The film mask still protects the unrevealed area.
- **Verification:** Changes committed to GitHub. Not validated with local Electron or test renderer.
- **Limit:** These are **depth bands of the same PNG**, NOT true alpha-isolated mountains or a perspective-reconstructed scene. Baked original bridge remains. We cannot safely claim the image has been separated into physical objects.

## 2026-10-30 — genuine Z-separated ridge geometry in CameraWorld

- **Files:** `projects/mai-departe-cinematic-v1/scenes/WorldDepthRidges.tsx`, `CameraWorld.tsx`
- **Observed problem:** The camera approach felt like a zoom over a single image, because most of the middle distance existed only as texture pixels.
- **Cause:** `CameraWorld` used a full-size camera-valley photograph at z=-36 and two near bank cutouts. There were few intermediate occluding shapes for perspective motion to reveal.
- **Change:** Added three procedurally profiled terrain-silhouette meshes placed at independent actual z=-32/-23/-14, with restrained misted colors and frame-dependent collective sway. They are rendered in the existing perspective canvas. Camera translation creates different apparent movement naturally through perspective, not CSS layer scale.
- **Why this implementation:** Geometry-based silhouettes give independently verifiable depth while leaving the current illustrated assets intact until proper clean art exists. Avoids overriding local media or making unverified assumptions that an asset has an alpha channel.
- **Expected visible outcome:** During camera forward travel, nearer ridge silhouettes translate and change apparent size faster than distant ones, between the painted valley and near banks. No claim of full reconstruction.
- **Verified:** GitHub source changes committed. Not compiled, benchmarked or inspected in Electron in this environment.
- **Still missing:** Clean bridge-free base art and genuinely separated photorealistic terrain alpha masks. Existing valley photo and generated silhouettes may differ in painterly style; developer should visually inspect and adjust geometry/opacity as needed.

## 2026-10-30 — correct optical-flow direction and physical bank motion

- **Files:** `projects/mai-departe-cinematic-v1/scenes/CameraWorld.tsx`
- **Observed problem:** A nominal parallax effect looked like camera zoom only. Near terrain cards were fixed in world coordinates while the underlying photo texture drifted, reducing the sense of travel.
- **Cause:** The procedural `worldPlate` shader inverted image-depth semantics: UV y grows upwards, yet its old `near` weight was blended inconsistently with `distant`, and the close-bank meshes had no time-derived travel at all. Different planes translated only through the camera dolly.
- **Change:** Reassigned sky, middle mountains and foreground sampling weights in the correct UV direction and introduced conservative frame-derived optical flow. Existing depth-separated near bank meshes also translate at separate rates (`0.05–0.22` world units/second), while the camera still performs the authored forward move.
- **Intent:** Make the world already in motion while visible through the tear, then sustain optical flow while entering it, without introducing unrelated sparkle overlays or restarting the animation clock.
- **Expected visual check:** At 9, 11, 13, 16 and 20 seconds the near banks should traverse the field faster than distant terrain; the underlying world image should not freeze when the camera shot changes.
- **Verified:** Code committed. No Electron preview, screenshots or rendering benchmark available to this GitHub-only update.
- **Remaining gap:** Image itself still contains the baked bridge and is not separated into clean object masks. This update does NOT meet those final art requirements; it is an intermediate optical-flow correction.

## 2026-10-30 — shared forward-motion field and invariant tests

- **Files:** `scenes/reveal-motion.ts`, `scenes/reveal-motion.test.ts`, `scenes/CinematicPlateV3.tsx`, `scenes/CameraWorld.tsx`.
- **Observed problem:** The film-world image and the 3D camera scene computed independent ad hoc motion rates. Even when both moved, their phase or rhythm could disagree at the portal cut, making it appear that the environment stopped and restarted.
- **Cause:** The film and world were authored separately, each calculating motion directly from time using unrelated multipliers, without a named shared film-to-world travel model.
- **Change:** Added pure `revealMotion(time)` with a single monotonic `forward` distance and ordered sky/far/mid/near optical flow plus world-space bank offsets. Wired film depth bands and 3D bank cards to that same model without changing traveler guides or audio.
- **Why:** Both views now consume a coherent movement signal. The perspective camera still follows the existing authored shot poses; this change synchronizes environmental flow, not the real project-camera geometry.
- **Expected:** When the hole opens, visible landscape should already be advancing, and near banks continue their progression as the camera transitions fullscreen.
- **Checks authored:** Frame-order invariance at nine seek locations, near/far speed ordering, and continuity at 8/13/15/23/27 seconds. Tests are committed but have not been run in this environment.
- **Remaining:** Neither this shared motion function nor current CSS portal reconstructs a single fully shared physical valley. Painted bridge still embedded in image sources; actual bridge-free cleaned art and object-alpha layers remain required. Do not claim completion of that requirement.

## 2026-10-30 — let the film tear leave the camera viewport

- **Files:** `scenes/PortalAperture.ts`, `scenes/portal-aperture.test.ts`.
- **Problem:** The previous portal radius (1.58 screen-scaled units) risked leaving parts of the film overlay at the edges when entering fullscreen. The border could seem to pop off rather than moving beyond the camera's view.
- **Cause:** Aperture geometry was computed in a 2D CSS clip-path using a fixed growth multiplier, independent of final viewport coverage. A wide-screen perspective requires an opening larger than the viewport to hide its torn edges naturally.
- **Change:** Increased the outward expansion allowance to 3.1 while preserving center alignment to the existing analytical frontier. The same polygon remains the edge stroke and cutout. Committed deterministic tests for open/close frames, direct seeking, and full-screen viewport coverage.
- **Intended visible result:** During 8–15 s, the burnt lip expands past the image border rather than disappearing over the picture. During 23–27 s it returns in the opposite direction.
- **Verified:** Source and tests committed. Tests were not executed here; no Electron visual certification.
- **Not solved:** Opening remains 2D screen-space geometry rather than a real world-space membrane. The worlds still use separate compositing contexts and the original PNG bridge is not removed.

## 2026-10-30 — portal char lip stays registered until outside the viewport

- **Files:** `scenes/PortalAperture.ts`, `scenes/CameraDirector.tsx`, `scenes/portal-aperture.test.ts`.
- **Observed problem:** During the push-through, the torn/charred ring vanished at an arbitrary portal-progress threshold (`open >= .96`), potentially creating a visibly digital pop just before fullscreen.
- **Cause:** The film-edge draw decision used a fixed animation percentage, not whether the projected polygon had actually passed the screen boundaries.
- **Modification:** The aperture now exposes `coversViewport` and `edgeVisible` derived from its computed polygon bounds; CameraDirector uses `edgeVisible` to retain the char lip while it intersects the viewport, then hides it only after the opening expands offscreen. Added repeatable seek assertions covering start, crossing and end.
- **Intended result:** The spectator sees the charred film edge travel offscreen during the forward camera move rather than instantaneously switch off.
- **Verified:** GitHub code and test source committed, not yet executed in a local Electron renderer. Bounding-extents check is a coarse visibility heuristic, not a full polygon/rectangle containment algorithm. It is not 3D membrane geometry.
- **Remaining:** Bridge-free replacement art, alpha-separated mountains/banks and a physically coherent one-scene camera path are still outstanding.

## 2026-10-30 — correct portal visibility with real polygon containment

- **Files:** `scenes/PortalAperture.ts`, `scenes/portal-aperture.test.ts`.
- **Observed problem:** The film edge could still disappear while a dark corner remained: the preceding `coversViewport` only checked whether a polygon's min/max x/y exceeded the screen rectangle.
- **Cause:** A bounding box crossing all four screen edges does not imply the polygon itself contains all four viewport corners (particularly for a roughly elliptical, serrated aperture). So `edgeVisible` could flip too soon.
- **Change:** Implemented deterministic even/odd point-in-polygon testing for each of the four screen corners; the charred lip is suppressed only when all four points are enclosed by the actual outline. Extended aperture test coverage for intermediate shot frames.
- **Desired result:** A burnt rupture that genuinely passes out of the camera frame rather than popping away when its bounding rectangle happens to be large enough.
- **Verified:** Commits published to branch; tests are source-added but not executed here. Full scene still requires Electron review and image-source work.
- **Still missing:** This is robust 2D aperture containment, not a physically 3D torn film surface. Original photographic bridge remains baked in both valley plates.

## 2026-10-30 — distant film in world space and full-film production reset

- **Files:** `scenes/DistantFilmBackdrop.tsx`, `scenes/CameraWorld.tsx`, `docs/MAI-DEPARTE-FULL-FILM-PRODUCTION-PLAN.md`.
- **Problem:** Our work was stuck on the same 20–30 seconds; film identity vanished after the portal, and distant film would have appeared as another compositing overlay.
- **Cause:** CameraWorld's layering had no world-space film object and previous milestones only refined the existing 0–30s proof.
- **Change:** A real Three.js film-plane backdrop now sits behind the z-separated ridge meshes (z=-34), with route lines and moving perforations, visible during approximate 14–24s. It is allowed to be occluded by geometry. A production document now specifies contiguous shot batches through roughly 180s rather than another string of microscopic style edits.
- **Expected outcome:** Film seems physically distant behind mountains when the flight reveals the right viewpoint; future shot production becomes complete 25–50s passages.
- **Verification:** GitHub code committed, not built or viewed in Electron. Visibility and painterly integration are not confirmed.
- **Limitations:** Film backdrop uses procedural line tracks rather than the song-specific curves; this is environmental symbolism, not a second synchronized route timeline. Need scene QA and eventually reuse actual guide curves. Film backdrop currently only exists in the existing 0–30s camera clip; it does not yet extend runtime coverage.

## 2026-10-30 — Replace expanding portal zoom with directional rift takeover

**What user saw:** An ellipse grew over the film like a PowerPoint mask; returning world cut felt unmotivated. This looked unlike actual camera travelling, particularly with the world composed of one photographic plate and a filtered duplicate.

**Implementation:**
- New `scenes/RiftPushTransition.ts` creates a deterministic moving serrated vertical boundary and complementary film/world clip polygons.
- `scenes/CameraDirector.tsx` replaces the old growing portal. **Entry 240–450f:** world expands from the left, displaces the active film right and finally fills screen. **Hold 450–690f:** world fullscreen. **Return 690–810f:** the same living film/traveler system enters from left and pushes world out to the right. Border is a physical-looking scorched lip, with lightweight emissive debris locked to the seam.
- `scenes/CameraWorld.tsx` uses a small forward camera-position impulse based on `vocalProsody` rising attacks, passed from `JourneyReveal.tsx`. This is a **dolly** change, not CSS zoom. Music data untouched.
- `scenes/rift-push-transition.test.ts` covers boundaries, directions and deterministic random seeks.

**Constraints and honest status:** This is a bidirectional **2D push transition with a Three.js world**, not a geometrically cut 3D film mesh. The current clip contains the future paper-world takeover only as a proposed subsequent phase; it is **not a generated paper texture or shot**. The original camera valley remains one photo plane plus separate procedural/near objects. Code was published to GitHub without local Electron render or test execution; must check for unwanted image displacement and top/bottom film rail continuity. Existing `PortalAperture.ts` is now unused by CameraDirector but retained for compatibility and history.

## 2026-10-31 — Correct two-front travel: original entry / traveler return / paper follows

**Visual brief from four annotated screenshots:** The user explicitly keeps the first zoom into the photographic world. After exploring, the three route travelers return **from the left**, pushing the photographic world and its burnt frontier to the right until the old world leaves the preview. A **second** burnt frontier advances **behind the travelers** and replaces the trail film with paper. The three markers and curves must remain on their original global timebase.

**Implemented:**
- Replaced the previous incorrect entry push: `CameraDirector.tsx` now uses existing `PortalAperture` for first zoom (240–450 frames), preserving the currently familiar first passage.
- Frames 690–810: the original `JourneyReveal` children return from the left using the `returnEdge.left` clip while `CameraWorld` moves out through `returnEdge.right`. No regenerated/fake travelers.
- Frames 780–930: a SECOND rough `paperEdge` advances from left behind the three travelers, covering the film without resetting them. From 810–930 paper fills the film behind the second edge; after frame 930 PAPER is full view.
- Added reusable `riftEdge` geometry and `transitionAt` scheduling to `RiftPushTransition.ts`.
- Added `PaperWorldPlaceholder.tsx` with lightweight dimensional cut-paper landscape and printed photo-like frame; intentionally **placeholder**, not approved final graphical style. The old valley photographic plate and camera rig remain.
- Updated test source with exact boundary/frame assertions and overlap ordering for the two rifts.

**Verification status:** Commits published to GitHub, not compiled or previewed locally in Electron; geometry overlap, animation performance and interaction with actual clip duration must be checked in the application. The code is an integrated first-segment fix, NOT completion of the full 240-second storyboard. It may need phase retiming after user visual review. No changes to audio, subtitle data, project media JSON or edit-timeline JSON.

## 2026-10-31 — Root cause of invisible preview edits; live portal-study wired

**Critical diagnosis:** `Composition.tsx` imports `portalStudyModule` / `portalStudyContinuation` from `scenes/portal-study/PortalMaterialScene.tsx`, with the IDs `director-journey-reveal` and `director-journey-reveal-legacy`. Timeline uses both: 0–900 frames and 900–7199 frames. The prior edits to `scenes/CameraDirector.tsx` and `scenes/JourneyReveal.tsx` were **not used by these clips**, explaining why the user saw no preview change. This diagnosis was confirmed by inspecting imports and exact clip entries, not by a visual guess.

**Fix:** Updated the *active* `scenes/portal-study/PortalMaterialScene.tsx` to use shared `riftEdge` from `scenes/RiftPushTransition.ts`; retain original filmed entry zoom at 3.7–10.8s; exit starts at `studyTiming.return[0]` ≈52.33s and finishes ≈54.97s; a second paper boundary starts .65s after exit begins and follows the three travelers toward right of screen. Camera world is clipped by first boundary and moves right as film returns from left. Paper fills behind second boundary. Existing `camera-valley-paper-v1.png` is still a placeholder, not approved final PAPER art. New test source in `scenes/portal-study/two-rift-handoff.test.ts`.

**Verification:** GitHub commit exists; no local Electron preview or TypeScript test run available. The active Composition and clip mapping are verified, but visuals are not. Do not mistake prior 23–31s timings from inactive CameraDirector for active scene timings.

**Follow-up:** Test visually at ~52–56s (not 23–31), confirm actual film/timebase and second rift ordering; then refine art and continuity on active route only. No audio, subtitle, media or edit-timeline changes.
