# Explainer workflow

Input contract: script, optional narration and measured timestamps, requested style, dimensions/fps, and media assets. No AI provider API is embedded. An external agent interprets these inputs and writes code inside one project.

1. Read script and identify a small set of ideas.
2. Write storyboard entries with purpose, start frame, duration and selected registry components.
3. Use measured narration timestamps where supplied; otherwise label durations as editorial estimates.
4. Create scenes with `Scene` and stable SDK imports.
5. Import local narration with `@motion/audio` when available.
6. Preview, revise composition files, inspect transitions and render on request.

`projects/first-tutorial/storyboard.json` is a concrete input/output example with three 180-frame scenes. Its title scene, conversation and toolkit summary demonstrate six shared animations. It has no narration and makes no claim of speech synchronization. Timing conversion is `Math.round(seconds * fps)`. Keep source seconds in synchronization files and frame ranges in the storyboard.
