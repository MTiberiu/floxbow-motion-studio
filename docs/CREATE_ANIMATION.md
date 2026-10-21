# Reusable animations

Prefer existing components. Project-specific components go under the project's `scenes/` or `components/`. Shared changes require authorization and tests/examples; an experiment does not automatically become SDK code.

| Component | Props | Working use |
|---|---|---|
| KineticText | text required; delay=0 frames; size=82 px; color=inherit | `<KineticText text="A new idea" size={100}/>` |
| ChatBubble | text required; side=left or right; delay=0 frames | `<ChatBubble text="Make it move" side="right" delay={30}/>` |
| ComicPop | text required; color=`#c5f18a` | `<ComicPop text="CREATE!"/>` |
| Counter | to required; from=0; frames=60 positive; suffix empty | `<Counter to={100} suffix="%"/>` |
| KaraokeWords | words required; time defaults to frame/fps; color=`#c5f18a` | `<KaraokeWords words={line.words}/>` |
| Fade | children; frames=15 positive | `<Scene from={0} duration={180}><Fade>...</Fade></Scene>` |

First Tutorial executes every non-karaoke example; GI GO LO executes KaraokeWords with explicitly synthetic demo timestamps. TitleScene is a copyable **scene template**: an arrangement of components, not a new engine. Editorial dark is a **style** (palette and typography). A **composition** is an entire video with metadata; a **component** is reusable motion with props.

Animation should depend only on frame, fps and props. Use spring/interpolate rather than CSS keyframe clocks. Avoid unseeded randomness, network fonts and asynchronous remote media. Verify beginning, transition and final frames at the project's resolution, then document props, defaults and a usage example in the registry.
