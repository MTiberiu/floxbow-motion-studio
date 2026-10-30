# Camera Director — project-local delivery

Sequence (30 fps, relative to existing cinematic clip starting at Timeline frame zero):
- 0–8 s: unchanged filmstrip overview and Living Emulsion.
- 8–13 s: follow-orange; perspective camera dollies from z=16 to z=11 while the prepared world cross-dissolves over the film. Orange light uses the original curve value passed by JourneyReveal.
- 13–15 s: finish transition to world; film and routes become completely hidden.
- 15–23 s: fullscreen valley approach. Camera advances to z=3 with limited lateral travel, water in perspective and separate alpha banks.
- 23–27 s: pull back and cross-dissolve to original filmstrip.
- 27–30 s: original overview. The existing Timeline then chooses its existing legacy continuation unchanged.

The safe prepared scene is deliberately 2.5D: illustrated distant bridge/mountains, two natural-alpha banks at different depths, a true horizontal water plane with restrained shader reflection, and a 3D orange light/ring. No CSS scale is used. Camera FOV is 44–48 degrees, lateral excursion -0.6..0.8, z=3..16. No large rotations, bridge fly-through or arbitrary orbit is supported. The entry/exit is an editorial cross-dissolve between prepared views, not a seamless geometric reconstruction of the original PNG. Original film-valley.png includes baked graphics, so the new clean camera-valley-v1.png provides a compatible world without film perforations or grid. Original image and emulsion remain unchanged.

camera-shots.json is the serializable local plan. Position/target are end poses interpolated from the preceding shot across each shot interval. transitionFrames controls the cross-dissolve independently; filmVisible/routesVisible record the intended settled shot visibility. follow-purple, follow-cyan and aerial are reserved type names, not implemented shot behaviors. These are code-local controls, not Timeline clips or Inspector fields. Existing subtitles remain siblings above this visual clip; audio is untouched.

## Install safely

Use existing dependencies on feat/storyboard-director-ux-v2. From J:\floxbow\app:

```powershell
node projects/mai-departe-cinematic-v1/camera-integration/install.mjs --check
node projects/mai-departe-cinematic-v1/camera-integration/install.mjs
npx tsc --noEmit -p projects/mai-departe-cinematic-v1/camera-integration/tsconfig.json
node --import tsx --test projects/mai-departe-cinematic-v1/camera-integration/camera.test.ts
npm run validate
npm run typecheck
npm test
```

Already installed in this workspace. Installer normalizes line endings for SHA256 verification, rejects unknown sources, creates an exclusive backup before editing, and verifies exact installed state on repeats. It applies only an import and visual wrapper to JourneyReveal. Commit includes new code, image, tests, documentation and patch; it intentionally excludes the pre-existing working-tree JourneyReveal/JourneyWorld/Timeline edits. Requires the existing local cinematic setup with Living Emulsion; it is not a standalone project checkout. No new packages.

## Verification and limits

Dedicated typecheck and four camera tests pass: plan fits 900 frames, camera/dissolve boundary continuity, complete film removal/overview restoration, direct seeking and bounds. Project validation passes. Browser preview inspected at 11, 18 and 22 s; Electron inspected fullscreen at 18 and 27 s. Subtitles visible in world view; film and all three travelers return at 27 s. Browser error log had no errors at inspection. No offline rendering or FPS benchmark performed. Two ThreeCanvas contexts are mounted during this proof (existing world plus camera scene); no shared renderer refactor was made. Playback hardware performance is not certified.

Global npm run typecheck still fails in existing files: TS2307 in examples/capabilities/film-reveal-v1/JourneyReveal.tsx (missing JourneyWorld and motion-guides); TS2322 geometry prop on SVG line in example and project JourneyConstruction and project JourneyWorld; TS2322 number[] in example and project LuminousGateway. Reproduce with command above; expected zero errors. None are in the new camera modules.

Global npm test: 193 passed, 2 failed. Failing tests are local animator handoff appends one validated response without replacing the plan; storyboard atomic save/reload, conflict rejection, agent resolver and real subtitle adapter. Error: EPERM: operation not permitted, rename temporary storyboard.json.<uuid>.tmp to storyboard.json in the sandbox OS temp directory. Expected atomic save success. Exact local logs: typecheck.local.txt and tests.local.txt, intentionally not committed.

Asset camera-valley-v1.png generated with built-in imagegen, original film image as style reference. Full prompt in asset-prompt.txt. This is new prepared art, not a claim of reconstructing unseen geometry from the original.
