# FloxBow Motion Studio

FloxBow is an experimental, AI-first desktop workspace for creating frame-driven React videos. The application provides project discovery, an editable timeline for declared clips, a Remotion preview, reusable motion components, lyric synchronization tools, and command-line rendering. It is a development foundation, not an autonomous video generator or a traditional non-linear editor.

## Start

Requires Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

The Electron app opens a clean workspace. Use **Create Project** to make a video, or open **Capabilities** to inspect reusable components and technical examples. To create a project from the command line, run `npm run create:project -- my-video`.

## Find the right guide

- [Create and render a video](docs/CREATE_VIDEO.md) — project setup, preview, validation and rendering.
- [Module index](docs/MODULES.md) — find the subsystem or capability for a task.
- [AI workflow](docs/AI_WORKFLOW.md) — route creative and application-development tasks safely.
- [Architecture](docs/ARCHITECTURE.md) — how the application pieces connect.
- [Dependency and license notes](docs/DEPENDENCIES.md) — dependency constraints and attribution guidance.
- [Verification record](docs/VERIFICATION.md) — checks actually run and their dated results.

Coding agents should begin with [AGENTS.md](AGENTS.md). It preserves repository safety rules and points to only the documentation relevant to the task. Detailed subsystem guides remain where they are; use the module index to reach them.

## Protect video projects

Personal videos belong in `projects/<id>/` and are ignored by Git by default. This keeps scripts and media out of framework commits. Review files, credentials and media licenses before deliberately tracking a project; use a separate repository when it needs independent sharing or history. See [project creation](docs/CREATE_VIDEO.md) for details.

The repository has no general-purpose license granting reuse of FloxBow source. Third-party dependencies retain their own terms. See [dependency and license notes](docs/DEPENDENCIES.md).
