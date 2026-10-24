# Visual Inspection Context Resolver — R&D Results

Date: 2026-10-24
Branch: `feature/whisper-workflow-validation`
Status: local experimental CLI; read-only

## How to call it

From the repository root:

```powershell
node research/visual-scene-inspection/context-resolver.mjs <capture-id> [--target <clip-id>] [--mode summary|source|fields|temporal] [--window <frames>] [--json]
```

Examples using the real `ai-video-origin-story` captures:

```powershell
node research/visual-scene-inspection/context-resolver.mjs bf8f74ab-62ff-418d-a9ed-a21311f056fb --target thumbnail-no-editing
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode source
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode fields
```

This implementation is a standalone Node CLI because Codex can call it directly in the existing checkout. It needs no running Electron window, server endpoint, new dependency, MCP server, or UI action. Capture UUID and project ID are validated; paths are fixed under `projects/<id>/.floxbow/visual-inspection/`. It reads only the capture inspection JSON, canonical project Timeline and project `Composition.tsx`, with file-size limits. It never writes project files.

The default summary resolves captured visible nodes and Timeline-index entries, reads the current Timeline to calculate a revision hash and nearby events, and locates a registered component symbol in the project's composition source. `--mode source` returns the owning symbol excerpt, `--mode fields` returns the component's current field schema and captured field values when available, and `--mode temporal` can widen the frame window. `--json` returns the same context as structured data.

## Case A — `thumbnail-no-editing`, frame 161

Command:

```powershell
node research/visual-scene-inspection/context-resolver.mjs bf8f74ab-62ff-418d-a9ed-a21311f056fb --target thumbnail-no-editing
```

Verified result:

- Captured frame 161 at 30 FPS; target is `thumbnail-no-editing`, global clip range 128–165, captured local frame 33.
- Resolved component `clickbait-thumbnail` to `ClickbaitThumbnail` in `projects/ai-video-origin-story/Composition.tsx:902-986`.
- Timeline revision is **stale**. The artifact captured `content.expandOnClick=true`; current canonical Timeline has `false`. The resolver displays the difference explicitly and labels current props as current-revision values.
- Nearby canonical Timeline events show the three thumbnails and click/portal overlays beginning at frame 128/145, ending at 165, and `tutorial-promise` starting at 165. At frame 161 the current Timeline has nine active clips; the older capture indexed eight.
- The source contains the expansion interpolation, text fade calculation and independent card opacity/fade. The resolver points to the owning component range; it does not pretend it can infer which expression is causally responsible for a screenshot symptom.

## Case B — composite `tutorial-promise`

Command:

```powershell
node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode source
```

Verified result:

- The capture is global frame 195 at 30 FPS. Its registered elements report local frame 30 for the parent `tutorial-promise`; the current canonical clip is frames 165–570, which also maps global 195 to local 30.
- The capture identifies three `tutorial-dragon-*` nodes as `code-owned` children and `tutorial-sample-caption` as a Timeline-field-bound child. They all resolve to parent component `tutorial-bait`; they are not falsely returned as separate Timeline clips.
- Source resolves to `TutorialBaitSequence` at `Composition.tsx:823-886`. The excerpt shows its internal local-frame beat boundaries, opacity intervals, dragon row, prompt/form/money/dragon sequence and typed text content.
- Source mode also follows directly referenced local JSX helpers and returns `DragonStageBackdrop` and `TutorialDragonRow` excerpts. That exposes the dragon bounce/rotation/sway formulas without treating each sprite as a Timeline clip.
- `--mode fields` reports the current declared fields (sample line, setup, prompt, pitch, button/form labels, money line and dragon reply). The old schema-v1 capture did not include a Timeline clip snapshot or source fingerprint, so the resolver explicitly says those current values and source fingerprint are not proven to match the captured revision.

## Checks and measurements

- Case A JSON assertions passed: frame 161/local 33, `ClickbaitThumbnail`, stale revision, `expandOnClick` drift true → false, and the frame-165 parent start event.
- Case B JSON assertions passed: frame 195/local 30, four captured child nodes, three code-owned dragons, `TutorialBaitSequence`, and no claim that a historical Timeline entry exists in that schema-v1 capture.
- Field retrieval assertions passed for `sampleLine` and `dragonLine`; malformed capture ID is rejected.
- SHA-256 checks of `edit-timeline.json` and `Composition.tsx` before and after all resolver calls were unchanged.
- Local Node process wall times (includes process startup): Case A summary 151 ms, 4,533 output characters; Case B source with direct local helpers 152 ms, 15,542 characters; Case B fields 125 ms, 3,991 characters. These are measured CLI timings and output sizes, not Codex reasoning time or token counts.
- The resolver reads three bounded project files: Case A inputs were 23,013-byte `inspection.json`, 23,222-byte `edit-timeline.json`, and 71,417-byte `Composition.tsx` (117,652 bytes read in total). It returns a compact context summary by default and fetches the component excerpt only in source mode. No entire project folder is loaded.
- No tokenizer or historical model-token telemetry is available here, so actual token savings cannot be claimed.

### Comparison with the existing Visual Inspection workflow

The current package already does the important visual-to-Timeline mapping for schema v2. The old workflow then requires the agent to follow its paths, inspect the JSON, search/open the owner component, inspect current Timeline state to detect staleness, and assemble nearby events. The resolver packages those same three canonical data sources behind one Codex-callable command, performs no manual source search, and adds revision drift plus a bounded previous/next event list in its first response. On this run it resolved both targets correctly; the source and field detail modes supplied deeper context on demand.

The historical workflow has no operation logs, so its exact number of past reads/searches and elapsed time cannot be reconstructed reliably. For that reason this comparison reports the resolver's measured call latency and output size, but makes no numeric speedup or token-reduction claim. A controlled, repeated A/B benchmark should be run once the interface and captures are stable.

## What worked and what remains hard

- **Worked:** a capture UUID is enough to reach owner clip, component, current canonical state, staleness, nearby clip boundaries and source symbol without broad repository search.
- **Worked:** schema-v2 provides historical field values that can be diffed against current project values; schema-v1 visual nodes still resolve to their parent clip, with historical values clearly unavailable.
- **Worked:** a composite's semantic children remain visual nodes owned by one parent clip. Its editable schema comes from the parent component declaration.
- **Still difficult:** source lookup currently supports an `EditableComponent` registered in the project-local `Composition.tsx`. Imported/shared module components need an explicit source mapping before the resolver can navigate there.
- **Still difficult:** exact expression causality and DOM/WebGL pixel occlusion are not inferred. Source excerpt gives a symbol/range; internal timeline beats are visible in the code excerpt but are not represented as Timeline events unless authored metadata is added.
- **Staleness limitation:** the current capture schema has no composition source fingerprint. The resolver reports this as “not recorded at capture” and never labels today's source as historically identical.

## Files and scope

This is experimental research tooling only. It does not modify the Editor, Timeline, composition, project manifest, dependencies, or Visual Inspection UI. Continue to treat Timeline v1 as canonical. The current implementation is intentionally local to this repository and this project's `Composition.tsx` registration shape.
