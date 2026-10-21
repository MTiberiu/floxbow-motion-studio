# Extending the subtitle module

Keep semantic text and timing in `clip.content`; keep type, color, position and other visual choices in `clip.props`. Do not put appearance in the timing interchange format. The frame-based project `edit-timeline.json` remains the one saved, editable subtitle timeline; seconds-based import data is only an interchange representation.

When adding an editable field, declare it in `subtitleFields`, validate its supported value in `packages/motion-sdk/src/timeline.ts` if it needs a new field type, and make the `Subtitles` renderer consume it. The editor builds controls from `EditableComponent.fields`; do not add a subtitle-specific Inspector widget for a field that the existing field schema can express.

When changing text/timing behavior, keep stable clip and word IDs where possible. Never infer word timestamps from corrected text. If words no longer correspond to text, retain existing timing evidence and do not highlight it as though it matched. Add tests for correction, segment movement/trimming and timing import/export.

For an additional module, register its own `EditableComponent` in the project composition and use the existing timeline clip and field contracts. Keep module-specific parsing and transforms in the module package. The editor shell currently has dedicated subtitle import/export buttons; do not generalize them into an executable plugin system until another concrete module needs the same integration contract.

Run `npm run typecheck`, `npm test`, `npm run validate`, `npm run build`, `npm run test:smoke`, and `npm run test:editor` for changes that cross the package/editor boundary. The example in [`examples/subtitle-timeline.tsx`](./examples/subtitle-timeline.tsx) is the smallest full composition integration.
