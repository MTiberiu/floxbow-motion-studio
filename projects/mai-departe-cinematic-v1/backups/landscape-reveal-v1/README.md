# Mai Departe — Three paths / landscape reveal

Current cut: full-song 2D prototype driven by the existing Phrase Emotional, Vocal Prosody and Word Gravity samples. Three shaded spheres stay near center; future grid is right, revealed past left. Scrolling film-strip edges, spray particles, layered mountains, water ripples, swimming fish and flying birds are frame-deterministic.

This is a vector visual test, not a finished photorealistic or Three.js treatment. The reveal is a soft mask with local spray halos, not a persistent particle-paint simulation. Future skills area is intentionally left blank. Existing derived curves are reused; exact numerical equivalence with the supplied HTML has not been verified.

Editable controls: visible horizon, amplitude and particle count. Source: scenes/JourneyReveal.tsx; registered in Composition.tsx; one continuous Timeline clip. No actor images are used by the current visual cut, so there is no bitmap cropping or enlargement.

Previous actor version is preserved in scenes/white-stage-timeline-backup.json, with documentation in scenes/WHITE-STAGE-README.md. Do not run prepare-film.mjs unless restoring that direction.

All non-director clips deep-compared unchanged, including subtitles, word timing, verification fields and soundtrack. No source analyses or shared code edited. No video or still rendered. Validation and TypeScript passed before the small mask correction; final checks recorded in conversation. Preview inspected at 40 seconds.

Road curves are clipped to the future half only; the revealed past shows scenery and spray without historical path lines.

Technical revision: fixed vertical curve coordinates, matte technical markers, 240px visible traveled tail. Narrative reveal treatment in scenes/REVEAL-STORY.md is planned, not yet implemented. The generated fjord is a material study only.

## Layered-world test
JourneyWorld.tsx replaces the flat landscape with three independently scrolling generated ridge silhouettes textured from the material study. Water geometry, animated surface streaks, waterfalls, mist, fine bank growth, fish and birds are independent layers. Ecology develops across traveled coordinates; the initial test is strongest around 20–95 seconds. This is a 2D material/motion test, not a completed full-song narrative or a 3D scene. The same texture is reused across ridges; remaining polish includes texture variation and a more coherent long-range environment.
