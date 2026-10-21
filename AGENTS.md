# AI Motion Studio: agent contract

This workspace gives AI agents a reusable motion toolkit. Videos belong entirely in `projects/<id>/`; the app discovers them automatically.

## Allowed work

For a video task, create or edit that video's README, project.json, composition, scenes, local assets, script/storyboard and timing data. Read shared packages and documentation. Use `improvements/experiments/<id>/` for isolated investigations and `improvements/proposals/` for meaningful proposals.

Do not modify `apps/`, `packages/`, shared dependencies, scripts, SDK contracts, or another video without explicit user authorization. Do not install or execute unreviewed third-party project code. The initial foundation task authorizes infrastructure implementation and its validation; this restriction governs subsequent video-generation tasks.

## Build a video

1. Read `docs/CREATE_VIDEO.md`, `docs/MOTION_SDK.md` and `packages/animation-library/registry.json`.
2. Run `npm run create:project -- unique-id`. IDs use lowercase letters, numbers and hyphens.
3. Write a script and storyboard with explicit frame ranges. Use the registered components before adding project-specific motion.
4. Edit the project's default-exported React component. Keep assets in the same project and import local asset URLs. Manifest SDK version is exactly `0.1.0`.
5. Run `npm run validate`, `npm run typecheck`, and `npm test`. Run `npm run dev`; select the new project and inspect multiple points in playback. Edits reload the frame automatically.
6. When requested, run `npm run render -- <id>`. Output is `out/<id>.mp4`. Use `--still` for a proof frame.
7. Update the project README with scenes, assets, attribution, timing source and dependencies. Report what was actually tested.

Components must be deterministic functions of frame and props: no Date.now, unseeded randomness, network fetches or time-based animation loops. Use `Scene` for relative frame positions. Do not invent trustworthy lyric timing: retain nulls and confidence zero for unmatched words; demo timing must remain labeled.

## Discover and reuse

The registry distinguishes `style` (visual rules), `component` (reusable animation), `scene-template` (copyable arranged scene) and `composition` (whole video). Each entry includes a working example and component parameters. Stable imports are `@motion/sdk`, `@motion/animations`, `@motion/audio` and `@motion/lyrics-sync`. Import only the browser-safe project schema subpath in compositions.

## Issues and improvements

Report project ID, command, exact error, reproduction and expected behavior; remove private data. Never hide failed checks. Review potential reusable components after a video, but do not move them into stable packages automatically. Copy `improvements/proposals/TEMPLATE.md` for meaningful findings; record performance, compatibility, license and evidence. Acceptance requires an explicit decision before core integration.

The runtime iframe is a stability boundary and browser capability restriction. It is not permission to execute hostile code in the build/render tools. Repository agent permissions are separate from Electron runtime settings.
