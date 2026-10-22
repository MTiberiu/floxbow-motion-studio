# Motion SDK 0.1.0

Stable entry points are workspace package names, not relative imports into internals.

| Export                              | Parameters / behavior                                                                   | Example                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Canvas                              | children, background=`#101725`, optional CSS style; full frame, 80px padding            | `examples/capabilities/visual.tsx`         |
| Scene                               | from (absolute parent frames), duration (positive frames), children; resets local frame | `examples/capabilities/visual.tsx`         |
| Fade                                | children, frames=15 (>0); use inside a Scene; keep scene longer than twice fade frames  | `examples/capabilities/visual.tsx`         |
| progress                            | frame, start, end with end>start; clamped 0..1                                          | `packages/animation-library/src/index.tsx` |
| secondsToFrames                     | seconds, fps; rounds to nearest frame                                                   | `secondsToFrames(2,30) === 60`             |
| useCurrentFrame                     | current scene-relative frame                                                            | `examples/capabilities/visual.tsx`         |
| useVideoConfig                      | fps, resolution, active duration                                                        | `examples/capabilities/visual.tsx`         |
| spring, interpolate                 | Remotion contracts, deterministic frame-based motion                                    | `packages/animation-library/src/index.tsx` |
| AbsoluteFill, Sequence, Audio, Img  | standard Remotion components                                                            | use local asset imports                    |
| AudioReference                      | src URL, startFrom=0 source frames, volume=1                                            | Narration                                  |
| TimedWord, TimedLine, LyricTimeline | canonical seconds-based timing; null means unknown                                      | `examples/capabilities/lyrics.ts`          |

`@motion/audio` exports `Narration({src,startFrom=0,volume=1})` for composition-owned audio and `SoundtrackAudio({src})` for the timeline integration. The player and renderer use `TimelineSoundtrackAudio` from `@motion/sdk/editor` to render registered soundtrack clips in the same Remotion composition as the video. In ordinary projects, use Media → **Use as soundtrack** so FloxBow can keep the stable media ID on the visible Audio track and resolve the local path in the host. The single soundtrack clip stays fixed at frame zero with its full source duration and track; moving, trimming and mixing are unavailable. See [Project Media Registry](PROJECT_MEDIA.md) and `examples/capabilities/audio.tsx`. Audio source timing is in frames; lyric timestamps are seconds. This distinction must remain explicit. Audio effects and waveform editing are not implemented.

The Capabilities Explorer reads parameters and example references from `packages/animation-library/registry.json`; the examples are compiled by the workspace typecheck. SDK compatibility is exact `0.1.0` for this first milestone; range negotiation is deferred. Use a proposal before extending core contracts.
