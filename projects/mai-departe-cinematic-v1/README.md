# Mai Departe — living landscape reveal proof

The first 30 seconds are a focused 2.5D proof. The prepared three-path composition, markers, future grid, track framing and source curves remain in place. The previous full-song vector treatment continues from 30 seconds through its legacy component, preserving the rest of the cut while this proof is reviewed.

The scenery uses separate transparent layers: code-built sky and atmosphere, a distant mountain cutout, a closer rocky/vegetated slope, an independently animated lake surface and a foreground shore cutout. Sparse birds and underwater fish appear later in the sample. No complete landscape photo is used as a moving wipe or repeated across layers.

`JourneyReveal.tsx` preserves the prepared reveal geometry: the left-side past region, its soft edge and the three route-aligned spray halos. The exposed 6.5-second trail sets the gap between each marker and the reveal front. One shared mask is applied to all scenic layers. The three saved curves keep their source-driven vertical positions; no current-frame recentering is used. `JourneyWorld.tsx` contains the orthographic `ThreeCanvas` scene, depth-separated parallax, image-edge color correction, water and wildlife. Three.js objects are composition-level code, not independent Timeline or Inspector clips.

The generated transparent image layers are `assets/journey-distant-mountains-v1.png`, `assets/journey-near-slope-v1.png` and `assets/journey-shore-v1.png`; `JourneyWorld.tsx` imports and uses each one independently. The original visual files and timeline are recoverable in `backups/landscape-reveal-v1/`; the legacy components are retained in `scenes/JourneyRevealLegacy.tsx` and `scenes/JourneyWorldLegacy.tsx`. Lyrics, subtitle cues and word timings, verification states and audio-analysis source documents are unchanged. No render was made. The brief's required playback/seek review and contour inspection on white, black and gray still need visual confirmation in preview.

## Sharing note
The source WAV is not bundled in this branch. After cloning, relink the soundtrack in FloxBow Media. media.json contains a generic placeholder path.


## Living Emulsion Engine (2026-10-30)

The current local cinematic proof now uses an immutable arrival-time field for its reveal. The world mask, luminous contour, tangent filaments and detached particles share this field; film-space noise does not repaint the developed interior. The existing dark cinematic image, atmosphere, travelers and saved Timeline remain intact. This supersedes the older soft-edge description above, not the saved edit. Integration, exact commands, limitations and check results are documented in [reveal-integration/README.md](reveal-integration/README.md). The engine is SVG/CSS-composited onto the existing world, with no additional WebGL renderer. Electron was visually inspected at 10 and 20 seconds, including a return seek and fullscreen at 20 seconds. No export was rendered.
