# Music video execution map — beyond the 30-second proof

## The problem this fixes
We have spent many iterations polishing a **single 0–30s Camera Director proof**, while the song is almost three minutes long. This is not an acceptable film production method. Effects are not complete storytelling. Each additional shot must advance the journey, reveal a new world event and transition continuously from the previous one.

## Hard rule
Do not replace the project's song analysis, subtitles, actual timeline, or audio. Read the real song duration/lyric timings locally before locking precise frame boundaries. The ranges below are editorial allocations, **not claims about exact lyric cues**. One visual clip may cover many shots, but must not reset path positions when the camera changes.

## Reusable film vocabulary
1. **Film-space:** physical perforated film with the three guide routes, still moving.
2. **Breach:** charred world opening, camera flies toward and through it.
3. **World-space:** layers at different physical depths, time-based optical flow, bridge materialization.
4. **Distant film:** the oversized film surface sometimes visible **behind** mountain geometry, with mist between planes; not a HUD pasted on the camera.
5. **Exit:** camera pulls backward revealing a film-plane/frame as an object in another environment.
6. **White material:** bright paper/print material for hopeful beats, same path architecture.

## Sequence allocation (approximate; reconcile against actual vocal guide)
| Approx. passage | Cinematic action | Required transition | Production milestone |
|---|---|---|---|
| 00–30s | Existing dark film opening, burnt reveal, forward fly-through, bridge being assembled, pull-back | Already partially implemented; needs actual visual QA | Proof A |
| 30–55s | Follow cyan traveler along water; bridge deck lights sequentially behind; camera low near lake | A continuous moving camera, NOT another giant still-image fade | Proof B |
| 55–80s | Viewpoint rises through fog to mountain pass; distant film giant behind ridge, slowly moving; purple route becomes foreground guide | Travel past foreground trees to expose film plane through parallax | Proof C |
| 80–105s | Flight follows orange route over incomplete architecture: structures appear from filaments and settled surfaces | The route becomes geometry, then fades to tiny sparks | Proof D |
| 105–130s | Disturbance / struggle: film darkens, fragmented frames, jagged ridges and strong contrast, then recovery | Moving shot with no reset of camera world time | Proof E |
| 130–155s | Transition from burnt film to textured white paper/drafting space; paths remain continuous, colors soften | Physical material reframe, not sudden mode toggle | Proof F |
| 155–180s | Wide hopeful landscape, three routes converge, bridge and new world seen complete, long pull-back reveals whole moving film | Cinematic resolve, preserve subtitles | Proof G |

If actual music is longer or shorter, retime proportionally or fit remaining beats to music, without moving the soundtrack.

## Architecture / engineering constraints
- Add director shots as data; composition is a continuous `frame` function. Scene camera poses and transition windows never derive from playback history.
- Only one active world timebase. Film, 3D banks, atmosphere, and bridge construction all consume absolute time.
- Avoid two entirely unrelated background photo planes in one portal; share a depth composition as much as feasible.
- Real images are subordinate to geometry. All sources require natural alpha for depth; simple horizontal gradient bands are temporary scaffolding only.
- Film is a distant physical plane when the camera is in the world; geometry occludes it.
- No extra per-effect installers. Developer runs local targeted typecheck and preview after merging planned shots.
- Audio, subtitles, edit-timeline data and guides remain immutable.

## Batch workflow (replace one-effect loop)
1. Deliver **a full 30–55s sequence**, not another 2-second effect. Reuse existing water, camera, and travelers. Verify consecutive frames and direct seek.
2. Deliver 55–105s in one batch, including perspective film backdrop and a second world event.
3. Deliver 105–180s in one batch, with dark-to-white transition and final cinematic resolution.
4. End with one pass for art continuity, performance and real assets.
5. Every batch report: shot coverage, which specific scene files changed, observed Electron output, failure logs, unimplemented elements, and a video capture or multiple stills at key moments.

## Present repo status (2026-10-30)
- Newly introduced `DistantFilmBackdrop.tsx` draws a **subtle** moving film plane in 3D at z=-34 with routes and sprockets, behind three geometric ridge layers. Time window approx. 14–24s. This implements only the proposed visual relation, NOT a full 30–55s extension.
- Original film world uses a different image with a baked bridge; clean bridge-free alpha layers remain missing.
- No guarantee yet that the film backdrop is visible at its chosen depth/height; needs Electron visual verification before relying on it.
- Production must **stop claiming the entire film is progressing** when only the first 30s code is affected.
