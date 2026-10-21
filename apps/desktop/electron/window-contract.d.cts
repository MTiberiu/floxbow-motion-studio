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

export const CHANNELS: Readonly<{
  getContext: "flox:window:get-context";
  openPanel: "flox:window:open-panel";
  panelClosed: "flox:window:panel-closed";
}>;
export const MAX_IPC_MESSAGE_BYTES: 4096;
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
export function isEmptyRequest(args: readonly unknown[]): boolean;
export function isWithinMessageLimit(value: unknown): boolean;
