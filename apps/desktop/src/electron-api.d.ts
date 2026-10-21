import type {
  OpenPanelRequest,
  OpenPanelResult,
  PanelClosedEvent,
  WindowContext,
} from "../electron/window-contract.cjs";

declare global {
  interface Window {
    floxBowWindows?: Readonly<{
      getContext: () => Promise<WindowContext>;
      openPanel: (request: OpenPanelRequest) => Promise<OpenPanelResult>;
      onPanelClosed: (
        callback: (event: PanelClosedEvent) => void,
      ) => () => void;
    }>;
  }
}

export {};
