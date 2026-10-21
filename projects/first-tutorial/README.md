# First Tutorial

An 18-second English explainer about a reusable AI motion toolkit. Editorial demo text, no recorded narration.

| Frames | Scene | Reuse |
|---|---|---|
| 0–179 | Idea/title with moving geometric outline | Canvas, Fade, KineticText |
| 180–359 | Agent conversation | ChatBubble, KineticText, Fade |
| 360–539 | Reusable toolkit and counters | ComicPop, Counter, Fade |

`Composition.tsx` owns the sequence; `scenes/TitleScene.tsx` is a copyable template. `storyboard.json` contains the script and frame plan. `assets/` is reserved for project media; no external assets/fonts are used. Dependencies: @motion/sdk and @motion/animations. Arial/system fallback keeps preview and render offline.

Run `npm run dev` and select First Tutorial. Export with `npm run render -- first-tutorial`. The project contains all its content and does not require an app-source modification.
