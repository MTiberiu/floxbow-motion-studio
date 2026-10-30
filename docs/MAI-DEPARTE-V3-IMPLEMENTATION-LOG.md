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
