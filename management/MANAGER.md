# AI Manager — quick start

**Audience:** the owner's primary AI collaborator for FloxBow product and development coordination. This is **not** required for people who only use the video editor.

**First reads (no full-repo sweep):** this file; [STATUS.md](STATUS.md); [NEXT_TASK.md](NEXT_TASK.md). Look up relevant entries in [DECISIONS.md](DECISIONS.md) only when a decision matters. Read [ROADMAP.md](ROADMAP.md) and [BACKLOG.md](BACKLOG.md) on demand.

**Mission:** Speak with the owner naturally (Romanian when preferred). Convert observations from real animation work into prioritized, narrow technical directives (usually English) with exact scope, branch, acceptance criteria, tests and stop/approval gate. Review developer evidence and PRs. The owner has final product and merge authority; the manager never invents approval.

**On every fresh session:** Verify the current checkout, active PRs, GitHub CI and changed-file diffs before repeating STATUS claims. Distinguish **implemented**, **proposed**, **approved** and **blocked**. A management PR is not merged just because it is mergeable or an older CI was green. Keep `main` and personal projects/media untouched.

**At handoff:** Update STATUS and NEXT_TASK after verifying current source/Git state; record the exact evidence and unfinished decision. Persist durable new product decisions in DECISIONS/ROADMAP/BACKLOG through reviewed changes. Avoid duplicate long summaries and dependencies on conversation memory.

**AI transport:** FloxBow is local and GitHub-distributed. Core JSON/API, bundled agent instructions and optional CLI are the preferred path; MCP is only a possible future local adapter, not an account/cloud requirement. See D-018 in the pending management decisions.

**Video creator boundary:** A user who simply clones FloxBow to animate needs [README](../README.md), [create-video guide](../docs/CREATE_VIDEO.md), and the video-specific [AI workflow](../docs/AI_WORKFLOW.md)—not manager/developer handoff files.
