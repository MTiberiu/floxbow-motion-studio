# FLOXBOW · MAI DEPARTE — CONTINUITY / PROJECT PRODUCTION PLAN
**Date:** 2026-10-30  
**Current user development branch:** `feat/storyboard-director-ux-v2`  
**Document purpose:** Handoff for any AI/developer resuming work. Read before making edits.  
**Status:** Creative direction established; the audiovisual world-reveal remains an unapproved visual prototype, not a finished video.

> **IMPORTANT REPOSITORY FACT (checked on GitHub 2026-10-30):** On `feat/storyboard-director-ux-v2`, the tracked `projects/` directory has only `.gitkeep`; the actual `projects/mai-departe-cinematic-v1` folder is NOT tracked on this branch. The user may have it locally on disk. It **is** tracked on `codex/three-paths-material-reveal-v2` and its ancestor `codex/share-mai-departe-cinematic-v1`. DO NOT blindly cherry-pick/merge entire projects or create an incomplete dummy project on the current branch; inspect the user's local files and Git status first. This handoff lives in `docs/` for that reason.

## 1. User's actual concept — DO NOT replace with a generic music video

The idea is not primarily a singer PNG and conventional cuts, a slide show, random camera zooms, or decorative audio-reactive particles. The user has designed a *continuous generative audiovisual journey*:

- A white **technical grid** and three precomputed curves occupy the **future/right** of the filmstrip-like frame.
- Three colored moving spheres / technical markers follow these music/word/vocal motion curves near the center. They can naturally **overlap**; overlap is not a defect.
- The world progresses leftward as song time advances. A short, legible traveled trail remains between the spheres and the reveal front (~5–7 seconds; prototype 6.5 s).
- In the **past/left**, motion creates a vivid, coherent, evolving **world**: drawing/grid → topology/wireframe → geometry → materials/color/depth → motion/light/weather/life.
- Crucial: the world must appear **built by the traces/particle events**, not be a complete photograph simply wiped into view. A masked image or random ellipse cloud is inadequate.
- The full 239.96-second song allows many distinct worlds/reveal modes (landscape, water, technical architecture, mechanical or organic forms, city, abstraction, graphically surprising transitions) while maintaining global world-space continuity and the path/navigation metaphor.
- Visual signature: high-end **hybrid 2D vector (SVG, grids, curves, typography) + 2.5D/Three.js shaders/geometries**. Technical UI drafting aesthetics can morph into alive materials. *Spectacular* does not mean more bloom, arbitrary motion, random particles or low-poly spikes. Quality, material continuity and compositional discipline first.
- Subtitles remain a readable synchronized layer below the world. Do not destroy or reinterpret manual word alignment.
- The narrative in the lyrics about delaying, fear, obligations, unanswered calls, rejection, doing what one can, choosing to move, perseverance and tentative peace should inform **world changes and atmosphere**, not literal illustration of every noun or emotion detection from pitch.

### Song narrative / world evolution (proposed art direction, not implemented facts)

1. **0–~13 s, instrumental intro:** blank technical grid wakes up; precise plotting, restrained line-work, topology seeds. Introduce the three spheres/creative agents and physical construction rules. No fake vocal reactions.
2. **~13–55 s, hesitation and burden:** limited/mineral world, dense constraints, ridges/negative spaces, pressure-like contours, tight architecture, cool restraint. It should *build*, not reveal an existing mountain photo.
3. **~55–98 s, resolve and first forward movement:** grid unlocks; paths find open routes; channels, valleys, bridge-like connections, expanding spatial depth. Distinguish verse and chorus via meaningful **formation changes**, not just color shifts.
4. **~98–140 s, rejection, learning, recommitment:** geometries briefly become more demanding/asymmetric, then reorganize. Preserve the already-built identity of regions behind the front.
5. **~140–168 s, renewed refrain:** more luminous, complex/connected worlds, flow and rhythmic movement. Avoid automatic acceleration of the whole world with RMS.
6. **~168–~185 s, bridge:** quieter/intimate special region with less material formation and time for visual clarity.
7. **~185–211 s, final refrain:** larger-scale construction and a distinct climax: city/organic-mechanical interconnected systems or a coherent transformation of earlier motifs.
8. **~211–239.96 s, closing/outro:** gradual settle, expansive space, persistent assembled world, future still open.

These are **approximate production targets**, not exact cuts. Derive precise in/out boundaries from saved section analysis and manual lyrics. Avoid rigid claims about emotion or pitch.

## 2. What the project gives us — exact real data

The tracked prototype project (`projects/mai-departe-cinematic-v1` on the cinematic branches) contains:
- `music-analysis.json`: **269 beats, 15 sections, ~1,566 music events, 480 energy samples, 739 accents**, duration ~239.96 s; tempo estimate ~69 BPM.
- `music-lyrics-map.json`: links timing/lyrics to music analysis.
- `vocal-phrasing-analysis.json`: phrase and word-level analysis; **58 subtitle cues and 329 manually timed words**.
- `emotional-motion-vocal-prosody-experiment.json`: experimental combined export.
- `motion-guides.json`: sampled continuous guides for current 3-marker visual.
- `edit-timeline.json`: saved actual project composition.
- `timing/lyrics.json`, `Composition.tsx` etc.
- **RMS vocal:** 4,800 time samples at 50 ms; **F0/pYIN:** 4,802 samples, 3,076 valid (~64%). F0 is experimental with gaps and low confidence; obey validity mask.
- Some metadata describes estimated/unverified phrase timing even though user manually corrected words by ear. **The saved manual word timings remain authoritative.** Do NOT re-estimate/rewrite them.

Three experimental guides, **not independent ground-truth emotions**:
- `wordGravity` (cyan): relative duration/pacing of manually aligned words; user heard/perceived a stronger rhythmic correspondence. Good candidate for onset/gesture/contact/animation accents, but do not assert it is objective beat detection.
- `phraseEmotional` (orange): derived smoothed/integrated phrase-level movement combining linguistic pacing and older musical baseline. It is NOT an emotion classifier; may guide slow environment evolution.
- `vocalProsody` (purple): derived vocal-intensity/pitch/phrasing motion channel based on RMS/F0; confidence and gap-aware; good candidate for secondary motions and voice articulation when consistent with audio. NOT a direct 'feeling' scale.
- The external interactive HTML Experiment 18's exact settings are not necessarily reproduced by `motion-guides.json`. The cinematic prototype uses saved samples, **not the HTML itself**.

Example of duration contrast used in experiments:

`T_word = word.end - word.start`  
`T_normal_word = max(0.14, estimatedSyllables * 0.195)`  
`P_i = log2((T_word / T_normal_word) / (T_phrase / T_normal_phrase))`

This describes whether a word is prolonged relative to its phrase, **not** the complete original Word Gravity curve and not a direct emotional estimate. Do not claim exact formula equivalence without inspecting source code.

Motion must be *composed* instead of blindly summed:
`control(t) = base(t) + amplitude * mixOfNormalizedGuides(t)`
but only if scaling, domains, filters, confidence, visual timing, and saturation are explicit. For a shot/region choose a main guide, support guide, and occasional accent guide. Or map each to a different visual property.

## 3. Audio as an input to WORLD CREATION (not just avoiding a broken WAV)

**Use the real music structure to make creative decisions.** Technical mapping proposal:

| Source | Time scale / truth | Suggested visual action |
|---|---|---|
| Music sections / downbeats | high-confidence musical structure | **major changes in world grammar**, reveal technique, palette, active material, progression rate policy |
| Musical accent events / attacks | individual hits with confidence | launch construction seeds, one local edge growth, ripple/contact/vertex snap. Not a flash on every beat |
| Energy envelope / stems | evolving musical dynamics | controlled density/contrast/complexity ranges; activate one or two environmental processes |
| Manual cue / word start-end | human-corrected timing | precisely align micro-actions, labels, line sprouts, assembly gestures; sustained words may develop a continuous growth gesture |
| Word Gravity | experimental relative word cadence | local timing, rhythm of construction/contact, moving marks/small geometry |
| Phrase Emotional | derived phrase motion | slow macro-flow, global geometry breathing, smooth camera/world changes; must not force camera or world speed |
| Vocal RMS + local attacks | measured vocal energy, not 'emotion' | secondary light/material activation or emitter intensity, with sensible clamping / smoothing and silence behavior |
| Valid F0/pitch movement | highly incomplete experimental estimate | subtle pitch-following accent **only when reliable**; no interpolation across long gaps or mood guesses |
| Vocal silence / music-only regions | independent of vocal F0 | nature/geometry can keep moving to instrumental events; intro must be authored without fictitious vocals |

**Recommended pipeline per region:**
1. Determine **exact music section and manually timed lyrical phrase**, then story-intent and visual grammar.
2. Choose 1–2 **controlled visual processes** (e.g., contour assembly, fluid growth, reflective surface), not 15 effects.
3. Establish song-to-world coordinate transform and one deterministic **construction progress clock**. World travel stays legible across beat changes.
4. Schedule **discrete construction events** on well-chosen beats, accents, starts or ends of words; persist their outcomes as analytical functions of event time (not playback-history state).
5. Modulate an explicitly small range of parameters using normalized guides/RMS as secondary controls; preserve onset timings and guard against outliers.
6. Debug overlay per-region: current time, music section, event ID, active guide, chosen parameter; overlay is DEV-ONLY, hidden in final visuals.
7. During preview compare chosen frame moments against music; document 2–3 examples with source timestamp + visual effect + actual code mapping. If the audience sees audio analysis as a wiggling graph instead of an evolving world, art direction is failing.

**Do not** have a constant-speed marker's geometric tangent slope automatically determine all object's speed. For reference, a marker with `x=k*t, y=f(t)` has `speed=sqrt(k*k + (dy/dt)^2)`, which is a geometric quantity, not music's beat or emotion. No arbitrary speed-up when curves flatten.

### Audio source/relink incident — IMPORTANT

The source WAV is **NOT committed**. A prior Git-sharing branch changed the tracked `media.json` local path to a generic placeholder (`C:\FloxBowMedia\Mai departe, pas după pas.wav`) to avoid exposing user's personal computer path. This inadvertently broke local playback.
- In the cinematic repository copy, the original asset ID is `audio-2d572c69-9bab-4d14-9392-1b9e951064aa` and the original soundtrack clip refers to it.
- The user subsequently re-imported the WAV locally, producing another asset ID: `audio-6d4aefb4-e71d-452d-80e7-60953240a950`. The clip still referred to the original ID, so reimport did not fix it alone.
- **This is a LOCAL state mismatch, not permission to rewrite the remote file.** The current user's local state could now be different. Confirm with user if sound is working before any dedicated audio repair.
- **Strict user boundary:** Do not touch `media.json`, the soundtrack clip, audio IDs, audio path, `edit-timeline.json`, original analysis documents or subtitle timings as part of visual iteration. If asked to repair sound, inspect local current state, preserve user's WAV and unique ID references, and do not commit private paths to Git.
- Before a pull/check-out, user should inspect local `git status`; tracked local media config may conflict with Git placeholder. Do not instruct reset or destructive overwrite.

## 4. File responsibilities and architecture (cinematic branches)

> Note: these project paths may be LOCAL-ONLY on `feat/storyboard-director-ux-v2`. Do not claim they're tracked on this branch until verified.

| File | Responsibility | Edit policy |
|---|---|---|
| `projects/mai-departe-cinematic-v1/scenes/JourneyWorld.tsx` | actual assembled Three.js 2.5D world: geometry, grid, sky, water, regions, shaders, environmental animation | primary visual development |
| `projects/mai-departe-cinematic-v1/scenes/JourneyReveal.tsx` | 0–30 s, balls, sampled curves, filmstrip frame, frontier/material reveal, particle alignment, Inspector fields | change only for reveal logic |
| `projects/mai-departe-cinematic-v1/scenes/JourneyRevealLegacy.tsx` | 30–239.96 s prior complete vector-curve treatment | preserve; don't accidentally break imports |
| `projects/mai-departe-cinematic-v1/scenes/JourneyWorldLegacy.tsx` | earlier world drawing | preserve |
| `projects/mai-departe-cinematic-v1/Composition.tsx` | registers editable modules, mounts TimelineComposition | avoid changes without necessity |
| `projects/mai-departe-cinematic-v1/motion-guides.json` | saved guide samples / sync | read-only for visual experiments |
| `projects/mai-departe-cinematic-v1/music-analysis.json`, `music-lyrics-map.json`, `vocal-phrasing-analysis.json` | music and voice source analysis | read-only |
| `projects/mai-departe-cinematic-v1/edit-timeline.json` | master clips / subtitles / soundtrack IDs | read-only by default |
| `projects/mai-departe-cinematic-v1/media.json` | local audio asset reference | **DO NOT CHANGE** |
| `projects/mai-departe-cinematic-v1/scenes/prepare-film.mjs` | old storyboard/actor-led timeline generator | **DO NOT RUN** (will rewrite director direction) |
| `projects/mai-departe-cinematic-v1/scenes/BurdenScene.tsx`, `DirectorComponents.tsx`, `PhonePerformance.tsx` | old singer/actor-led experiment | retained but not active |
| `projects/mai-departe-cinematic-v1/backups/`, `scenes/white-stage-timeline-backup.json` | recovery copies | preserve |

Latest inspected active cinematic timeline had **61 clips**: 58 subtitles, 1 soundtrack, 1 0–30 s world reveal and 1 30s–end legacy curves. Actor performance components exist in files but **not active clips**. No approved full render.

## 5. Previous experiments and critical user feedback

- Original exported audio-motion HTML showed 3 overlapping curve-driven balls; user liked the rhythmic potential of **Word Gravity** and the idea that three rails may drive different visual processes.
- Another AI constructed 2.5D photos of mountains and a plain masked reveal. User found it poor: photographed mountain appeared as an obvious cut-out band; flat water, arbitrary silhouettes, no true material building.
- On `codex/three-paths-material-reveal-v2`, changes introduced an analytic seeded fleck mask and replaced JPEG/PNG mountains with procedural Three.js ridges, water shader and grid. Latest user screenshot shows **large dark oval blobs at reveal edge, extremely jagged pale-grey mountains, geometric sheet-like faces, generic watery strips, and weak cohesion**. This is **not acceptable HD graphics**.
- Markers looking coincident in a screenshot is expected; do not 'fix' marker overlap by offsetting their actual music-driven trajectories.
- Past SVG bug: `<path d>` starting with ` L0` instead of `M0`; fixed in both reveal files. Then a missing semicolon in `JourneyRevealLegacy.tsx` broke Vite dynamic import; fixed in commit `e659527`. Validate TSX before pushing, even for tiny code changes. Some earlier assistant changes were pushed without local build, causing user to test syntax errors. **Avoid repeating that.**
- The user expects: **after every commit, provide exact test instructions** and ask for screenshot/errors. No generic instructions or unsupported claims that preview/export passed.

## 6. Next production plan — prioritize quality and reproducibility

### Phase 0: Establish real working tree safely
- Confirm current branch `feat/storyboard-director-ux-v2` and `git status`. If cinematic files live only locally, do not replace them from remote.
- Determine whether `projects/mai-departe-cinematic-v1/` is locally present and where the current approved prototype lives. Confirm that audio link and subtitle timing are untouched. Map branch history rather than arbitrarily merging unrelated application work.
- Inspect repo's `AGENTS.md`, `docs/MODULES.md`, `docs/THREEJS.md` and actual SDK APIs before making code assumptions.
- Keep code changes project-local and narrow; never silently restructure FloxBow for a visual experiment.

### Phase 1: Fix 25–30 s visual language BEFORE expanding duration
Target: a *polished technical construction* rather than a jagged random landscape.
1. Keep the untouched 3 marker curves, white future grid, visible traveled tail and stable global navigation.
2. Art-direct a coherent world region with clear layers: background blueprint/environment, main terrain/architecture, foreground geometry, fluid/light and small life.
3. Replace giant dark mask ellipses with **fine, geometry-connected construction**: persistent world-anchored seed points → connected vector paths → wireframe / extruded cells → a material pass with physically legible contours.
4. Use texture/shaders/geometry only with believable adjacency and correct perspective; no cropped stock panorama on arbitrary jagged polygons.
5. Give each sphere a meaningful **but configurable** role (one might seed lines/geometry, another light/atmosphere, another flowing/water elements). Curve source semantics are NOT a scientific emotional label.
6. Validate the revealed region *without any particles* first; it must look art-directed and beautiful on its own.
7. Re-enable reveal and particles; a viewer should understand *which trace creates which material*. Avoid treating white wipe as final result.
8. Evaluate at song times 3, 10, 20, 27 sec and via random backward seek. Compare on the user's actual preview at 1920×1080 if possible.

### Phase 2: Second 30 s region — distinctly different reveal grammar
- After first region is visually approved, design another graphically different area (e.g., blueprint to illuminated precision architecture / floating geometric bridges, or contour → living waterways); **do not** repeat identical mountain patterns.
- Derive exact transition time from music sections/phrases.
- Camera and world motion should be continuous; each completed region must keep identity in world coordinates when revisited/seen in background.
- Keep shot/cut changes optional; prioritize uninterrupted generative continuity.

### Phase 3: 4-minute coherent feature
- Establish region manifest (time ranges, visual language, palette, reveal rules, materials, events, guide mapping), ideally data-driven so each region is independently testable.
- Use actual vocal/word/music events, confidence-aware transforms and the user's song narrative to vary architecture, timing, atmosphere.
- Only after preview pass and resource budget, advance to rest of song. Optimize GPU/materials, frame determinism, seek and final rendering.
- If code creates new editing fields, ensure they are real Inspector props; don't falsely advertise all Three objects as timeline-editable.

## 7. Safe iteration / test contract (mandatory)

1. Implement **one change of visual behavior at a time** (typically `JourneyWorld.tsx` or `JourneyReveal.tsx`), without audio, subtitling or timeline edits.
2. Validate locally if possible (TypeScript/Babel/build, no fatal Vite import error). If local execution unavailable, say explicitly **not tested** instead of claiming success.
3. Commit/push to the **user-authorized current working branch**; before writing, reconfirm its head and file existence. If the project does not exist on that branch, do not transplant it silently.
4. Give exact commit SHA, changed files, expected visible result, and exact user steps to fetch/pull safely (check `git status`, preserve local audio).
5. Ask user to test Play/Pause, forward/backward seek, 3/10/20/27 sec, marker positions, world continuity, missing assets, material coherence and screenshots + first useful Vite stack trace.
6. Wait for feedback before proceeding to next large creative change.

**Visual acceptance:** the new landscape must look intentional and high-end even paused, three curves remain source-driven, particles create rather than decorate, no giant dark ovals or obvious jagged cutouts, no unexplained flicker, no loss of audio/subtitle data.

## 8. Exact past branch references

- Actor-led base / previous shared cinematic project: `codex/share-mai-departe-cinematic-v1` (commit `4bf6082`), project tracked only under `projects/mai-departe-cinematic-v1`.
- Later procedural world branch: `codex/three-paths-material-reveal-v2`:
  - `276dd6a`: initial deterministic fleck material-reveal mask.
  - `fc03309`: replace photo mountain cutouts with procedural vector-topographic Three.js.
  - `ae9f8e8` + `1c19b2e`: SVG path generation fixes.
  - `e659527`: legacy TSX missing semicolon import fix.
- **User's currently selected branch is separate:** `feat/storyboard-director-ux-v2`. Don't mix these up. The user may already have the project as an untracked local folder; consult filesystem before any migration.

## 9. What to do when resuming

Read this file, inspect the real branch, confirm actual project file locations and working tree state. Do not start by changing audio, replacing lyrics, generating a singer storyboard, or promising a complete MP4. Implement a small visually coherent fix with a safe test plan. **The user is the preview tester and expects Git commit + specific test directions after each change.**
