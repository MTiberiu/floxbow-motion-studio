# HIGH-CAPABILITY ANIMATOR HANDOFF — ONE DEEP TASK

**Project:** FloxBow — “Mai departe, pas după pas” (~239.96 s, 1920×1080, 30 fps).
**Active branch:** `feat/storyboard-director-ux-v2` ONLY. Do not create/switch branches, merge, or touch shared app/packages without separate authorization.
**Primary reading (in order):** `AGENTS.md`, `README.md`, `docs/AI_WORKFLOW.md`, `docs/MODULES.md`, `docs/CREATE_ANIMATION.md`, `docs/MAI-DEPARTE-CINEMATIC-HANDOFF.md`. Read `docs/STORYBOARD.md` only for Director/Animator output contract. Read actual relevant source before changing it.

## Your ONE priority: build a film-quality 20–30 second reveal with a camera transition

The user explicitly wants the video FINISHED, not a general-purpose FloxBow SDK, a standalone HTML demo, an architectural brainstorm, or another rough prototype. Produce *real Remotion/Three.js scene code that can run in the existing Electron composition*. A better-looking result, not more effects, is the objective.

**Story:** Three abstract traveling lights (orange = creator, purple = explorer, cyan = builder) follow three existing music-driven paths, personifying a 20-year creative/technical life journey. They sometimes split up. The screen begins as a technical/filmstrip overhead view: future grid/right, materialized world/left. The light at the boundary CONSTRUCTS the landscape rather than simply wiping a pre-existing picture. Then a camera follows the orange traveler, turns from flat blueprint to depth, and ENTERS that newly built world fullscreen: NO filmstrip or grid during immersive 3D flight. Finally rise to a wide shot. The built world remains geographically coherent and visibly constructed. Match major cuts to actual song/lyric moments; do not fabricate exact timestamps.

**For this task, demonstrate one controlled sequence only, including:**
1. Cinematically credible valley with graceful layered terrain, lake/river, distance haze and actual three-dimensional depth. Avoid jagged thin low-poly sheets.
2. A bridge/path with an understandable staged birth: energetic filaments -> organized wireframe -> structurally readable solid object -> subtle material & lighting. Avoid Paint-style square houses and arbitrary particles.
3. Existing luminous cyan gateway becomes a causal construction source at reveal frontier, not a detached glowing ornament; remove ugly dark ellipse clusters if this can be done safely within the local visual composition.
4. One actual camera move from technical/orthographic filmstrip presentation into a fullscreen perspective FOLLOW shot, then wide reveal. Camera changes must be framed and continuous, not simply a CSS scale of a 2D texture. Real foreground occlusion / parallax / geometry must prove depth. If a requested design is not feasible without changing shared app code, implement the project-local alternative and document the limitation.
5. Existing three marker positions, computed curves, soundtrack, lyrics and timestamps preserved. They may disappear from viewport in cinematic shot but should not be altered in the underlying data.
6. User-facing project-local controls, *only where supported by current editor*: e.g. `constructionIntensity`, `atmosphere`, `cameraProgress`, `nightMix` as serializable project-specific visual clip fields if feasible. Do not promise clickable Three objects until opted into Canvas contract and verified. Controls are SECONDARY to visual outcome.

## Failure examples — MUST improve

Current screenshot: flat jagged pale mountains; 2D blue rectangles with triangle roofs (Paint-style houses); oversized orbital wire knots, cloudy cyan bloom, dark ellipse clusters obscuring boundary; 3 targeting-scope-style marker rings. These are unfinished prototypes and should NOT be described as 'cinematic'. More lines, glow, particles and generic boxes do not fix silhouette, depth, lighting, composition or rhythm.

## Integration facts — important

- Active branch tracks `projects/.gitkeep` ONLY. The real video is local at `projects/mai-departe-cinematic-v1`, deliberately ignored by Git (`.gitignore` has `/projects/*`). User operates Windows `J:\\floxbow\\app` and can `git pull origin feat/storyboard-director-ux-v2`. Thus a normal Git commit to this branch will NOT update their local ignored project.
- Previous scene code lives on `codex/three-paths-material-reveal-v2` as reference ONLY, notably `projects/mai-departe-cinematic-v1/scenes/JourneyWorld.tsx` and `JourneyReveal.tsx`. Do NOT switch/merge branches. Confirm user's current local files before overlaying anything.
- New work should be deliverable via TRACKED production source under `examples/capabilities/` or a narrowly named tracked delivery folder, plus a *SAFE, version-aware installer* under `scripts/` that copies or patches only named project visual files after `git pull`. These are delivery files, NOT a separate running video or HTML demo. Preserve backups and refuse unknown modifications, rather than overwriting user edits.
- Existing current branch has `examples/capabilities/luminous-gateway/{LuminousGateway,JourneyConstruction}.tsx`, `scripts/install-luminous-gateway.ts`, `scripts/install-journey-construction.ts`, `scripts/upgrade-journey-crossing.ts`. Previous upgrades replaced Paint houses with bridge contours, but are NOT approved quality. Feel free to replace the visual concept intelligently; do not assume older code is correct.
- Project scene uses `@remotion/three` `ThreeCanvas` within `JourneyWorld.tsx`, `useVideoConfig`, a maskImage, and a song-frame time argument. Existing `JourneyReveal.tsx` has overlay path markers and filmstrip logic. A camera transition must consider that scene + overlays + masks; putting a perspective camera in ThreeCanvas alone won't remove the filmstrip.
- The actual song has 58 subtitle cues / 329 manually timed words, 15 analyzed sections, ~269 beats, 1,566 musical events, ~480 energy samples and 739 accents; three experimental curves `phraseEmotional`, `vocalProsody`, `wordGravity`. Respect gaps/confidence; these are NOT ground-truth emotion labels.
- IMMUTABLE FOR THIS TASK: `media.json`, `edit-timeline.json`, original song WAV/path/source registrations, subtitle timing/lyrics, derived analysis datasets, shared apps/packages, unrelated projects. No silent audio relink or moving soundtrack clips.
- Any animation is deterministic in Remotion frame/time, including scrubbing, replay and rendering. No CSS keyframes for scene motion, unseeded randomness, uncontrolled wall clocks or network imagery.
- Never state that a change was tested in Electron unless it was actually tested there.

## Suggested implementation

- Design just one great shot BEFORE writing effects: read camera and scene contracts, establish world coordinates and an easily perceptible hero bridge/valley silhouette.
- Use real Three.js terrain volume/mesh surfaces, restrained palette, readable graphic shape language and controlled gradient/haze; prototype visual levels at 1920x1080. Lighting/materials should be compatible with Remotion and screenshot/render.
- Stage by frames: blueprint contours, selective structural extrusion, resolved material surface, depth-and-flight shot, wide shot. Use smooth frame curves with an explicit shot table, not random changes.
- Scene modules can be `JourneyLandscape`, `ConstructionBridge`, `JourneyCameraRig`, `WorldBuildDirector`. They may be scene-local; do not introduce general SDK abstractions.
- Filmstrip presentation and technical grid should be disabled in fullscreen immersive shot; existing real soundtrack/subtitles should remain.
- For grading: read and run actual checks where possible (TS parse/typecheck, deterministic seek, representative still frames at e.g. 3/10/18/25s). Don't hide test failures.
- If source branch/local access is insufficient for full integration, provide a safe minimal patch and exact human verification steps, not a promise.

## Definition of done / what to report

**Must deliver:** exact commit SHA on active branch, file-by-file change list, one `git pull` command, one safe install/upgrade command, clear test times, and an accurate explanation of what is genuinely interactive/editable vs code-only. Prefer screenshots of actual rendered frames when possible. Clearly separate `implemented`, `verified`, and `unverified`.

**Acceptance criteria:** The user sees an obvious new world-building sequence and a camera move into the newly built valley in Electron. No obvious rectangle houses, target scope markers in immersive view, jagged sheets, dark reveal ellipse blobs, fixed filmstrip overlay during fullscreen, broken soundtrack, reset subtitle timing, or inconsistent state when jumping back on timeline.

If the time/compute budget is tight, PRIORITIZE one excellent bridge/valley scene with a single credible depth camera move over broad unfinished features. Do not spend scarce computation on ten new visual ideas or generic framework refactors.
