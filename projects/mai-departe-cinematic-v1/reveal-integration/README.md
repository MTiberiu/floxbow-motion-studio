# Living Emulsion integration

This delivery targets the existing local dark cinematic setup in mai-departe-cinematic-v1. It does not supply or replace the cinematic image, world components, audio or Timeline. The project is partly tracked, but newer cinematic dependencies are ignored. Consequently the commit delivers the engine plus a hash-guarded source patch, rather than committing unrelated local changes. A clean checkout without that local setup is not a standalone video delivery.

From J:\floxbow\app on feat/storyboard-director-ux-v2, with existing dependencies:

```powershell
node projects/mai-departe-cinematic-v1/reveal-integration/install.mjs --check
node projects/mai-departe-cinematic-v1/reveal-integration/install.mjs
npx tsc --noEmit -p projects/mai-departe-cinematic-v1/reveal-integration/tsconfig.json
node --import tsx --test projects/mai-departe-cinematic-v1/reveal-integration/emulsion.test.ts
npm run validate
npm run typecheck
npm test
```

Installer refuses a different baseline before writing, retains an exclusive-create backup, and is idempotent. On rejection, review patch.json against the local source; do not bypass the hash or replace the whole project. No dependencies are added. Local controls remain code-only; existing clip controls and saved props are unchanged.

Implementation: immutable analytic arrival-time field in film coordinates. Authored large lobes plus three seeded noise scales; bounded horizontal derivative ensures a unique monotone arrival. Root solving extracts a connected contour. That same sampled contour drives mask, edge illumination and the inverse road/grid clip. Filaments offset along its normals, hence follow its tangents. Particle birth positions and normals are evaluated at their birth times; subsequent advection and fade are analytic. No simulation history, feedback textures, clocks or random state. This implementation uses the existing SVG/CSS mask compositor rather than adding another WebGL context. No large disconnected blotches and no animated noise over the fully developed interior.

Limits: the silhouette is connected and single-valued in Y; it does not produce branching islands or overhangs. Existing scene art and atmosphere remain unchanged. The field guarantees persistent development in film coordinates, not a redesign of the existing plate's camera motion. The existing Timeline limits this component to its current proof segment. No full-song extension was made.

Verification: four dedicated tests pass (monotonicity, arrival/contour agreement including supported horizon extremes, seek-order invariance, sampled frame continuity). Dedicated TypeScript compilation and installer syntax pass. Project validation passes. Electron inspected at 20 seconds: cinematic plate visible, no black blotches, shared contour and bright edge aligned. No video/still render and no GPU performance benchmark; cross-GPU pixel identity is not claimed.

Global typecheck fails outside the new engine: TS2307 missing JourneyWorld and motion-guides imports in examples/capabilities/film-reveal-v1/JourneyReveal.tsx; TS2322 geometry on SVG line in examples/capabilities/luminous-gateway/JourneyConstruction.tsx and project JourneyConstruction.tsx/JourneyWorld.tsx; TS2322 number[] in examples and project LuminousGateway.tsx. Reproduce with npm run typecheck; expected zero errors. These existing files were not changed by this delivery.

Global tests: 193/195 pass. Failing tests: local animator handoff appends one validated response without replacing the plan; storyboard atomic save/reload, conflict rejection, agent resolver and real subtitle adapter. Both report EPERM: operation not permitted, rename temporary storyboard.json.<uuid>.tmp to storyboard.json in the OS sandbox temp directory. Reproduce with npm test; expected atomic save success. Full local output: test-run.local.txt (not committed).

media.json, edit-timeline.json, motion-guides.json and timing/lyrics.json SHA256 hashes are unchanged from task start. Existing working-tree modifications are intentionally not committed.
