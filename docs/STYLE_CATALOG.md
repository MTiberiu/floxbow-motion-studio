# Capabilities Explorer

The Explorer reads `packages/animation-library/registry.json` through the validated `@motion/animations/registry` schema. The registry is the source of truth for stable capability IDs, categories, public APIs, parameters, editor integration, dependencies, limitations, documentation paths and technical example references.

Capabilities are reusable implementations. Examples under `examples/capabilities/` are small demonstrations that import those implementations; projects under `projects/` are user-owned videos. Examples are never auto-discovered as projects. Visual previews mount the actual Remotion component in a player; APIs without a visual output show their working source instead.

The Explorer presents a creator view and a developer/AI view. It describes the capabilities and their connection points but does not own or execute them outside the normal player/runtime. Add a registry entry only for implemented exports and a checked example. See [CREATE_ANIMATION](CREATE_ANIMATION.md), [MOTION_SDK](MOTION_SDK.md), [TIMELINE_EDITOR](TIMELINE_EDITOR.md), and [LYRICS_SYNC](LYRICS_SYNC.md) for extension guidance.
