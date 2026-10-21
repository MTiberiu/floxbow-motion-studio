# Proposal: Dockable Workspace Panels

Status: approved phased architecture; the first shell lifecycle foundation is implemented in TASK 011.

## Problem

FloxBow currently switches Preview, Media, Lyrics Sync, and Capabilities in a single workspace view, while the timeline and inspector are embedded in the Preview editor. Users need one shell-managed mechanism for moving panels among workspace areas, grouping them as tabs, hiding and reopening them, and detaching them into native windows. Canvas/Preview must be movable too, so portrait projects can place it in a taller right-side area.

This proposal defines shared layout and window infrastructure. Modules supply panel content and sizing metadata; they do not implement their own docking, window, close, maximize, or persistence mechanisms. No dynamic plugin loader or external docking framework is proposed.

## Current architecture findings

- `apps/desktop/electron/main.cjs` creates one `BrowserWindow`. It enables sandboxing, context isolation and web security; disables Node integration; denies permissions, popups, navigation and webviews; and has no preload or IPC API. `window-all-closed` quits the application.
- `apps/desktop/src/main.tsx` owns project selection and composes the shell-owned `WorkspaceManager`. The static registry wraps Editor, Media, Lyrics Sync, and Capabilities. Opened panels stay mounted while inactive or hidden; Editor is still a composite view.
- `TimelineEditor` owns the timeline document, revision hash, dirty/conflict state, save/reload flow, undo/redo history, selection, playback frame, and the preview iframe bridge. It renders the preview, inspector, and bottom timeline together. The iframe uses `motion-editor-v1` messages checked against source, origin, channel, and project ID.
- Timeline persistence goes through `/api/edit/:projectId`. `scripts/editor-store.ts` validates data, compares the disk revision, writes a temporary file, checks the revision again, and atomically replaces the project JSON. `TimelineEditor` polls the disk revision every 1.8 seconds; a change blocks stale saves when a draft is dirty.
- `MediaPanel` polls its project registry every 1.8 seconds only while active and sends revision-bearing add/remove requests to the shell host. `Lyrics` owns transient timing state in its component and exports downloads; keeping its panel mounted preserves those edits until exported.
- `TimelineEditor` pauses preview playback while hidden, resumes it when active, and stops its disk-revision poll until shown again. Existing revision/hash persistence and conflict handling remain in the same component.
- `scripts/server.ts` exposes the shell HTTP API and current Vite project watcher. TASK 011 does not change the project watcher or add a polling loop.
- `docs/MODULE_INTEGRATION_BLUEPRINT.md` now documents the implemented static shell panel registry and its limits. There is still no drag/drop layout, native window or cross-window session contract.

## Proposed improvement

Introduce a universal shell-owned `DockablePanel` container and a `WorkspaceManager` for every supported editor panel, including Canvas/Preview. The manager owns each panel's current placement, lifecycle state, and return location. The common container provides title bar, Drag & Dock, Detach, Attach, Close/Hide/Reopen, resizing, and detached-window controls. Individual modules render only their UI content inside the container and declare metadata such as title, default location, fallback location, minimum size, preferred size, and internal overflow behavior.

Keep the panel registry static and application-owned. Registration selects code already bundled with FloxBow; project data cannot provide a renderer, route, IPC handler, or executable extension. No new dependency is needed: the in-editor layout is shell UI, and Electron's existing `BrowserWindow` API is sufficient for native windows.

### Shared panel registration and placement contract

The type sketch below describes a shell contract, not a persisted project schema or final API naming:

```ts
type PanelId = "canvas" | "timeline" | "media" | "lyrics" | "inspector";
type DockArea = "left" | "right" | "center" | "bottom";
type DockEdge = "left" | "right" | "top" | "bottom";
type DockLocation = {
  area: DockArea;
  groupId: string;
  tabIndex: number;
};
type PanelSize = { width: number; height: number };
type PanelRegistration = {
  id: PanelId;
  title: string;
  defaultLocation: DockLocation;
  fallbackLocation: DockLocation;
  minSize: PanelSize;
  preferredSize: PanelSize;
  overflow: "panel-scroll" | "content-managed";
  // UI content is statically registered in the Editor Shell.
};
type PanelPlacement = {
  panelId: PanelId;
  lifecycle: "docked" | "detached" | "hidden";
  currentLocation?: DockLocation;
  homeLocation: DockLocation;
  detachedWindowId?: string;
};
```

`defaultLocation` seeds a panel's first placement in a new workspace. `homeLocation` is the panel's last actual docking area, group, and tab position. `fallbackLocation` is the safe registered placement used when a remembered group no longer exists. These are distinct values: defaults do not overwrite a user's later docking choice, and attaching does not blindly return a moved panel to its first-run position.

`WorkspaceManager` in the primary shell owns `PanelPlacement` and layout changes. When a docked panel is moved, the manager updates its `currentLocation` and `homeLocation`. Detaching records that exact current location into `homeLocation` before switching lifecycle to `detached`. Attach or native close restores the saved group and clamps the tab index to its current bounds. If that group no longer exists, use `fallbackLocation`, then update `homeLocation` to the location actually restored. Closing a docked panel changes lifecycle to `hidden` but retains its `homeLocation`; reopening uses that location or the fallback.

### Minimal in-editor docking model

The initial layout has four named regions: left, right, center, and bottom. Each region contains a tab group; a tab group may have more than one panel, with one active panel body at a time. The main workspace uses resizable split boundaries between regions. Canvas/Preview is an ordinary registered panel whose first-run location is center; it may be dropped into the right area to provide more vertical room for 9:16 content.

Dragging begins on the shared title-bar handle, not on buttons or editable panel content. During a drag, the shell shows targets for:

- **Tab drop:** the center of a tab group adds the panel at the indicated tab index and activates it.
- **Area drop:** a named left, right, center, or bottom target moves the panel into that region's tab group.
- **Split drop:** the edge of a group creates an adjacent split in that direction. Left/right drops place groups side by side with a vertical divider; top/bottom drops stack groups with a horizontal divider. The group's region identity remains with that layout branch.
- **Resize:** dragging a visible split boundary adjusts adjacent area/group sizes, respecting registered minimum sizes. Tab strips do not resize panels independently.

Keep the first layout model small: four base regions, tab groups, and simple split nodes with bounded ratios. A `WorkspaceManager` layout tree may describe those groups/splits, but the initial UI should not attempt arbitrary nesting/reparenting, floating layouts inside the main window, auto-hide drawers, or a complete CAD-style docking framework. Hidden panels remain discoverable through the View menu. Inactive tabs do not mount a second live editor for the same panel.

### Common `DockablePanel` behavior and lifecycle

The common shell container wraps Canvas, Timeline, Media, Lyrics, Inspector, and future built-in panel bodies. Its title bar provides a consistent drag handle and lifecycle controls. Docked panels expose Detach and Close (Close hides). A View menu reopens hidden panels. The dock slot shows a placeholder while its panel is detached, with an Attach action.

Lifecycle behavior:

| Current state | Action                                          | Result                                                                 |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Docked        | Drag & Dock                                     | Docked at the drop target; update `homeLocation`.                      |
| Docked        | Detach                                          | Detached native window; save exact current location as `homeLocation`. |
| Docked        | Close                                           | Hidden; keep location and panel/session data.                          |
| Hidden        | View > panel                                    | Docked at `homeLocation`; use fallback if needed.                      |
| Detached      | Attach                                          | Docked at `homeLocation`; use fallback if needed.                      |
| Detached      | Native window close (including title-bar Close) | Attach to the main editor by default; use fallback if needed.          |

The explicit detached **Attach** control and native **Close** control therefore both restore the panel to its saved dock position. To hide a detached panel, the user first attaches it, then uses the docked Close control. Lifecycle state is workspace state, never project content.

### Detached native windows and monitors

Native detachment is a later phase, but it uses the same registration, `DockablePanel`, `WorkspaceManager` state, and panel identity as in-editor docking. The Electron main process owns physical `BrowserWindow` handles and at most one detached window per panel ID; it does not own or duplicate project documents. A child loads a fixed local shell route for the registered panel, not a composition or arbitrary project module.

Detached panels support native movement between monitors, free resizing, maximize/restore, real fullscreen, Attach, and Close. Maximize and fullscreen are distinct window states. Initial bounds should be placed on the display nearest the pointer (or primary display) and constrained to its work area. If a monitor disappears, recover the window to a connected display. Window positions and dimensions are not persisted in this proposal's implementation scope.

Closing the primary window closes its detached children and follows the current quit behavior; no panel window may outlive or reopen an orphaned editor session. Native close of a child notifies `WorkspaceManager`, which restores the panel in its home location.

### One authoritative editor session and cross-window synchronization

The primary renderer owns one `EditorSession` per active project. For native Timeline detachment, lift timeline document, disk revision, dirty/conflict state, draft, undo/redo, selection, playhead, playback state, and preview messages into an owner that stays mounted when panels are hidden or detached and when top-level views change. Switching projects replaces the session and invalidates commands from the previous session.

The detached Timeline window is a controlled view, not a second editor. It receives serializable snapshots and sends user-intent commands to the primary owner. A command includes `panelId`, `projectId`, `sessionId`, `commandId`, and last-seen `stateVersion`; the owner validates and applies it once, then publishes the authoritative result. A stale or mismatched command is rejected with a current snapshot. Timeline selection, drag/trim, edits, undo/redo, and playhead actions all pass through the same session and update the same main preview and inspector. Player frame reports from the existing preview iframe update the detached playhead.

For transport, use narrowly scoped methods in a sandboxed preload and validated IPC routing. The primary renderer/`WorkspaceManager` is the authority for panel placement and editor data; Electron main maps the known native window to a registered `panelId`, forwards lifecycle and snapshot/command messages, and holds no project document. Do not expose raw `ipcRenderer`, filesystem access, generic invoke methods, or project-provided executable handlers. Do not use `localStorage` as a live event bus; shared-origin storage does not provide command ordering or a single writer.

### Persistence, conflicts, and workspace layout state

Only the primary `EditorSession` reads or writes `/api/edit/:projectId`, owns the revision hash, persists/restores the unsaved draft, maintains undo/redo, and handles Save/Reload. The detached panel never independently loads an edit document or writes `edit-timeline.json`. Retain the existing revision-checked atomic save procedure and the existing disk-revision poll in the one owner. External changes while a dirty draft exists continue to block stale saving; the detached view may show the conflict read-only but cannot clear it or overwrite the draft.

Detaching, attaching, hiding, tab switching, and reopening must not reset the project session or discard panel state. Media Registry mutation remains on its existing host routes and revision checks; it is not another timeline save path. Lyrics currently keeps unexported edits in component state, so it cannot be detached safely until that state is owned by the shell session or an explicit serializable panel-state adapter.

Later, `WorkspaceManager` may serialize a versioned workspace layout containing panel placements, group/tab order, split ratios, visibility, and detached window geometry. Store it as user/workspace preference state outside `projects/<id>/`; never put it in the project timeline or Media Registry. Restore invalid/stale group IDs via each panel's fallback location and clamp saved sizes/bounds to current displays. Layout persistence is explicitly out of scope for this architecture-only proposal and the initial implementation slices.

### Responsive panel sizing contract

Every registration declares `minSize`, `preferredSize`, and an overflow policy. The container enforces available geometry, split bounds, title-bar space, and scroll clipping; module content is responsible for responsive internals. Content roots use shrinkable layout constraints (`min-width: 0`, `min-height: 0`) so a child cannot expand the workspace past its assigned area.

- **Canvas/Preview:** contain the composition at its declared aspect ratio (including 9:16), letterbox as needed, and allow canvas navigation without stretching the video.
- **Timeline:** adapt labels and controls to the panel width and use internal horizontal/vertical scrolling for tracks and the time range.
- **Inspector:** keep fields usable through a single scroll region and reorganize control columns at narrower widths.
- **Media/Lyrics:** wrap metadata/actions where useful and scroll long asset or word lists within the panel.

Do not shrink a dock group below the maximum minimum size of its active tab. If the workspace cannot satisfy all minima, prioritize the active group, allow inactive tabs to remain selectable, and scroll panel contents; never allow content to paint over an adjacent group. Detached `BrowserWindow` minimum size must include the panel's declared minimum plus common title-bar/chrome dimensions. Exact per-panel pixel values should be chosen during implementation from rendered UI evidence, not invented here.

## Alternatives

| Option                                                                                                         | Advantages                                                                                                                                            | Limitations                                                                                                                                              | Decision                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Shell-owned `WorkspaceManager` plus universal `DockablePanel`, then Electron `BrowserWindow` for native detach | One reusable path for internal docking and native windows; exact home/fallback locations; one project/session/save owner; supports multiple monitors. | Requires a panel layout refactor, responsive content work, and a small reviewed preload/IPC surface for native windows.                                  | Recommended, phased.                                                     |
| Existing-window tabs and visibility only                                                                       | Reuses the current single-window security model and is the smallest way to hide/reopen panels.                                                        | Cannot move Canvas or another panel into a second operating-system window/monitor; no in-editor region/tab docking by itself.                            | Useful as the first lifecycle foundation, insufficient as the end state. |
| Second full editor window or independent module-specific detach code                                           | Could reuse current full editor quickly for one panel.                                                                                                | Creates duplicate session/save owners or repeated bespoke window logic; breaks the universal container and increases synchronization/conflict risk.      | Reject.                                                                  |
| DOM drag-out or external docking framework                                                                     | Might offer prebuilt interactions.                                                                                                                    | DOM dragging does not create an OS window; current Electron denies popups. A framework adds dependency and layout complexity before a demonstrated need. | Reject for this scope.                                                   |

## Revised implementation sequence

Each item is a separate, reviewable implementation PR. Review and approve this architecture before starting implementation.

1. **Universal panel container and registry:** add the static `PanelId`/registration contract, `WorkspaceManager`, shared `DockablePanel` title bar, shell-controlled content slot, docked/hidden states, View reopen, minimum/preferred sizing, and responsive overflow rules. Keep the initial four workspace areas and built-in modules statically registered. Do not add native windows or layout persistence yet.
2. **In-editor Dock & Resize foundation:** add drag targets, tab groups, basic split areas, remembered `homeLocation`/fallback behavior, and bounded split resize. Move Canvas/Preview between center and right as the first proof of flexible layout; exercise Timeline and Inspector regions too. Limit nesting/layout complexity and keep all panels in the main window.
3. **Single session owner and controlled panel views:** separate editor session ownership from panel mounting so hiding, tab changes, or future detach do not unmount state. Keep one timeline document/revision/draft/history/player owner and one existing save path. Add typed user-intent actions that views dispatch to that owner.
4. **Reusable native-window bridge:** add the fixed panel route, sandboxed minimal preload, allow-listed IPC and main-process one-window-per-panel lifecycle. Implement Timeline Detach/Attach using its exact `homeLocation`; support native move/resize, maximize/restore, fullscreen, child-close reattach, and disconnected-monitor recovery. The infrastructure must accept any statically registered panel ID even though Timeline is the first detached panel.
5. **Panel synchronization and hardening:** verify snapshots, command acknowledgements, session invalidation on project switch, owner-only save, conflict display, child crash cleanup, and secure routing. Add regression tests for one owner and no duplicate mounted panel.
6. **Extend shared lifecycle:** enable Canvas, Media, Lyrics, and Inspector through registrations, one at a time. Before detaching any stateful panel, make its in-memory state owner explicit and prove that moving it does not lose edits. Do not duplicate polling or add new writer paths.
7. **Workspace layout persistence:** in a separate PR, save/restore versioned user workspace layout (locations, tabs, split ratios, hidden panels, and detached geometry), handle schema migration, and recover layouts across display changes. Keep it outside project data.

## Acceptance tests

### In-editor container and docking

1. All registered panels use the same `DockablePanel` title bar, drag handle, and lifecycle controls; a module supplies content/metadata only and cannot implement a second window manager.
2. Move Canvas/Preview from center to right and confirm the exact location is reflected by `WorkspaceManager`; its composition remains undistorted at 9:16 and 16:9.
3. Drop on a tab target and confirm one tab group with exactly one active/mounted content panel. Drop on an edge target and confirm a split in the correct direction.
4. Resize left/right, center/right, and center/bottom boundaries. Respect the registered minima; at narrow workspace sizes, panel-local scrolling or inactive tabs remain usable without overlap.
5. Close a docked panel, switch projects/views, and reopen it. It returns to its home tab/order and does not lose its session state.
6. Move a panel from center to right, then detach and attach it. It returns to right, not its default center location. Remove the remembered group and verify fallback placement.

### Native detachment and authoritative session

7. Detach Timeline and confirm exactly one native child window for the panel ID, an attach placeholder in its remembered slot, and only one interactive Timeline view.
8. Move/resize the detached window between monitors; verify maximize/restore and real fullscreen. Disconnect its monitor and confirm recovery to a visible work area.
9. Select, seek, drag, trim, duplicate, delete, undo, and redo in the detached Timeline. The primary preview and inspector reflect changes; the detached panel shows the same authoritative document, selection, and frame.
10. Save from the primary owner once. Confirm the detached view cannot independently write or reload a project timeline and the saved revision is visible in both views.
11. Change projects while Timeline is detached. The detached panel follows the active session; a message with the old session ID is rejected. External edits with a dirty draft retain current conflict behavior.
12. Click Attach or close the detached native window. It returns to its exact home group/tab position. Close while docked, then reopen through View, preserving the active session.
13. Verify current project preview isolation, popup/navigation denial, permission restrictions, Media Registry revision handling, and the existing watcher/polling intervals.

## Security and Electron constraints

- Apply `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true` to every `BrowserWindow`. Use a minimal, typed `contextBridge` preload; never expose raw `ipcRenderer`, Node, filesystem, or generic invoke methods.
- Continue denying permissions, webviews, popups, and navigation away from the exact shell origin. The shell requests a registered panel window through the main process using a `PanelId`, not a URL. The detached route is fixed and shell-owned.
- Validate sending `webContents` identity and role, registered panel ID, channel, project ID, session ID, command ID, payload schema, and message size for IPC. The main process maps child windows to registered IDs but does not trust a renderer-supplied return location or arbitrary bounds.
- Only the shell origin participates in panel synchronization. Project compositions stay in the separately sandboxed preview origin and receive no preload or panel command access.
- Treat loopback servers as local development boundaries, not authentication. Do not broaden edit/media HTTP APIs or expose host file paths for docking.
- On child crash/renderer exit, clear its native-window registration and restore the panel to its home/fallback location if the primary is alive. Closing the primary closes its children and follows existing quit behavior.

## Risks and compatibility

- Refactoring the current monolithic `TimelineEditor` into session owner and panel content is the largest risk. Keep persisted timeline `version: 1`, SDK version, `motion-editor-v1`, project paths, and revision/hash save flow unchanged.
- General docking can become a large layout framework. Limit the first in-editor model to named regions, tabs, simple splits, and bounded resizing; defer arbitrary nested layouts and persistence.
- Stale cross-window commands and project switching require session IDs, state versions, acknowledgements, and owner-only command application. Window presence must not authorize a save.
- Canvas, Timeline, Inspector, Media, and Lyrics have different minimums and responsive behavior. Let registrations describe shell-level sizes and require module content to adapt; validate using actual rendered evidence before fixing pixel values.
- Every detached window adds renderer memory. Do not mount another player or composition to detach Timeline.
- This applies to desktop Electron. Browser-only preview remains a single-window shell with in-editor docking and no native Detach controls.
- No package dependency or third-party license changes are proposed.

## Evidence

- [`apps/desktop/electron/main.cjs`](../../apps/desktop/electron/main.cjs): single-window creation and Electron security settings.
- [`apps/desktop/src/main.tsx`](../../apps/desktop/src/main.tsx): project selection, top-level navigation, and conditional panel mounting.
- [`apps/desktop/src/TimelineEditor.tsx`](../../apps/desktop/src/TimelineEditor.tsx): timeline/playback/save state owner, preview message bridge, draft persistence, and revision poll.
- [`apps/desktop/src/MediaPanel.tsx`](../../apps/desktop/src/MediaPanel.tsx): Media Registry UI polling and revision-bearing host requests.
- [`scripts/editor-store.ts`](../../scripts/editor-store.ts) and [`scripts/server.ts`](../../scripts/server.ts): revision/hash validation, atomic timeline write, shell API routing, and existing watcher.
- [`packages/player/src/host.tsx`](../../packages/player/src/host.tsx): isolated preview bridge and origin/project/channel checks.
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), [`docs/MODULE_INTEGRATION_BLUEPRINT.md`](../../docs/MODULE_INTEGRATION_BLUEPRINT.md), and [`docs/TIMELINE_EDITOR.md`](../../docs/TIMELINE_EDITOR.md): current runtime, security, module, and persistence contracts.

## Acceptance

The first implementation slice provides the shared container, static registry, active/docked/hidden lifecycle, View reopening, sizing/overflow metadata, and state-preserving panel mounting. It does not implement drag/drop docking, split resizing, native windows, IPC, fullscreen, layout persistence, or separate Canvas/Timeline/Inspector views. Those remain separate phases and require an explicit editor-session owner before the inner Editor surfaces can be detached safely.
