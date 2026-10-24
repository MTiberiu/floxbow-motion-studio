# Future Visual Capabilities — Research & Backlog (NOT IMPLEMENTED)

Recorded 2026-10-23. Product ideas from the owner and a conversation with the animator after a successful independently produced Three.js globe video. This is **management research**, not a developer task for the current Core Editor milestone, not a claim that any component exists, and not authorization to expand PR #38. The current priority remains: merge accepted PR #38, then left-side Media Library, ordinary video/audio clips, multilayer scene editing, canonical AI/editor handoff and integrated render test.

## Product insight

A convincing animation often combines independently animated assets/objects rather than one full-frame image plus a zoom. A working holographic globe film took considerable work to rebuild accurate geography, project geographical markers and labels, generate curved routes, compose HUD elements, and make effects deterministic at arbitrary time. Do not generalize a polished-looking globe as geographically accurate: in the test, map outlines and city positions were NOT independently validated.

Separate (a) *creative selection / technical-recipe discovery skills* from (b) *reusable editor capabilities and data services*. Avoid one-off hardcoded "spectacular globe" as the foundation. Build reusable primitives when multiple scenarios justify them; layer a domain-specific globe preset over them.

## Candidate reusable capabilities — after current editor milestone

| Candidate | General purpose | Globe use case | Scope / constraint |
| --- | --- | --- | --- |
| Asset & data library | Versioned/imported images, video, audio, fonts, JSON/CSV/GeoJSON and provenance | Geographic datasets, textures, markers, icon assets | Prefer local, redistributable data; keep existing assetId distinct from clip ID; don't build unrelated cloud infrastructure |
| Layered scene assembly | Independently manipulable layered media/objects, opacity, z-order, grouping | Globe background, continents, trails, labels, glow, HUD | An initial slice belongs to Core Editor; do not imply full scene graph already exists |
| Reusable property keyframes | Deterministic frame-positioned property curves, easing, preview/export parity | Camera moves, arc reveals, packet motion, opacity | Design against canonical timeline v1; do not launch a second animation format casually |
| Scene camera & lighting presets | Camera transforms, camera paths, lights, rig presets | Orbital flythrough, Fresnel rim, cinematic lighting | Only if a real 3D scene integration need is demonstrated |
| Paths, tracks & attachment | Curves/paths, animated progress, anchors, labels bound to moving objects | Great-circle routes, packets, geolocated labels | Reusable also for diagrams, schematics, vehicles and motion trails |
| 3D object/material/effect support | Reusable primitives, materials, shader recipe inputs, postprocessing | Sphere, dots, atmosphere, bloom | Engine-neutral API where practical; do not block all creative output on generic 3D infrastructure |
| Optional geospatial globe kit | Real Earth geometry, place lookup, lat/lon → 3D coordinates, route interpolation, visibility and projections | Correct continental shape, accurately placed cities, routes | Specialized composition of general capabilities, not a mandatory Canvas Core primitive |

## Geography: verified candidate data sources

- **Natural Earth** https://www.naturalearthdata.com/ — public-domain vector/raster geography, available at 1:110m, 1:50m, 1:10m. Also supplies populated places. https://www.naturalearthdata.com/about/terms-of-use/ and https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
- **world-atlas TopoJSON** https://github.com/topojson/world-atlas — convenient bundled Natural Earth land/country shapes in geographic longitude/latitude. Repository is archived, data should be version-pinned, and 110m outlines are generalized. NOT a city-coordinate database.
- **GeoNames** https://www.geonames.org/export/ — global place names, WGS84 lat/lon, downloadable extracts and web API; free data under CC BY attribution, API has rate limits (published 1,000 credits/hour and 10,000/day), no guarantee of accuracy. Prefer a versioned local city subset for offline reproducible rendering instead of making live API requests per render.

The phrase "free geographical API" does not imply accuracy or stability. A *local, sourced, versioned dataset* may be superior for common cities and world-scale animation; online lookup is an optional enrichment step. Keep coordinate system explicit (WGS84 lat/lon, axis convention, globe radius, longitude sign), handle city-name ambiguity, back-side occlusion and projections, and cross-check against source facts. Great-circle arcs imply illustrative shortest spherical paths, **not necessarily real internet-packet routes or network latency**. Distinguish pedagogical visualization from actual network telemetry. Geographic boundary portrayals may be disputed.

## Proposed skills / recipes for later experiments

- **Visual solution discovery:** brief interpretation → competing visual solutions → selection rationale → technical ingredients → render/critique.
- **Scene decomposition:** identify independently animated PNG layers (foreground/midground/background), object masks, labels, highlights, FX and compositing dependencies. Avoid full-screen image + generic zoom when separation materially improves communication.
- **Technical recipes:** globe/geo projection, shader atmosphere, smoke, HUD composition, moving labels, path animation and deterministic time-based effects. Extract the decisive technical features from a verified successful video first, rather than creating hundreds of vague skills.
- **Lookdev & craft references** already inventoried in `management/CREATIVE_DIRECTOR_RESEARCH.md` (Disney animation process, director-skills, vision_art_creator, StudioBinder, Veo guide, OpenFilm). Verify licenses before copying source material.

## Future proof-of-concept and acceptance criteria

1. Baseline a brief prompt (e.g. "show data packets travelling across a 3D Earth") against the already successful detailed prompt.
2. Provide selected skills and curated local recipes without the original long prompt; see if the agent independently identifies geo datasets, coordinate conventions, camera/light, HUD anchoring and arc math.
3. Require a reusable test scene: city labels placed from verified lat/lon; Earth geography checked against references; front/back occlusion; seek to arbitrary frame with identical output; exported frames/video compared against preview; multilayer objects separately editable as supported.
4. Extract general modules only if demonstrated useful beyond globe (route on flat map, motion trails, object-following labels, network diagram). Record discrepancies honestly, including visually appealing but inaccurate data.

**Decision gate:** research backlog only. Owner and AI Manager choose a separate future milestone once the editor basics and integrated user workflow are complete. No new developer work authorized by this file.
