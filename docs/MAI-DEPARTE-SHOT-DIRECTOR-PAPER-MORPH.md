# Mai departe — 59-shot director: world-to-paper morph

**Working source of truth:** `projects/mai-departe-cinematic-v1/director-shot-plan.json` (8 sections, **59 planned shots**, **239.96 seconds**). Also use `visual-phrase-plan.json` and the music/vocal analysis to align edits, accents, holds and rhythmic speed ramps. Do not move audio, lyrics or Timeline IDs. Existing white-stage shot plan provides narrative and timings; this document adds a **cinematic visual interpretation**, not a replacement of that plan.

## Central visual grammar

There are **two material styles**, not separate stories:

1. **FUTURISTIC FILM:** physically moving film, three data-driven colored travelers, dark technical grid, living burnt tear, cinematic natural world behind it.
2. **STILL PAPER:** tactile paper collage and printed photos of people, hands, bills, letters, desks, rejections, learning and hopes. Fibres, ripped or folded edges, halftone/ink, shadows and slight paper animation. No faux game UI.

**New key transition — material metamorphosis:**
Camera follows the first orange traveler through the burnt tear into a moving layered world. Camera glides toward an identifiable world element (mountain ridge, waterfall spray, bridge support, cloud). As the element fills the frame, **its silhouette is preserved but its material changes**: photographic rock texture desaturates into ink / pencil strokes; highlights become paper grain; depth becomes layered cut-outs. The camera continues the SAME forward path through this material shift. A mountain silhouette becomes a folded-paper ridge; waterfall flow becomes creased tracing paper / flowing printed lines; an arc from a bridge becomes the edge of an envelope / desk document. The same three travelers become small ink/foil marks following printed pathways. The full paper world then reveals photos of real people and narrative objects. **No cross-dissolve between unrelated stills.**

### Transition module contract
- `MaterialMorphDirector`: coordinates camera path, material progress 0..1, and source/target anchors; Remotion-frame derived
- `MorphAnchor`: `{sourceObject, targetPaperObject, silhouettePath/geometry, depth, contactPoint}`; explicit pairing, no automatic fantasy hallucination
- `WorldLayer`: rock/water/cloud/bridge object with genuine depth and alpha silhouette
- `PaperLayer`: paper texture plus physical crease/edge, with person/photo and cutout shadow
- `FilmPortal`: common reusable film tear effect (one shared function for all shots)
- `ShotDirector`: sections/shots in data, camera pose, style, tempo events, one cinematic action per shot
- `ShotThumbnail`: one **reference image** or placeholder per shot for editorial review; not a fixed whole-screen still in the final composition

### Timing / rhythm
Shot intervals come from the current plan, but **cuts, travel acceleration, material morph and holds** should also snap to real music events, prosody peaks, phrase starts and phrase ends. A transient can trigger a brief push/speed ramp; hold or slow drift during emotionally weighted long syllables. Do not apply a random speed curve. For each shot store `musicEventRef`, `lyricRef`, `visualAccent`, and `transitionType`. Require a director review before forcing beats on a whole verse.

## Eight existing sections (avoid inventing new timings)

| Section | Source time | Existing shots | Visual style / story |
|---|---|---:|---|
| S01 Instrumental | 00:00–00:13 | 4 | FUTURISTIC FILM: running 3-route film → luminous tear → fly into valley. Music establishes travel and motion |
| S02 Burden & work | 00:13–00:55 | 9 | First nature-to-PAPER morph, mountain contours become folded paper, bridge arc becomes desk paper; photos of a person delaying, everyday bills fall and accumulate, tangible rhythm |
| S03 Decision | 00:55–01:38 | 14 | PAPER: hand-written plans, paper footsteps, torn fear-note becoming purposeful direction; temporary FUTURISTIC inserts on strong accents |
| S04 Rejection & return | 01:38–02:20 | 10 | PAPER: interview/rejection printed photo becomes folded letter; character returns to work, warmth grows gradually |
| S05 Keeps going | 02:20–02:48 | 8 | HYBRID: paper fragments become topographical contours and film routes again; build an ascending journey |
| S06 Bridge | 02:48–03:02 | 4 | FUTURISTIC ↔ PAPER: paper plan lines extrude into an unfinished luminous bridge, hesitate then advance |
| S07 Final chorus | 03:02–03:31 | 6 | FUTURISTIC + warmer PAPER intercuts; three travelers converge, cinematic aerial resolution, photos and paper annotations return as proof of progress |
| S08 Outro | 03:31–04:00 | 4 | PAPER then final film wide pull-back, quiet human close-up, unfinished but peaceful ending |

**Important narrative constraint:** S02 begins at 13.03 s while the existing Camera Director proof stays fullscreen until 23 s. Do not blindly overlap them. Re-author that 13–30 s passage so first lyric and first material morph are visible while the camera continuity remains intact. The **actual song lasts ~240 s**, not 180 s; prior 180-second plan was incomplete.

## Thumbnail/reference art policy
One image reference per shot (59 slots), tagged with `shotId`, camera framing, material style, subject, narrative emotion, source credit. Rendered reference images are **planning assets** only; live video objects must have movement/depth. In the paper style include images of people matched to lyrics, not 59 arbitrary landscape posters. No image generation until storyboard requires a specific reference; preserve sources/rights.

## Acceptance of first integrated sequence
At 0–13 s the film runs and camera flies through **the existing rupture**. At 13–30 s show active depth and the first physically matched mountain-to-paper change with continuous motion, and at 30–55 s paper characters, hands/bills/photos act in rhythm to the real lyrics. The paper image must transform an on-screen identifiable world contour, not cover it suddenly. Tracked shot metadata carries the entire film even if visual assets are still pending.

## Do not silently claim completion
The current compositor still has two world layers and a CSS portal; these are not a true unified camera yet. The source valley images still have a baked bridge. This document establishes shot/story constraints, not final layered art or finished rendering. Developer must check the shared Electron workspace and run local tests. Do not touch audio, subtitles, `edit-timeline.json`, `media.json` or timing guide files.
