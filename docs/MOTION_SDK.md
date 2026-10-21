# Motion SDK 0.1.0

Stable entry points are workspace package names, not relative imports into internals.

| Export | Parameters / behavior | Example |
|---|---|---|
| Canvas | children, background=`#101725`, optional CSS style; full frame, 80px padding | First Tutorial |
| Scene | from (absolute parent frames), duration (positive frames), children; resets local frame | First Tutorial |
| Fade | children, frames=15 (>0); use inside a Scene; keep scene longer than twice fade frames | First Tutorial |
| progress | frame, start, end with end>start; clamped 0..1 | KineticText implementation |
| secondsToFrames | seconds, fps; rounds to nearest frame | `secondsToFrames(2,30) === 60` |
| useCurrentFrame | current scene-relative frame | GI GO LO |
| useVideoConfig | fps, resolution, active duration | GI GO LO |
| spring, interpolate | Remotion contracts, deterministic frame-based motion | ComicPop |
| AbsoluteFill, Sequence, Audio, Img | standard Remotion components | use local asset imports |
| AudioReference | src URL, startFrom=0 source frames, volume=1 | Narration |
| TimedWord, TimedLine, LyricTimeline | canonical seconds-based timing; null means unknown | GI GO LO timing JSON |

`@motion/audio` exports `Narration({src,startFrom=0,volume=1})`. Example: import a local WAV then render `<Narration src={voice} volume={0.8}/>` inside a composition. Audio source trimming is in frames; lyric timestamps are seconds. This distinction must remain explicit.

All component parameters and concrete examples are listed in `packages/animation-library/registry.json` and `docs/CREATE_ANIMATION.md`. SDK compatibility is exact `0.1.0` for this first milestone; range negotiation is deferred. Use a proposal before extending core contracts.
