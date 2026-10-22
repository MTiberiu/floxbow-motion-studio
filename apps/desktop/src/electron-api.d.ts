import type {
  OpenPanelRequest,
  OpenPanelResult,
  PanelClosedEvent,
  ClosePanelRequest,
  TimelineCommandEnvelope,
  TimelineCommandResult,
  TimelineSnapshot,
  TimelineFrame,
  WindowContext,
} from "../electron/window-contract.cjs";

declare global {
  interface Window {
    floxBowWindows?: Readonly<{
      getContext: () => Promise<WindowContext>;
      openPanel: (request: OpenPanelRequest) => Promise<OpenPanelResult>;
      closePanel: (request?: ClosePanelRequest) => Promise<boolean>;
      onPanelClosed: (
        callback: (event: PanelClosedEvent) => void,
      ) => () => void;
      publishTimelineSnapshot: (
        snapshot: TimelineSnapshot,
      ) => Promise<{ status: "sent" | "unavailable" }>;
      publishTimelineFrame: (
        frame: TimelineFrame,
      ) => Promise<{ status: "sent" | "unavailable" }>;
      requestTimelineSnapshot: () => Promise<{ status: "requested" }>;
      sendTimelineCommand: (
        command: TimelineCommandEnvelope,
      ) => Promise<{ status: "queued" | "duplicate" }>;
      sendTimelineCommandResult: (
        result: TimelineCommandResult,
      ) => Promise<{ status: "sent" | "stale" }>;
      onTimelineSnapshot: (
        callback: (snapshot: TimelineSnapshot) => void,
      ) => () => void;
      onTimelineFrame: (callback: (frame: TimelineFrame) => void) => () => void;
      onTimelineSnapshotRequest: (
        callback: (request: PanelClosedEvent) => void,
      ) => () => void;
      onTimelineCommand: (
        callback: (command: TimelineCommandEnvelope) => void,
      ) => () => void;
      onTimelineCommandResult: (
        callback: (result: TimelineCommandResult) => void,
      ) => () => void;
    }>;
  }
}

export {};
