import type { CSSProperties, ReactNode } from "react";
import type { PanelRegistration } from "./WorkspaceManager";

type DockablePanelProps = {
  registration: PanelRegistration;
  active: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function DockablePanel({
  registration,
  active,
  onClose,
  children,
}: DockablePanelProps) {
  const style = {
    "--panel-min-width": `${registration.minSize.width}px`,
    "--panel-min-height": `${registration.minSize.height}px`,
    "--panel-preferred-width": `${registration.preferredSize.width}px`,
    "--panel-preferred-height": `${registration.preferredSize.height}px`,
  } as CSSProperties;

  return (
    <section
      className="dockable-panel"
      aria-label={registration.title}
      aria-hidden={!active}
      data-panel-id={registration.id}
      data-min-size={`${registration.minSize.width}x${registration.minSize.height}`}
      data-preferred-size={`${registration.preferredSize.width}x${registration.preferredSize.height}`}
      data-overflow={registration.overflow}
      hidden={!active}
      style={style}
    >
      <header className="dockable-panel-titlebar">
        <h2>{registration.title}</h2>
        <button
          type="button"
          aria-label={`Hide ${registration.title} panel`}
          title={`Hide ${registration.title}`}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className={`dockable-panel-body overflow-${registration.overflow}`}>
        {children}
      </div>
    </section>
  );
}
