# Film HUB / 3D world lifecycle redesign — review before runtime change
Baseline: `8ec673ac88d5c7b872a110dadbf34f07d42e7fdf`
Status: **DESIGN SPEC, NOT IMPLEMENTED**. User screenshots show edge snapping and moving 2D tracks. Do not present source-only edits as tested.

## Diagnosed actual live bug
In `scenes/portal-study/PortalMaterialScene.tsx`, `roadOffset=-2200*(1-state.returning)` translates the entire `RestoredFilmHub`, including grid, guide curves, travelers and its reveal frontier. Thus the 2D HUB becomes a slide instead of a fixed road. It also draws `RiftBoundary` separately, while the next world's `RestoredFilmHub openWorld` draws another frontier using `revealAdvance=state.entry*1600`. At a world boundary the previous scene's return overlay vanishes and the next scene's entry overlay starts with a different mask position: a visible snap is therefore structurally possible. Two independent ThreeCanvas instances and a dynamically remounted scene also need verification.

## Required invariant
1. Screen-space HUB/grid/guide curves stay fixed. Traveler position (X and Y) advances from ABSOLUTE music time, not a CSS translate of the whole HUB.
2. All six worlds have stationary full-screen Three.js world layers, with identity and camera retained from reveal through exploration and exit.
3. Return is a CLOSURE of the old world's visible mask; new-world reveal is a separate OPENING later. Between them the travelers and 2D HUB have a deliberate visible solo period. Do not animate these with the same front or overlap without a specifically music-directed choice.
4. The organic mask reveals the live 3D scene. No separate HTML landscape photo, image slide or surprise zoom.
5. At 100% reveal, remove only mask and film-grade overlays (smooth fade); camera/world stage remains exactly the same.
6. A world can unmount only after no visible pixels remain. Preload next textures before opening its mask; avoid black frames with correct GPU lifetime, not an extra static-photo coverup.
7. The final positions and speeds are keyed to analysis-derived musical phrase/beat events. Do not use random positions; seeded deterministic camera *demo* motion is allowed only until final shot planning.

## Proposed reusable stage machine
`WORLD_EXPLORE` -> `OLD_WORLD_CLOSING` -> `HUB_SOLO` -> `NEW_WORLD_DISCOVERY` -> `WORLD_EXPLORE`.

World closure:
- Begin on a chosen audio event; travelers reappear from one side of a FIXED 2D road.
- Old-world mask closes progressively. Camera keeps world stable until last visible pixel.
- No world or HUB translation. The old world is unmounted once mask is fully closed.

HUB solo:
- Travelers continue across fixed tracks. Space for one coherent lyric phrase; lyric objects/cards can appear, but no 3D world behind yet.
- Travelers X traverses the road over a music-determined interval; paths sampled by absolute song time, independent of X.

New discovery:
- Pre-mounted full-screen new world with active lighting/camera; opening follows travelers only after they reach an agreed normalized screen coordinate (e.g., 0.40 of viewport, parameter, not a fixed time).
- Front lags traveler position. Camera eases from detail into full-start framing, reaching exact final pose when mask is 100%.
- Film grade and atmosphere attenuate smoothly as exposure grows; fixed rails stop only while exploring.

## Timing findings (EXISTING, not a new edit)
| World | Return start | Return ends | Next world starts | Next entry starts | Fullscreen |
|---|---:|---:|---:|---:|---:|
| Valley -> Harbor | 52.333 | 54.967 | 55.200 | 57.600 | 61.100 |
| Harbor -> Desert | 93.467 | 96.967 | 97.867 | 99.567 | 103.067 |
| Desert -> Forest | 135.267 | 138.767 | 139.733 | 141.400 | 144.867 |
| Forest -> Ice | 163.267 | 166.733 | 167.733 | 169.367 | 172.867 |
| Ice -> Cloud | 177.233 | 180.733 | 181.600 | 183.367 | 186.900 |
| Cloud -> Finale | 207.033 | 210.533 | 211.467 | N/A | N/A |

These short existing HUB periods do not support a full solo verse. Re-map song time after reviewing exact lyric/phrase starts and beats in `vocal-phrasing-analysis.json`, `director-shot-plan.json`, `motion-guides.json` and `film-cue-sheet.json`. Six 3D worlds are optional; reduce if needed to give proper 2D sections. Preserve music, captions and source analysis. Do NOT modify `film-cue-sheet.json` simply to stretch an animation before the revised film structure is approved.

## Implementation order
1. Remove `roadOffset` translation from **RestoredFilmHub**, refactor into independent world-mask and fixed-HUB/traveler transforms. Do not just set `roadOffset=0` — this would break the closure and need a proper front map.
2. Create one authoritative `FilmPhaseDirector` with matched mask edge coordinates for end/start and exclusive phase identity; prevent double frontiers.
3. Create `TravelerPathDirector` giving X progress + existing music-driven Y and velocity; shared over all worlds, seek-safe.
4. Implement GPU lifecycle with a persistent world stage across reveal/fullscreen; test 97.867s boundary frame-by-frame for black frames.
5. Re-time based on lyrical phrases and beat grid; include explicit HUB solo intervals, not just world transitions.
6. Review in actual Electron before claiming done. Tests must cover world boundary +/- 5 frames, reversed seeks, masking, and uninterrupted music/subtitle synchronization.

No code changes requested by this spec automatically; the preceding architecture is still the live behavior until changed deliberately.
