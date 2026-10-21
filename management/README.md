# FloxBow Product Management

This directory records product intent and decisions for **FloxBow Motion Studio**. It is public, written in English, and intentionally separate from implementation documentation.

FloxBow is an **AI-first modular creative coding toolkit**, not a fixed-function video editor or a hosted AI service. Humans can use the desktop editor; external coding agents can read and modify the same project files. Modules must remain useful independently of the desktop UI.

## Where to look

- [ROADMAP.md](ROADMAP.md): milestone sequence and implementation status.
- [DECISIONS.md](DECISIONS.md): agreed product principles and boundaries.
- [BACKLOG.md](BACKLOG.md): candidate modules, open questions, and future experiments.

## Status convention

- **Implemented**: confirmed in repository source; not a promise of complete end-to-end behavior.
- **In progress**: assigned to an active development task; verify its current PR separately.
- **Next**: agreed direction, not yet implemented.
- **Concept**: under discussion; not an approved task.
- **Deferred**: deliberately outside the current milestone.

This directory is **not** the source of truth for runtime behavior. For actual APIs, schemas, security boundaries, and verification, see `AGENTS.md`, `docs/MODULE_INTEGRATION_BLUEPRINT.md`, `docs/ARCHITECTURE.md`, `docs/LYRICS_SYNC.md`, and `docs/VERIFICATION.md`. GitHub issues and PRs contain task execution and review evidence.

## Working protocol

1. Discuss intent, alternatives, and acceptance criteria before implementation.
2. Record meaningful decisions and update the roadmap; do not turn every chat idea into an approved feature.
3. Develop small, scoped changes on feature branches from `dev`; open PRs against `dev` and wait for explicit approval before merging. Keep `main` stable.
4. When implementation changes public APIs or persisted schemas, update the relevant technical docs and tests in the same PR.
5. After a milestone, update its status with PR/commit evidence. Do not claim a feature is complete solely because it is planned here.
6. Keep personal media and project data out of public documentation and commits.

Use `improvements/proposals/` for evidence-driven technical proposals. Do not duplicate their implementation-level detail here.
