export type PanelId = "timeline";

export type PrimaryWindowContext = Readonly<{
  role: "primary";
  panelId: null;
}>;

export type PanelWindowContext = Readonly<{
  role: "panel";
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
  commandSequence: number;
}>;

export type WindowContext = PrimaryWindowContext | PanelWindowContext;

export type OpenPanelRequest = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
}>;

export type OpenPanelResult = Readonly<{
  panelId: PanelId;
  instanceId: string;
  status: "opened" | "focused";
}>;

export type PanelClosedEvent = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
}>;

export type ClosePanelRequest = Readonly<{
  panelId: PanelId;
  instanceId: string;
}>;

export type TimelineCommand =
  | Readonly<{ type: "selectClip"; clipId: string }>
  | Readonly<{ type: "selectClips"; clipIds: readonly string[] }>
  | Readonly<{ type: "seek"; frame: number }>
  | Readonly<{ type: "play" | "pause" | "undo" | "redo" }>
  | Readonly<{ type: "copy" | "cut" | "paste" | "duplicate" | "delete" }>
  | Readonly<{ type: "editTimeline"; document: unknown; checkpoint: boolean }>
  | Readonly<{
      type: "beginClipGesture";
      gestureId: string;
      clipId: string;
      duplicateId?: string;
      groupMove?: boolean;
    }>
  | Readonly<{
      type: "updateClipGesture";
      gestureId: string;
      clipId: string;
      from: number;
      durationInFrames: number;
      trim: boolean;
    }>
  | Readonly<{ type: "endClipGesture"; gestureId: string }>;

export type TimelineSnapshot = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
  stateVersion: number;
  sourceCommandId: string | null;
  fps: number;
  durationInFrames: number;
  hasEditableTimeline: boolean;
  document: unknown | null;
  components: readonly unknown[];
  selectedClipId: string;
  selectedClipIds: readonly string[];
  frame: number;
  playing: boolean;
  dirty: boolean;
  conflict: boolean;
  undoCount: number;
  redoCount: number;
}>;

export type TimelineCommandEnvelope = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
  commandId: string;
  stateVersion: number;
  command: TimelineCommand;
}>;

export type TimelineCommandResult = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
  commandId: string;
  status: "accepted" | "rejected";
  stateVersion: number;
  message: string;
}>;

export type TimelineFrame = Readonly<{
  panelId: PanelId;
  projectId: string;
  sessionId: string;
  instanceId: string;
  stateVersion: number;
  frame: number;
  playing: boolean;
}>;

export const CHANNELS: Readonly<{
  getContext: "flox:window:get-context";
  openPanel: "flox:window:open-panel";
  panelClosed: "flox:window:panel-closed";
  closePanel: "flox:window:close-panel";
  timelineSnapshot: "flox:timeline:snapshot";
  timelineSnapshotRequest: "flox:timeline:snapshot-request";
  timelineFrame: "flox:timeline:frame";
  timelineCommand: "flox:timeline:command";
  timelineCommandResult: "flox:timeline:command-result";
}>;
export const MAX_IPC_MESSAGE_BYTES: 4096;
export const MAX_TIMELINE_SNAPSHOT_BYTES: 1048576;
export const PANEL_REGISTRY: Readonly<
  Record<
    PanelId,
    Readonly<{
      id: PanelId;
      title: string;
      route: string;
      width: number;
      height: number;
      minWidth: number;
      minHeight: number;
    }>
  >
>;
export function isPanelOpenRequest(value: unknown): value is OpenPanelRequest;
export function isWindowContext(value: unknown): value is WindowContext;
export function isOpenPanelResult(value: unknown): value is OpenPanelResult;
export function isPanelClosedEvent(value: unknown): value is PanelClosedEvent;
export function isClosePanelRequest(value: unknown): value is ClosePanelRequest;
export function isTimelineDocument(value: unknown): boolean;
export function isTimelineSnapshot(value: unknown): value is TimelineSnapshot;
export function isTimelineCommand(
  value: unknown,
): value is TimelineCommandEnvelope;
export function isTimelineCommandResult(
  value: unknown,
): value is TimelineCommandResult;
export function isTimelineFrame(value: unknown): value is TimelineFrame;
export function isEmptyRequest(args: readonly unknown[]): boolean;
export function isWithinMessageLimit(value: unknown): boolean;
export function isWithinTimelineSnapshotLimit(value: unknown): boolean;
declare const windowContract: Readonly<{
  isTimelineSnapshot: (value: unknown) => value is TimelineSnapshot;
  isTimelineFrame: (value: unknown) => value is TimelineFrame;
}>;
export default windowContract;
