# Dependency review

Checked against npm metadata and official documentation on 2026-10-20 before installation. Exact resolved transitive versions are in package-lock.json.

| Package | Selected | Compatibility / license |
|---|---|---|
| Electron | 44.9.2 | Node engine >=22.12; MIT, includes third-party Chromium notices |
| React / React DOM | 19.3.1 | MIT; satisfies Remotion >=16.8 peers |
| Vite | 7.3.7 | Node ^20.19 or >=22.12; MIT |
| @vitejs/plugin-react | 5.2.0 | Peer supports Vite 7; MIT |
| Remotion / player / bundler / renderer | 4.0.537, all identical | Custom Remotion license; React peer satisfied |
| Three.js composition stack | `@remotion/three` 4.0.537, `@react-three/fiber` 9.1.2, `three` 0.171.0 | MIT packages; React 19 compatible Fiber; `@types/three` 0.171.0 is development-only |
| TypeScript | 5.9.3 | Apache-2.0; stable compiler line used for this initial workspace |
| Zod | lockfile resolved 4.x | MIT; schema validation |
| tsx, Playwright, Prettier | lockfile pinned | MIT / Apache-2.0 / MIT; development tooling |

Vite 8 and plugin-react 6 were available, but the compatible Vite 7/plugin 5 pair avoids adding the newer OXC/Babel peer chain during this milestone. Installed Node is 22.16.0. No second animation engine was added.

[Remotion installation](https://www.remotion.dev/docs/player/installation) requires matching Remotion package versions. [Player API](https://www.remotion.dev/docs/player/player), [bundle API](https://www.remotion.dev/docs/bundle), and [render API](https://www.remotion.dev/docs/renderer/render-media) informed implementation. [Vite requirements](https://vite.dev/guide/) and [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) informed host setup.

Remotion is not generally MIT. Its [license and pricing](https://www.remotion.dev/docs/license/pricing) distinguish free eligibility and commercial video creation tools. Check your organization's eligibility and product usage before distribution; this prototype does not purchase a license or represent eligibility. Electron/Chrome and rendered codecs also carry third-party notices. The existing FFmpeg reports GPL/version3 build flags; it is used locally, not redistributed by this repository. Python packages/models and optional services need their own license review when packaged.
