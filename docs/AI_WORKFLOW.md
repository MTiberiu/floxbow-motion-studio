# AI task routing and collaboration

Start with the task-specific entry in [AGENTS.md](../AGENTS.md), then use [the module index](MODULES.md) to select the smallest relevant guide. Do not preload unrelated subsystem documents. Check source and package exports when the task depends on an exact API or implementation status.

## Choose the right scope

For a video or animation project, follow [video creation](CREATE_VIDEO.md) or the [explainer workflow](EXPLAINER.md), then work only in the target `projects/<id>/` folder. FloxBow projects default to the official editable Timeline scaffold. Before implementation, inspect the relevant module guides, actual package exports, declared `EditableComponent.fields`, and [capability registry](../packages/animation-library/registry.json). Map each property the user expects to adjust into a supported Timeline clip and real editor control. Registry parameters and renderable React props describe component APIs; they do not by themselves create Timeline or Inspector controls.

Use subtitle clips for lyrics or dialogue intended to behave as subtitles. Use suitable visual components for titles, labels and other text. Custom React composition and animation logic remain valid for visual behavior; they do not all need Timeline controls. If a property is promised as user-editable, expose a real editor control or explain before implementation that it will be code-only. A wholly code-only project is allowed only when the user explicitly requests it or approves it after the limitation is explained. Do not infer editability from a render-only component or a direct image import. A technical example demonstrates an API and is not a user project. If a reusable capability needs shared application changes, describe the boundary and wait for separate explicit authorization.

For application or core development, identify the owning subsystem in the module index, read [the architecture overview](ARCHITECTURE.md), [the module integration blueprint](MODULE_INTEGRATION_BLUEPRINT.md), and only the relevant subsystem contract. Consult `improvements/proposals/` for engineering designs and decisions; consult `management/` when product priority or a durable product decision affects the task. Neither record set is required for ordinary video creation.

## Work with the human

Translate a creative request into its required inputs, the AI's work, human choices or review, and a validated result. Explain useful editor actions when they can help the person make a needed choice.

For music subtitles, the human selects an MP3/WAV in **Media** and may choose **Use as soundtrack**. The linked soundtrack appears as an Audio clip on the Timeline, uses the editor's shared playback transport, and is included in preview and MP4 rendering. In the live development editor, **Generate Subtitles** can use that soundtrack or an ordinary Timeline video clip. Video transcription reads only the selected clip's embedded audio and offsets results to its Timeline start. Recognized text and genuine timing remain an unverified draft; missing or invalid timing stays unresolved and is reported, not invented. Lyrics supplied by the human can guide a separate correction workflow, but are not a prerequisite for initial generation and do not make Whisper's output verified. See [Lyrics Sync](LYRICS_SYNC.md), [Project Media](PROJECT_MEDIA.md), and [the Timeline contract](TIMELINE_EDITOR.md).

If an essential asset, target project, or product choice is missing, tell the human the next concrete action and continue any independent work. Do not fabricate source material, timing, permissions, or review results. State limitations in creator-facing language and report only checks that actually ran.

Verify promised editability in the actual FloxBow editor. Where UI automation is available, confirm the expected clips appear on the Timeline, select them, check their declared Inspector controls, change a representative value and confirm the Canvas updates, then save and reload. Report which checks ran, which properties remain code-only, and which requested capabilities are unsupported or unverified. If automation is unavailable, state the remaining manual check clearly.

## Review and approval points

- Obtain explicit user authorization before changing shared application code for a video-generation request, changing established user-specific workflow rules, or expanding into a new task beyond the approved scope.
- Preserve project data, public APIs and serialized formats. If a change could alter these contracts, explain the compatibility impact and follow the relevant review process before applying the change.
- Treat branch publication, PR creation, merge, release, and other external actions according to the user's current instructions. Do not merge or publish beyond the authorization given.
- Structured Review & Annotations is proposed, not implemented. Do not promise that the application can store or route canvas, clip, or time-range comments to an AI agent.
