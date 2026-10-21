# AI task routing and collaboration

Start with the task-specific entry in [AGENTS.md](../AGENTS.md), then use [the module index](MODULES.md) to select the smallest relevant guide. Do not preload unrelated subsystem documents. Check source and package exports when the task depends on an exact API or implementation status.

## Choose the right scope

For an ordinary video, follow the [video creation](CREATE_VIDEO.md) or [explainer workflow](EXPLAINER.md), then create or edit only the target `projects/<id>/` folder. Reuse an implemented capability where it fits; put one-off visual behavior in that project's composition. A technical example demonstrates an API and is not a user project. If a reusable capability would require shared application changes, describe that boundary and work on it only when the user authorizes that scope.

For application or core development, identify the owning subsystem in the module index, read [the architecture overview](ARCHITECTURE.md), [the module integration blueprint](MODULE_INTEGRATION_BLUEPRINT.md), and only the relevant subsystem contract. Consult `improvements/proposals/` for engineering designs and decisions; consult `management/` when product priority or a durable product decision affects the task. Neither record set is required for ordinary video creation.

## Work with the human

Translate a creative request into its required inputs, the AI's work, human choices or review, and a validated result. Explain useful editor actions when they can help the person make a needed choice.

For lyrics synchronized to audio, the human must provide or select audio accessible to the chosen workflow and provide lyrics when the words are not otherwise established. The CLI transcription workflow needs project-local audio and lyrics; adding an external file to Media Registry alone does not supply it. Use the existing Lyrics Sync workflow to import or reconcile timing, then treat uncertain estimates as unverified until reviewed against the actual audio. Text alone is not timing evidence. Keep unmatched timing `null` with confidence zero; never claim that Media Registry audio automatically plays in preview, appears as timeline audio, renders, or enters lyric transcription. See [Lyrics Sync](LYRICS_SYNC.md) and [Project Media](PROJECT_MEDIA.md).

If an essential asset, target project, or product choice is missing, tell the human the next concrete action and continue any independent work. Do not fabricate source material, timing, permissions, or review results. State limitations in creator-facing language and report only checks that actually ran.

## Review and approval points

- Obtain explicit user authorization before changing shared application code for a video-generation request, changing established user-specific workflow rules, or expanding into a new task beyond the approved scope.
- Preserve project data, public APIs and serialized formats. If a change could alter these contracts, explain the compatibility impact and follow the relevant review process before applying the change.
- Treat branch publication, PR creation, merge, release, and other external actions according to the user's current instructions. Do not merge or publish beyond the authorization given.
- Structured Review & Annotations is proposed, not implemented. Do not promise that the application can store or route canvas, clip, or time-range comments to an AI agent.
