# Character animation module

See [@motion/characters](../packages/characters/README.md) for the implemented public API and [Mascot Dance Playground](../projects/mascot-dance/README.md) for the end-to-end sample. Characters are a family of reusable visual capabilities, not a second timeline or a general plugin runtime. The first module is a lightweight 2.5D procedural mascot. AI authors validated `mascot-2p5d` clips; the existing editor owns timeline transport, persistence, undo/redo and property changes. The subtitle clip is the sole speaking-time authority; linked audio is not required for this demonstration.

Future work: multi-clip dialogue mapping, transitions/motion paths, track-aware character continuity, audio playback and provider-aligned lip sync. Neither an autonomous AI director nor audio-driven speech is implemented here.
