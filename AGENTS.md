# FloxBow coding-agent guide

This repository contains a reusable motion toolkit. User videos belong in `projects/<id>/`; examples under `examples/` are technical demonstrations, not user projects. Start with [the module index](docs/MODULES.md), then read only the guide selected for the task. Follow [the AI workflow](docs/AI_WORKFLOW.md) for creative-task routing and human review.

## Safety and compatibility rules

- For a video task, create or edit only that video's README, manifest, composition, scenes, local assets, script/storyboard and timing data. Do not modify another video.
- Do not modify `apps/`, `packages/`, shared dependencies, scripts, SDK contracts or other shared application code without explicit user authorization. A request to create a video does not authorize infrastructure changes.
- Do not install or execute unreviewed third-party project code. Remove private data from reports and examples.
- Keep compositions deterministic functions of frame and props: no `Date.now`, unseeded randomness, network fetches or time-based animation loops. Use `Scene` for relative frame positions.
- Never invent trustworthy lyric timing. Keep unmatched word boundaries `null` with confidence zero; label synthetic example timing and never present it as aligned evidence.
- Before changing the shell, timeline, player, renderer, project loader, SDK, lyrics synchronization, audio or reusable animation packages, read [the module integration blueprint](docs/MODULE_INTEGRATION_BLUEPRINT.md), [the architecture overview](docs/ARCHITECTURE.md), and the relevant guide from the [module index](docs/MODULES.md). Follow documented exports and versioned contracts. Update relevant documentation and contract tests when a public connection changes. Do not create empty API or extension documents or add a plugin framework without a concrete integration need.
- Never hide failed checks. Report the project ID, command, exact error, reproduction and expected behavior; state what was actually tested.

For a 2.5D dancing or talking mascot, see [Characters](docs/CHARACTERS.md) and use registered `@motion/characters` exports rather than authoring an unrelated animation system. Subtitle clips own speech timing; no automatic audio connection is claimed.\n\n## Route the task

- **Create a video:** read [Create a video](docs/CREATE_VIDEO.md), then open only the relevant module guide and the [capability registry](packages/animation-library/registry.json). Use registered components before writing project-specific motion. Project IDs use lowercase letters, numbers and hyphens; the manifest SDK version is `0.1.0`.
- **Change shared application behavior:** identify the subsystem in [the module index](docs/MODULES.md), read its guide and integration contracts, and confirm the user authorized shared-code scope. For an engineering investigation, use `improvements/experiments/<id>/`; for a meaningful proposal, copy `improvements/proposals/TEMPLATE.md` and document evidence, performance, compatibility and licensing. Core integration requires an explicit decision.
- **Use or extend a capability:** examples are under `examples/capabilities/`; reusable implementations are described by their module guide and, for animation components, the registry. Do not create a user project just to demonstrate a capability. Import only browser-safe package exports in compositions.

For video tasks, run `npm run validate`, `npm run typecheck` and `npm test`; run `npm run dev` and inspect multiple playback points. Render with `npm run render -- <id>` only when requested. Output goes to `out/<id>.mp4`; use `--still` for a proof frame. Follow any narrower task-specific verification instructions and report the actual results.

The runtime iframe is a stability boundary and browser capability restriction. It does not authorize running hostile code in build or render tools. Repository-agent permissions are separate from Electron runtime settings.
