# Explainer workflow

Input contract: script, optional narration and measured timestamps, desired visual approach, dimensions/FPS and local media. No AI provider API is embedded; a human or external coding agent writes the composition inside a single project.

1. Read the script and identify the visual beats.
2. Draft a storyboard with scene purpose, explicit frame ranges and the capabilities to reuse.
3. Use measured narration timestamps where supplied; otherwise label timing as an editorial estimate.
4. Compose scenes with the stable SDK imports and a project-owned `Composition.tsx`.
5. Import local narration from the project when available.
6. Preview, inspect transitions at exact frames and render when requested.

Use `examples/capabilities/` for short API demonstrations. It contains no complete story or user project. Timing conversion is `Math.round(seconds * fps)`; keep source synchronization in seconds and rendered clip boundaries in integer frames.
