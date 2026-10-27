# 05 — Director transcript, AI Visual Context and reusable motion

## Human experience: Canvas first

A creator can work with only the Canvas/preview and a timed story, opening tools as needed. The existing editor supports Timeline and selection; the Timeline can be detached to work adjacent to the Canvas or on another display. Do not force a permanently overloaded layout.

A **Director Transcript** is proposed as a contextual, time-synchronized view into the plan, like a transcript or list of shot cards, not an extra production Timeline. It should coexist with the existing Editor and Storyboard UX and respect the actual dockable workspace implementation. Whether the first version is a right-hand box, inspector tab, docked view or contextual toggle must be based on workspace audit.

### Proposed selection and copy workflow

1. Playhead at an actual frame; show the planned shot and event(s) for that moment.
2. Creator can select **multiple shots**, events or subsets of directives *independently of clip selection*. Example: select shot 2 and 3 while playhead sits in shot 4.
3. Creator sees planned time, executed time if implemented, asset/effect requirements, original intent, and missing coverage in the same contextual view.
4. **Attach selected Director context to existing AI Visual Context capture**: current screenshot or visual selection (where supported), project ID, exact global frame/time, current elements and associated code/media paths, selected immutable Director revision, shot/event IDs and *full selected directives*.
5. Copy/send is **an external agent handoff**; no built-in chatbot/model required. User can add free-form feedback (“the branch growth here is missing; compare shot 2 and 3 with the plan”).
6. Agent follows stable references to local files and fixes the implementation; changes in execution are logged without mutating approved direction.

### Copy payload sketch

```text
FLOXBOW VISUAL CONTEXT
Project: demo-film
Playhead frame: 372 (12.400 s at 30 fps)
Screenshot: <actual supported capture reference>
Selected plan revision: <hash>
Selected director shots: shot-02, shot-03
Selected event IDs: event-glow, event-tree
Source: <validated project-relative path OR existing storyboard plan ref>
Required: <verbatim selected instructions>
Implementation: <actual project-local TSX / Timeline clip IDs if known>
User message: <free-form correction>
```

The example IDs/times are fictional. Do not expose arbitrary host paths. Reuse `docs/STORYBOARD.md` AI Visual Context and `docs/ARCHITECTURE.md` sandbox restrictions. **Verify existing editor AI Visual Context capture support in current source**; don't assume the Storyboard request UI is identical to clip/frame screenshot capture. If unavailable, design additive integration, not a fictional immediate feature.

## Coverage and review

**Static checks:** missing implementation bindings, unreferenced events, absent assets, invalid ranges, stale revisions, code scaffold drift, known clip IDs.  
**Runtime checks:** typecheck/build, preview seek, actual asset visibility and scene overlap, render/still.  
**Visual checks:** an agent/human must **watch** shot motion and compare meaningful effects; metadata cannot prove a tree grew from a character's chest rather than a generic zoom.  
**Human acceptance:** story intention and emotional effect approved, separate from compile/render success.

Proposed coverage states: `unplanned`, `planned`, `scaffolded`, `implementing`, `technically_verified`, `visual_review_needed`, `reviewed`, `approved`. Be careful: some are inferred automatically, some manually attested, some have explicit evidence.

## FloxMotion: extendable motion system, not a duplicate Remotion

Director uses expressive, semantic directives: “shadow crosses the Caucasus” and “tree grows from chest.” Animator uses a real registry of capability IDs **only when the capability exists**. A missing capability is a technical dependency, not permission to render a zoom instead.

Start by inspecting `packages/animation-library/registry.json`, `packages/animation-library/src/index.tsx`, `@motion/sdk`, `@motion/sdk/editor` and current Timeline behavior hooks. Desired capabilities are:
- reusable frame-pure transforms / easing / keyframes;
- separation of camera framing from subject motion;
- localized reveal, mask, growth, glow, shadow, ripple;
- foreground/background parallax, 2.5D layer compositing;
- parameter schemas and proper Inspector editability where actually supported;
- preview / seek / reverse seek / export determinism.

**Do not rebuild a general animation runtime by default.** Assess Remotion primitives first and adopt targeted reusable FloxMotion abstractions. Compare GSAP only for concrete gaps (absolute frame seeking, deterministic evaluation, browser/runtime interaction, preview/render parity, licensing and bundle impact). GSAP is a possible implementation detail, never a product requirement.

## Film rhythm criteria

No constant appearance/disappearance of every subtitled noun. Use staging, continuity, events that overlap naturally, and a perceptual hold when an important transformation concludes. A fast montage can be intentional, so use warning-only heuristics, not shot-length restrictions. Distinguish camera move from meaningful semantic action.

## Interoperability / review return path

Keep external agent handoff human-copyable (no special model required). A correction references exact `sceneId`, `shotId`, `eventId`, capture frame and plan revision, so the same or a different agent can find evidence and continue. The Creator should be able to use a single Canvas with low UI clutter, while power users can manually select and adjust through the existing editor.
