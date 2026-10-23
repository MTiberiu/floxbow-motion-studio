# Reusable animations

Prefer existing components. Project-specific components go under the project's `scenes/` or `components/`. Shared changes require authorization and tests/examples; an experiment does not automatically become SDK code.

| Component    | Props                                                       | Working use                                                 |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| KineticText  | text required; delay=0 frames; size=82 px; color=inherit    | `<KineticText text="A new idea" size={100}/>`               |
| ChatBubble   | text required; side=left or right; delay=0 frames           | `<ChatBubble text="Make it move" side="right" delay={30}/>` |
| ComicPop     | text required; color=`#c5f18a`                              | `<ComicPop text="CREATE!"/>`                                |
| Counter      | to required; from=0; frames=60 positive; suffix empty       | `<Counter to={100} suffix="%"/>`                            |
| KaraokeWords | words required; time defaults to frame/fps; color=`#c5f18a` | `<KaraokeWords words={line.words}/>`                        |
| Fade         | children; frames=15 positive                                | `<Scene from={0} duration={180}><Fade>...</Fade></Scene>`   |

This table lists React composition props. It does not promise Timeline clips or Inspector controls: for example, the registered text and motion components above are composition-level unless a component's integration documentation declares editable clip fields. Before promising that a creator can adjust a value in the editor, inspect the capability's registry entry, actual exports and `EditableComponent.fields`. A direct image import is code-driven; for an editable image, use **Media → Add PNG → Add to Timeline** and follow the [Image clip guide](STANDALONE_IMAGE.md). Use the editable project scaffold for the default workflow; custom frame-driven React animation remains appropriate for visual behavior. Disclose any requested property that would remain code-only, and proceed with a code-only project only when explicitly requested or approved.

Small, neutral previews live under `examples/capabilities/`; they import and render the real implementations. They are technical examples, not user projects or complete storyboards. A **capability** is reusable code, an **example** demonstrates a technical connection, and a **project** is a user-owned video with its own content and manifest.

Animation should depend only on frame, fps and props. Use spring/interpolate rather than CSS keyframe clocks. Avoid unseeded randomness, network fonts and asynchronous remote media. Verify beginning, transition and final frames at the project's resolution, then document props, defaults and a usage example in the registry.
