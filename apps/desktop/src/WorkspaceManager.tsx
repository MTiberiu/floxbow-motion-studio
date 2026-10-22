import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DockablePanel } from "./DockablePanel";
import "./workspace.css";

export type PanelId = "editor" | "media" | "lyrics-sync" | "capabilities";
export type PanelSize = { width: number; height: number };
export type PanelRegistration = {
  id: PanelId;
  title: string;
  minSize: PanelSize;
  preferredSize: PanelSize;
  overflow: "panel-scroll" | "content-managed";
};
export type DetachedTimelineIdentity = Readonly<{
  projectId: string;
  sessionId: string;
  instanceId: string;
}>;

export const PANEL_REGISTRY: readonly PanelRegistration[] = [
  {
    id: "editor",
    title: "Editor",
    minSize: { width: 640, height: 420 },
    preferredSize: { width: 1120, height: 760 },
    overflow: "content-managed",
  },
  {
    id: "media",
    title: "Media",
    minSize: { width: 480, height: 360 },
    preferredSize: { width: 900, height: 680 },
    overflow: "panel-scroll",
  },
  {
    id: "lyrics-sync",
    title: "Lyrics Sync",
    minSize: { width: 560, height: 360 },
    preferredSize: { width: 960, height: 680 },
    overflow: "panel-scroll",
  },
  {
    id: "capabilities",
    title: "Capabilities",
    minSize: { width: 560, height: 360 },
    preferredSize: { width: 960, height: 680 },
    overflow: "panel-scroll",
  },
];

type WorkspaceContextValue = {
  activePanelId: PanelId | null;
  hiddenPanelIds: ReadonlySet<PanelId>;
  openedPanelIds: ReadonlySet<PanelId>;
  activatePanel: (id: PanelId) => void;
  hidePanel: (id: PanelId) => void;
  detachedTimeline: DetachedTimelineIdentity | null;
  setDetachedTimeline: (identity: DetachedTimelineIdentity) => void;
  clearDetachedTimeline: (instanceId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceManager() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace)
    throw new Error("Workspace components must be inside WorkspaceManager.");
  return workspace;
}

export function WorkspaceManager({ children }: { children: ReactNode }) {
  const [activePanelId, setActivePanelId] = useState<PanelId | null>("editor");
  const [hiddenPanelIds, setHiddenPanelIds] = useState<ReadonlySet<PanelId>>(
    () => new Set(),
  );
  const [openedPanelIds, setOpenedPanelIds] = useState<ReadonlySet<PanelId>>(
    () => new Set(["editor"]),
  );
  const [detachedTimeline, setDetachedTimelineState] =
    useState<DetachedTimelineIdentity | null>(null);

  useEffect(() => {
    const bridge = window.floxBowWindows;
    if (!bridge) return;
    return bridge.onPanelClosed((event) => {
      setDetachedTimelineState((current) =>
        current?.instanceId === event.instanceId &&
        current.projectId === event.projectId &&
        current.sessionId === event.sessionId
          ? null
          : current,
      );
    });
  }, []);

  function activatePanel(id: PanelId) {
    setHiddenPanelIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setOpenedPanelIds((current) => {
      if (current.has(id)) return current;
      return new Set([...current, id]);
    });
    setActivePanelId(id);
  }

  function hidePanel(id: PanelId) {
    setHiddenPanelIds((current) => new Set([...current, id]));
    if (activePanelId !== id) return;
    const next = PANEL_REGISTRY.find(
      (panel) =>
        panel.id !== id &&
        openedPanelIds.has(panel.id) &&
        !hiddenPanelIds.has(panel.id),
    );
    setActivePanelId(next?.id ?? null);
  }

  return (
    <WorkspaceContext.Provider
      value={{
        activePanelId,
        hiddenPanelIds,
        openedPanelIds,
        activatePanel,
        hidePanel,
        detachedTimeline,
        setDetachedTimeline: setDetachedTimelineState,
        clearDetachedTimeline: (instanceId) =>
          setDetachedTimelineState((current) =>
            current?.instanceId === instanceId ? null : current,
          ),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function WorkspaceNavigation() {
  const { activePanelId, hiddenPanelIds, activatePanel } =
    useWorkspaceManager();
  const hiddenPanels = PANEL_REGISTRY.filter((panel) =>
    hiddenPanelIds.has(panel.id),
  );

  return (
    <>
      <nav className="workspace-tabs" aria-label="Workspace panels">
        {PANEL_REGISTRY.filter((panel) => !hiddenPanelIds.has(panel.id)).map(
          (panel) => (
            <button
              className={activePanelId === panel.id ? "selected" : ""}
              key={panel.id}
              aria-current={activePanelId === panel.id ? "page" : undefined}
              onClick={() => activatePanel(panel.id)}
            >
              {panel.title}
            </button>
          ),
        )}
      </nav>
      <details className="workspace-view-menu">
        <summary>View</summary>
        <div className="workspace-view-options" aria-label="Hidden panels">
          {hiddenPanels.length === 0 ? (
            <span>All panels are visible</span>
          ) : (
            hiddenPanels.map((panel) => (
              <button
                key={panel.id}
                type="button"
                onClick={(event) => {
                  activatePanel(panel.id);
                  const menu = event.currentTarget.closest("details");
                  if (menu) menu.open = false;
                }}
              >
                Show {panel.title}
              </button>
            ))
          )}
        </div>
      </details>
    </>
  );
}

export function WorkspacePanels({
  renderPanel,
}: {
  renderPanel: (id: PanelId, active: boolean) => ReactNode;
}) {
  const { activePanelId, hiddenPanelIds, openedPanelIds, hidePanel } =
    useWorkspaceManager();

  return (
    <div className="workspace-panel-host">
      {PANEL_REGISTRY.filter((panel) => openedPanelIds.has(panel.id)).map(
        (panel) => {
          const active =
            activePanelId === panel.id && !hiddenPanelIds.has(panel.id);
          return (
            <DockablePanel
              key={panel.id}
              registration={panel}
              active={active}
              onClose={() => hidePanel(panel.id)}
            >
              {renderPanel(panel.id, active)}
            </DockablePanel>
          );
        },
      )}
      {activePanelId === null && (
        <div className="workspace-no-panel" role="status">
          All panels are hidden. Choose a panel from View to continue.
        </div>
      )}
    </div>
  );
}
