# Proposal: Dockable Workspace Panels

Status: proposed, not approved

## Problem

The editor currently places its timeline inside the main workspace and switches Media, Lyrics Sync, Preview, and Capabilities by replacing the active view. Users need a reusable way to hide, reopen, detach, and reattach editor panels. Detaching must create a native desktop window for a second monitor while keeping one project session and one authoritative editor state.

This proposal describes a shared panel shell and lifecycle. It does not add a dynamic module or plugin loader.

## Current architecture findings

- `apps/desktop/electron/main.cjs` creates one `BrowserWindow`. It enables sandboxing, context isolation, web security, disables Node integration, denies permissions, popups, navigation, and webviews. There is no preload or IPC API today. `window-all-closed` quits the application.
- `apps/desktop/src/main.tsx` owns project selection and the top-level Preview, Media, Lyrics Sync, and Capabilities views. It persists selected project and left-browser width in local storage. The current view is conditionally rendered, so switching away from Preview unmounts `TimelineEditor`.
- `TimelineEditor` currently owns the timeline document, revision hash, dirty/conflict state, save/reload flow, undo/redo history, selection, playback frame, and communication with the preview iframe. It also renders both the preview/inspector area and the bottom timeline. The frame and document bridge is `motion-editor-v1` and validates iframe source, origin, channel, and project ID.
- Timeline persistence is performed by the shell through `/api/edit/:projectId`. `scripts/editor-store.ts` validates the timeline, compares the disk revision, writes a temporary file, checks the revision again, and atomically replaces the project JSON. `TimelineEditor` polls the disk revision every 1.8 seconds; a changed disk revision blocks stale saves when there is a dirty draft.
- `MediaPanel` fetches its project registry every 1.8 seconds and sends revision-bearing add/remove requests to the shell host. It does not edit the timeline. `Lyrics` owns transient local timing state, fetches its project data when mounted, and exports downloads; the UI says edits stay in the panel until exported.
- `scripts/server.ts` exposes the shell HTTP API and keeps the existing Vite project watcher and project-state polling contract. Those watcher/polling mechanisms need not change for docking.
- `docs/MODULE_INTEGRATION_BLUEPRINT.md` describes explicit component registration and serializable preview metadata. It rejects arbitrary executable plugin loading. There is no shared panel registration, panel lifecycle, or cross-window session contract yet.

## Proposed improvement

Use a separate Electron `BrowserWindow` for a detached panel, coordinated by a small allow-listed panel lifecycle API. Keep the primary renderer as the sole owner of the active project/editor session. A detached window renders a panel view and sends user-intent commands to that owner; it never creates a second `TimelineEditor`, independently loads an edit document, or calls the timeline save path.

The main process owns native window creation, the one-window-per-panel rule, and lifecycle transitions. The primary React application owns the active project and editor data. The detached renderer owns only its visible panel presentation and disposable view details such as scroll position. The main process relays validated snapshots and commands; it does not become a second timeline store.

### Static panel identity and registration

Add one static, application-owned registry for built-in panels. A registration should provide:

```ts
type PanelId = "timeline" | "media" | "lyrics" | "inspector";
type PanelRegistration = {
  id: PanelId;              // stable protocol identity
  title: string;            // shared title bar label
  dockSlot: "bottom" | "center" | "right";
  // renderer and supported actions are statically imported by the shell
};
type PanelLifecycle = "docked" | "detached" | "hidden";
```

The first registry only needs Timeline. Later built-in registrations can add Media, Lyrics, and Inspector. Registration selects code already bundled with the desktop application; project data and preview metadata cannot provide a renderer, IPC channel, or executable behavior. Reject duplicate/unknown IDs rather than loading them dynamically.

Each panel uses the same title bar and lifecycle controls. In a docked panel, **Detach** moves it into its native window and **Close** hides it. A shell **View** menu or equivalent reopens hidden panels. In a detached panel, **Attach** returns it to its registered dock slot. Closing the detached native window also attaches it back by default. The panel stays visible in exactly one place; the old dock slot shows a small “Timeline is detached” placeholder with an Attach action.

Lifecycle transitions:

```text
             Detach
     docked -----------> detached
       ^                    |
       | Attach / window X  | Close window
       +--------------------+
       |
       | Close (hide)       | View > Timeline
       v                    v
     hidden <------------ docked
```

The explicit detached **Close** control should follow the native-window-close rule and attach the panel, rather than silently hide it. Hiding is available from the main docked panel. Docked/detached/hidden is shell layout state; it is not project data.

### Window ownership and multi-monitor behavior

The primary window remains the application/session owner. The main process keeps a map from the registered `PanelId` to at most one detached `BrowserWindow`, plus the owning primary window. It creates a child window only in response to a validated request for a registered panel. The child loads a fixed local shell route for that panel; it never loads a project composition, arbitrary URL, or project-supplied module.

The child is a real top-level `BrowserWindow`, so the operating system can move it to any connected monitor. On detach, place it on the display nearest the pointer (or the primary display) and constrain its initial bounds to that display's work area. The user can then drag it to another monitor. If a monitor is unplugged, recover off-screen bounds to a connected display. Persisting window positions is outside the first slice.

The main window remains alive while its panel is detached. Closing the primary window closes its detached children and follows the existing application quit behavior; a child cannot outlive or reopen an orphaned editor session.

### Cross-window state and command synchronization

The primary renderer owns one `EditorSession` per active project. For the initial Timeline slice, lift the relevant state currently held by `TimelineEditor` into a root-level session owner that remains mounted when the Timeline panel is detached or hidden and when the user visits another top-level view. Switching the selected project replaces the active session and invalidates messages from the prior session.

The detached Timeline window is a remote view of this owner:

1. On ready, it registers its `panelId`, native window identity, and session handshake with the main process.
2. The primary renderer sends the current serializable snapshot: `projectId`, opaque `sessionId`, monotonically increasing in-memory `stateVersion`, timeline, selected clip, playhead frame, playback state, and the panel metadata needed to label tracks/actions.
3. The detached panel renders that snapshot and sends commands such as select clip, seek, move/resize clip, duplicate/delete, add track, and supported timeline edits. It does not mutate an independent document.
4. The primary session validates and applies each command once, updates the same preview iframe, dirty/undo state and inspector, and broadcasts the resulting authoritative snapshot to the detached panel.
5. Commands carry a unique `commandId`, `panelId`, `projectId`, `sessionId`, and last-seen `stateVersion`. The owner rejects stale or mismatched commands and returns a current snapshot. A project switch or owner shutdown makes the previous session ID invalid.

The preview iframe stays in the primary window and remains the playback source. Timeline seeks from the detached view go to the primary session, which uses the existing `motion-editor-v1` frame messages. Player frame reports from the primary are broadcast back to the detached playhead. Selection and edits use the same direction: detached intent to primary owner, authoritative state back to both views. The inspector and canvas remain in the primary window in the first slice and reflect selection changes made in the detached Timeline.

For transport, prefer narrow `contextBridge` methods in a new sandboxed preload and allow-listed `ipcMain`/`ipcRenderer` messages. Use structured serializable payloads and explicit schemas; do not expose raw `ipcRenderer`, filesystem, or generic invoke methods. The main process routes messages between the known primary and panel windows but stores no project document. Keep the editor command reducer/store in the primary renderer so timeline behavior and future editing semantics execute in one place.

Do not use `localStorage` as a live synchronization protocol. The windows share an origin and may see the same storage, but storage provides neither ordered commands nor single-writer ownership. Similarly, creating a second full shell/editor and relying on disk revision conflicts would only detect a race after the fact; it would not preserve one live selection, undo history, or playback session.

### Persistence and revision conflicts

Only the primary `EditorSession` reads and writes `/api/edit/:projectId`, owns the current disk revision, keeps the draft and undo/redo history, and handles Save/Reload. Saving remains the existing revision-checked atomic operation in `scripts/editor-store.ts`; no child window calls `saveEditor` or independently writes `edit-timeline.json`. The existing disk revision poll remains in this owner and is not duplicated by the detached panel. A conflict remains visible in the main editor; the detached timeline can display a read-only conflict status but cannot overwrite or clear the owner's draft.

Detaching, attaching, hiding, or reopening a panel must not reset `EditorSession`, clear local draft storage, reload from disk, or create another save owner. Project switches continue to use the existing per-project draft and revision rules. Media Registry changes continue through their existing host endpoints and revision checks; they are separate data from timeline saves. Lyrics currently holds transient timing data in component state, so before detaching Lyrics in a later slice its in-memory state must be lifted into the same session owner or transferred through an explicit serializable panel-state adapter. A remount must not discard unexported lyric edits.

## Alternatives

| Option | Advantages | Limitations | Decision |
| --- | --- | --- | --- |
| Separate Electron `BrowserWindow` with a primary-owned session and narrow IPC | Creates a real OS window that can move between monitors; permits native close/attach lifecycle; commands and state have one explicit owner. | Requires a small reviewed preload/IPC surface and a panel view/command refactor. | Recommended for the requested feature. |
| Existing-window routing or shell-managed tabs/visibility | Reuses the current one-window security model; simplest way to hide, reopen, or rearrange views. | Cannot move a panel onto another monitor as a separate OS window. | Useful for the View menu and docking controls, but not sufficient for detaching. |
| DOM drag-out or opening a second full editor | Superficially simple in UI code. | DOM dragging does not create an OS window; popups are currently denied. A second editor would duplicate document, selection, undo, preview and save owners, making synchronization and conflict races likely. | Reject. |

No new dependency is needed. The existing Electron `BrowserWindow` API supplies native windows; the shared docking behavior remains shell infrastructure, not a per-module window implementation.

## Recommended smallest implementation slice: Timeline only

1. Add the static panel identity/registration contract and shared title bar/lifecycle controller for one built-in `timeline` panel.
2. Add a fixed detached-panel route and a minimal sandboxed preload exposing only lifecycle and typed session-message methods. Keep popup and navigation denial in place.
3. Extract an `EditorSession` owner that stays mounted in the primary shell and owns timeline state, revision, draft, history, selected clip, frame, player messages, and the sole save/reload functions.
4. Extract the timeline rendering surface as a controlled panel: it receives snapshots and emits commands; it contains no independent persistence or edit document.
5. Add explicit docked/detached/hidden transitions, an attach placeholder, the View reopen action, and the rule that closing a detached window re-docks it.
6. Retain the main preview and inspector in the primary window. Validate each routed timeline command in the owner and use existing timeline behavior dispatch there; never reimplement edit semantics in the child window.
7. Leave Media, Lyrics Sync, Inspector detachment, timeline core/contracts, Media Registry logic, and all existing watcher/polling intervals unchanged in this slice.

Do not implement multi-panel dragging, free-form docking layouts, saved monitor geometry, arbitrary floating project windows, or runtime module installation as part of this first slice.

## Extension path

- **Media:** register the existing panel with the same title bar, identity and lifecycle API. Keep media registry reads/writes in the current host API and retain its revision checks. Ensure only one visible panel instance performs the current polling and mutation flow.
- **Lyrics Sync:** first lift its transient timeline/original-lyrics/error state into the primary panel session or add a documented serializable state adapter. Continue using the existing import/export formats; do not add another writer for project files.
- **Inspector:** use the same panel registry and lifecycle controls. Keep property edits routed to the primary `EditorSession`; it must remain synchronized with timeline selection and behavior dispatch.
- **Future built-ins:** add a static registration entry and typed snapshot/command adapter, with one owner and one view at a time. Module registration may provide IDs and supported UI integration metadata, but may not supply executable IPC handlers, arbitrary routes, or code to install at runtime.

## Security and Electron constraints

- Apply the current `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true` settings to every new window. The preload must be as small and typed as possible.
- Continue denying permissions, webviews, popups, and navigation away from the exact shell origin. Open detached windows through a main-process request, not a project composition's `window.open` or arbitrary URL.
- Validate `webContents` identity and expected role (primary or registered panel) for every IPC message. Validate channel, panel ID, project ID, session ID, command ID, payload schema, and reasonable payload size. The main process must not accept filesystem paths, generic URLs, or executable content from renderers.
- Only the shell origin participates in the panel protocol. Project compositions remain in the separately sandboxed preview origin; they get no preload bridge or access to panel commands.
- Treat the loopback server as a local boundary rather than authentication. A detached panel must use the known same-session shell route, not broaden project-file endpoints or expose host paths.
- On child crash or unexpected renderer exit, clear the native window registration and attach the panel back if the primary is still alive. On primary close, close children and quit as today.

## Acceptance tests

1. The static registry rejects duplicate and unknown panel IDs; the detached route cannot select arbitrary files, paths, or project modules.
2. **Detach Timeline** creates exactly one native child window. The primary dock slot shows a detached placeholder and contains no second interactive Timeline.
3. Moving the detached window between displays works; if its display is removed, it returns to a visible work area.
4. Select a clip and seek/drag/trim/duplicate/delete from the detached timeline. The primary inspector and preview update, and the detached panel receives the same authoritative selection/document/frame.
5. Play in the primary preview and seek in the detached timeline; playhead state remains synchronized. Opening two detach requests for Timeline does not create two panel windows.
6. Make an edit while detached, then Save from the primary editor. There is one write, and reopening/attaching shows the saved document. The child cannot issue an independent save or reload.
7. Change the project in the primary window while Timeline is detached. The detached panel changes to the new session; a stale command from the old `sessionId` is rejected. The new project's existing disk revision/draft behavior remains intact.
8. Change the project file externally while the owner has a dirty draft. The existing revision poll reports a conflict, preserves the draft, and prevents stale save even if Timeline is detached.
9. Close the detached window with the native close control; Timeline reappears in the original bottom dock slot with state intact. Explicit Attach has the same result.
10. Close docked Timeline; it becomes hidden without clearing data. Reopen it from View and verify selection, playhead, draft and revision state are intact.
11. Denied popup/navigation behavior, project preview isolation, and current permission restrictions remain effective for the primary and detached windows.
12. Existing Media, Lyrics Sync, project discovery, external-edit polling and media revision-conflict tests continue to pass without changed polling intervals.

## Implementation sequence

1. Review and approve the panel lifecycle, single-owner rule, command boundary, and preload/IPC security surface.
2. Add typed panel IDs, registrations, lifecycle states, detached route, and one-window-per-panel native lifecycle for Timeline.
3. Extract the primary `EditorSession` and controlled Timeline view; keep Save/Reload, revision checks, draft restoration, undo/redo and preview ownership in the primary renderer.
4. Add snapshot/command messages with session identity, command acknowledgements, stale-command rejection, and lifecycle cleanup.
5. Add title bars, detach/attach/close behavior, dock placeholder, View reopen action, and multi-monitor initial positioning/recovery.
6. Add contract, lifecycle, synchronization, persistence-conflict and security regression tests; run the existing validation suite and exercise the app on a multi-monitor setup.
7. Add Media, Lyrics and Inspector only as separately reviewed extensions after their state/command ownership is explicit. Do not merge a module until its detach/attach path preserves its in-memory state.

## Risks and compatibility

- Extracting the current monolithic `TimelineEditor` is the largest risk. Keep the persisted timeline `version: 1`, SDK version, preview bridge protocol, project file layout, and current revision/hash write flow unchanged in the first docking slice.
- IPC state may be stale or arrive during project switches. Session IDs, state versions, acknowledgements, and owner-only command application are required; window presence alone must never authorize a save.
- A detached window increases memory and another renderer process. One detached Timeline window is sufficient for the first slice; avoid mounting a second player or composition.
- The proposal assumes desktop Electron. Browser-only preview and web mode should keep the current single-window layout and omit detach controls.
- No dependency or third-party license changes are proposed.

## Evidence

- `apps/desktop/electron/main.cjs`: current single-window creation and Electron security settings.
- `apps/desktop/src/main.tsx`: top-level navigation, active project selection, and conditional panel mounting.
- `apps/desktop/src/TimelineEditor.tsx`: current timeline/playback/save state owner, preview message bridge, draft persistence, and 1.8-second revision poll.
- `apps/desktop/src/MediaPanel.tsx`: Media Registry UI polling and revision-bearing host requests.
- `scripts/editor-store.ts` and `scripts/server.ts`: revision/hash validation, atomic timeline write, shell API routing, and existing project watcher.
- `packages/player/src/host.tsx`: isolated preview bridge and origin/project/channel checks.
- `docs/ARCHITECTURE.md`, `docs/MODULE_INTEGRATION_BLUEPRINT.md`, and `docs/TIMELINE_EDITOR.md`: current runtime, security, module and persistence contracts.

## Acceptance

Pending explicit architecture review. This document-only proposal does not authorize implementation. No production code, package dependency, timeline behavior, subtitle behavior, Media Registry code, or watcher/polling mechanism is changed by this proposal.
