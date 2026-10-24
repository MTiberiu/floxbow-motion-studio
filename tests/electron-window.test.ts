import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createWindowHost } from "../apps/desktop/electron/window-host.cjs";
import {
  CHANNELS,
  MAX_IPC_MESSAGE_BYTES,
  MAX_TIMELINE_SNAPSHOT_BYTES,
  PANEL_REGISTRY,
  isOpenPanelResult,
  isPanelClosedEvent,
  isPanelOpenRequest,
  isWindowContext,
  isWithinMessageLimit,
  isTimelineCommand,
  isTimelineCommandResult,
  isTimelineFrame,
  isTimelineSnapshot,
  isWithinTimelineSnapshotLimit,
} from "../apps/desktop/electron/window-contract.cjs";

const shellUrl = "http://127.0.0.1:5173/";
const request = {
  panelId: "timeline",
  projectId: "demo-project",
  sessionId: "3e0f6340-1e31-4d8a-a220-a0475d3cfb68",
};
const testTimeline = {
  version: 1 as const,
  fps: 30,
  durationInFrames: 180,
  tracks: [{ id: "visuals", name: "Visuals" }],
  clips: [],
};

function timelineSnapshot(
  instanceId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId,
    stateVersion: 0,
    sourceCommandId: null,
    fps: 30,
    durationInFrames: 180,
    hasEditableTimeline: true,
    document: testTimeline,
    components: [],
    selectedClipId: "",
    selectedClipIds: [],
    frame: 0,
    playing: false,
    dirty: false,
    conflict: false,
    undoCount: 0,
    redoCount: 0,
    ...overrides,
  };
}

class FakeWebContents extends EventEmitter {
  id: number;
  mainFrame: { url: string };
  destroyed = false;
  openHandler?: () => { action: string };
  sent: Array<{ channel: string; payload: unknown }> = [];

  constructor(id: number, url: string) {
    super();
    this.id = id;
    this.mainFrame = { url };
  }

  setWindowOpenHandler(handler: () => { action: string }) {
    this.openHandler = handler;
  }

  isDestroyed() {
    return this.destroyed;
  }

  send(channel: string, payload: unknown) {
    this.sent.push({ channel, payload });
  }
}

class FakeWindow extends EventEmitter {
  static nextId = 1;
  static instances: FakeWindow[] = [];
  static failNextLoad = false;
  options: Record<string, any>;
  webContents: FakeWebContents;
  destroyed = false;
  shown = false;
  focused = false;
  loadedUrl = "";

  constructor(options: Record<string, any>) {
    super();
    this.options = options;
    this.webContents = new FakeWebContents(FakeWindow.nextId++, "about:blank");
    FakeWindow.instances.push(this);
  }

  loadURL(url: string) {
    this.loadedUrl = url;
    this.webContents.mainFrame.url = url;
    if (FakeWindow.failNextLoad) {
      FakeWindow.failNextLoad = false;
      queueMicrotask(() =>
        this.webContents.emit(
          "did-fail-load",
          { preventDefault() {} },
          -105,
          "ERR_NAME_NOT_RESOLVED",
          url,
          true,
          0,
          0,
        ),
      );
      return Promise.reject(new Error("Simulated local route load failure"));
    }
    queueMicrotask(() => this.emit("ready-to-show"));
    return Promise.resolve();
  }

  show() {
    this.shown = true;
  }

  focus() {
    this.focused = true;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.webContents.destroyed = true;
    this.emit("closed");
  }
}

function createHarness() {
  FakeWindow.nextId = 1;
  FakeWindow.instances = [];
  FakeWindow.failNextLoad = false;
  const app = new EventEmitter();
  const handlers = new Map<string, (event: any, ...args: any[]) => unknown>();
  const clipboardWrites: string[] = [];
  const ipcMain = {
    handle(channel: string, handler: (event: any, ...args: any[]) => unknown) {
      handlers.set(channel, handler);
    },
  };
  const host = createWindowHost({
    app,
    BrowserWindow: FakeWindow,
    ipcMain,
    clipboard: { writeText: (value: string) => clipboardWrites.push(value) },
    shellUrl,
    preloadPath: "C:/app/preload.cjs",
  });
  const primary = host.createPrimaryWindow() as FakeWindow;
  const invokeEvent = (channel: string, event: any, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    assert.ok(handler, `missing handler for ${channel}`);
    return handler(event, ...args);
  };
  const invoke = (channel: string, window: FakeWindow, ...args: unknown[]) =>
    invokeEvent(
      channel,
      { sender: window.webContents, senderFrame: window.webContents.mainFrame },
      ...args,
    );
  return {
    app,
    handlers,
    host,
    invoke,
    invokeEvent,
    primary,
    clipboardWrites,
    windows: FakeWindow.instances,
  };
}

test("visual context IPC captures bounded Canvas pixels and limits access to the primary window", async () => {
  const { invoke, primary, clipboardWrites, windows } = createHarness();
  const rect = { x: 10, y: 20, width: 320, height: 180 };
  const capturedRects: unknown[] = [];
  Object.assign(primary, { getContentSize: () => [800, 600] });
  Object.assign(primary.webContents, {
    capturePage: async (requestedRect: unknown) => {
      capturedRects.push(requestedRect);
      const capture = requestedRect as typeof rect;
      return {
        toPNG: () => Buffer.from("canvas-png"),
        getSize: () => ({ width: capture.width, height: capture.height }),
      };
    },
  });

  const captured = (await invoke(CHANNELS.captureCanvas, primary, rect)) as {
    dataUrl: string;
    width: number;
    height: number;
  };
  assert.equal(
    captured.dataUrl,
    `data:image/png;base64,${Buffer.from("canvas-png").toString("base64")}`,
  );
  assert.equal(captured.width, rect.width);
  assert.equal(captured.height, rect.height);
  const clipped = (await invoke(CHANNELS.captureCanvas, primary, {
    ...rect,
    x: 600,
  })) as { width: number; height: number };
  assert.deepEqual(capturedRects[1], { x: 600, y: 20, width: 200, height: 180 });
  assert.equal(clipped.width, 200);
  assert.equal(clipped.height, 180);
  await assert.rejects(
    Promise.resolve(
      invoke(CHANNELS.captureCanvas, primary, { ...rect, x: 800 }),
    ),
    /outside the editor window/,
  );
  await assert.rejects(
    Promise.resolve(
      invoke(CHANNELS.captureCanvas, primary, rect, "unexpected"),
    ),
    /Invalid Canvas capture rectangle/,
  );
  Object.assign(primary.webContents, {
    capturePage: async () => ({
      toPNG: () => Buffer.alloc(8_000_001),
      getSize: () => ({ width: 1, height: 1 }),
    }),
  });
  await assert.rejects(
    Promise.resolve(invoke(CHANNELS.captureCanvas, primary, rect)),
    /exceeds the 8 MiB limit/,
  );

  assert.equal(invoke(CHANNELS.copyVisualContext, primary, "request text"), true);
  assert.deepEqual(clipboardWrites, ["request text"]);
  assert.throws(
    () => invoke(CHANNELS.copyVisualContext, primary, "x".repeat(20_001)),
    /Invalid visual context clipboard text/,
  );
  assert.throws(
    () => invoke(CHANNELS.copyVisualContext, primary, "text", "unexpected"),
    /Invalid visual context clipboard text/,
  );

  invoke(CHANNELS.openPanel, primary, request);
  assert.throws(
    () => invoke(CHANNELS.copyVisualContext, windows[1], "child request"),
    /not permitted for this window role/,
  );
  await assert.rejects(
    Promise.resolve(invoke(CHANNELS.captureCanvas, windows[1], rect)),
    /not permitted for this window role/,
  );
  assert.deepEqual(clipboardWrites, ["request text"]);
});

test("panel open contract is strict, bounded and rejects malformed identifiers", () => {
  assert.deepEqual(Object.keys(PANEL_REGISTRY), ["timeline"]);
  assert.equal(PANEL_REGISTRY.timeline.route, "#studio-panel=timeline");
  assert.equal(isPanelOpenRequest(request), true);
  assert.equal(isPanelOpenRequest({ ...request, extra: true }), false);
  assert.equal(
    isPanelOpenRequest({ ...request, panelId: "../timeline" }),
    false,
  );
  assert.equal(
    isPanelOpenRequest({ ...request, projectId: "Upper Case" }),
    false,
  );
  assert.equal(
    isPanelOpenRequest({ ...request, sessionId: "old-session" }),
    false,
  );
  assert.equal(
    isWithinMessageLimit("x".repeat(MAX_IPC_MESSAGE_BYTES - 2)),
    true,
  );
  assert.equal(
    isWithinMessageLimit("x".repeat(MAX_IPC_MESSAGE_BYTES + 1)),
    false,
  );
  assert.equal(
    isPanelOpenRequest({
      ...request,
      projectId: "x".repeat(MAX_IPC_MESSAGE_BYTES),
    }),
    false,
  );
  assert.equal(isWindowContext({ role: "primary", panelId: null }), true);
  assert.equal(
    isWindowContext({ role: "primary", panelId: null, projectId: "extra" }),
    false,
  );
  assert.equal(
    isOpenPanelResult({
      panelId: "timeline",
      instanceId: request.sessionId,
      status: "opened",
    }),
    true,
  );
  assert.equal(
    isPanelClosedEvent({
      panelId: "timeline",
      projectId: request.projectId,
      sessionId: request.sessionId,
      instanceId: request.sessionId,
    }),
    true,
  );
  assert.equal(
    isPanelClosedEvent({
      panelId: "timeline",
      projectId: request.projectId,
      sessionId: request.sessionId,
      instanceId: request.sessionId,
      path: "C:/private",
    }),
    false,
  );
});

test("Timeline snapshots use a strict 1 MiB schema while control messages remain 4 KiB", () => {
  const instanceId = request.sessionId;
  assert.equal(MAX_TIMELINE_SNAPSHOT_BYTES, 1024 * 1024);
  const valid = timelineSnapshot(instanceId);
  assert.equal(isTimelineSnapshot(valid), true);
  assert.equal(isWithinTimelineSnapshotLimit(valid), true);
  const layered = timelineSnapshot(instanceId, {
    document: {
      ...testTimeline,
      trackOrder: "top-down",
      tracks: [
        { id: "titles", name: "Titles", kind: "visual", locked: true },
        {
          id: "background",
          name: "Background",
          kind: "visual",
          visible: false,
        },
        { id: "audio", name: "Audio", kind: "audio" },
      ],
    },
  });
  assert.equal(isTimelineSnapshot(layered), true);
  assert.equal(
    isTimelineSnapshot({
      ...layered,
      document: {
        ...layered.document,
        tracks: [{ id: "audio", name: "Audio", kind: "audio", owner: "bad" }],
      },
    }),
    false,
  );
  assert.equal(isTimelineSnapshot({ ...valid, extra: true }), false);
  assert.equal(isTimelineSnapshot({ ...valid, frame: 180 }), false);
  assert.equal(
    isTimelineSnapshot({
      ...valid,
      document: {
        ...testTimeline,
        clips: [
          { ...((testTimeline.clips[0] ?? {}) as object), invalid: true },
        ],
      },
    }),
    false,
  );
  const oversized = timelineSnapshot(instanceId, {
    document: {
      ...testTimeline,
      clips: [
        {
          id: "caption",
          trackId: "visuals",
          componentId: "subtitles",
          label: "Caption",
          from: 0,
          durationInFrames: 180,
          content: { text: "x".repeat(MAX_TIMELINE_SNAPSHOT_BYTES) },
          props: {},
        },
      ],
    },
  });
  assert.equal(isWithinTimelineSnapshotLimit(oversized), false);
  assert.equal(isTimelineSnapshot(oversized), false);
  assert.equal(
    isWithinMessageLimit("x".repeat(MAX_IPC_MESSAGE_BYTES + 1)),
    false,
  );
});

test("Timeline commands and acknowledgments require a scoped command ID and exact schema", () => {
  const instanceId = request.sessionId;
  const command = {
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId,
    commandId: `${instanceId}:1`,
    stateVersion: 7,
    command: { type: "seek", frame: 42 },
  };
  assert.equal(isTimelineCommand(command), true);
  assert.equal(
    isTimelineCommand({ ...command, command: { type: "copy" } }),
    true,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "updateClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        from: 60,
        durationInFrames: 90,
        trim: true,
        ripple: true,
      },
    }),
    true,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "updateClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        from: 60,
        durationInFrames: 90,
        trim: true,
        ripple: "yes",
      },
    }),
    false,
  );
  assert.equal(
    isTimelineCommand({ ...command, command: { type: "delete", extra: true } }),
    false,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "beginClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        duplicateId: "clip-copy",
      },
    }),
    true,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "beginClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        groupMove: true,
      },
    }),
    true,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "beginClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        groupMove: false,
      },
    }),
    false,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "beginClipGesture",
        gestureId: instanceId,
        clipId: "caption",
        duplicateId: "../bad",
      },
    }),
    false,
  );
  assert.equal(
    isTimelineCommand({ ...command, commandId: `${instanceId}:2`, extra: 1 }),
    false,
  );
  assert.equal(
    isTimelineCommand({ ...command, commandId: `${instanceId}:x` }),
    false,
  );
  assert.equal(
    isTimelineCommand({ ...command, command: { type: "execute", code: "x" } }),
    false,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: { type: "selectClips", clipIds: ["a", "b"] },
    }),
    true,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: { type: "selectClips", clipIds: ["a", "a"] },
    }),
    false,
  );
  assert.equal(
    isTimelineCommand({
      ...command,
      command: {
        type: "selectClips",
        clipIds: Array.from({ length: 257 }, (_, index) => String(index)),
      },
    }),
    false,
  );
  const result = {
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId,
    commandId: command.commandId,
    status: "rejected",
    stateVersion: 7,
    message: "Stale session.",
  };
  assert.equal(isTimelineCommandResult(result), true);
  assert.equal(
    isTimelineCommandResult({ ...result, message: "x".repeat(5000) }),
    false,
  );
  assert.equal(
    isTimelineFrame({
      panelId: "timeline",
      projectId: request.projectId,
      sessionId: request.sessionId,
      instanceId,
      stateVersion: 7,
      frame: 42,
      playing: false,
    }),
    true,
  );
});

test("only the primary opens the one fixed, sandboxed Timeline route", () => {
  const { invoke, primary, windows } = createHarness();
  const result = invoke(CHANNELS.openPanel, primary, request) as {
    status: string;
    instanceId: string;
  };
  assert.equal(result.status, "opened");
  assert.equal(windows.length, 2);
  const child = windows[1];
  assert.equal(child.loadedUrl, `${shellUrl}#studio-panel=timeline`);
  assert.deepEqual(child.options.webPreferences, {
    preload: "C:/app/preload.cjs",
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
  });
  assert.equal(child.options.parent, primary);
  assert.equal(child.options.resizable, true);
  assert.equal(child.options.maximizable, true);
  assert.equal(child.options.fullscreenable, true);
  assert.equal(child.webContents.openHandler?.().action, "deny");
  const context = invoke(CHANNELS.getContext, child);
  assert.deepEqual(context, {
    role: "panel",
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId: result.instanceId,
    commandSequence: 0,
  });

  const again = invoke(CHANNELS.openPanel, primary, request) as typeof result;
  assert.equal(again.status, "focused");
  assert.equal(again.instanceId, result.instanceId);
  assert.equal(windows.length, 2);
  assert.equal(child.focused, true);
  assert.throws(
    () => invoke(CHANNELS.openPanel, child, request),
    /window role/,
  );
  assert.throws(
    () =>
      invoke(CHANNELS.openPanel, primary, {
        ...request,
        route: "file:///secret",
      }),
    /Invalid panel open request/,
  );
});

test("Timeline snapshots and commands relay only between the primary and the registered child", () => {
  const { invoke, primary, windows } = createHarness();
  const opened = invoke(CHANNELS.openPanel, primary, request) as {
    instanceId: string;
  };
  const child = windows[1];
  const snapshot = timelineSnapshot(opened.instanceId);
  assert.equal(
    isTimelineSnapshot({
      ...snapshot,
      selectedClipIds: ["a", "b"],
      selectedClipId: "a",
    }),
    true,
  );
  assert.equal(
    isTimelineSnapshot({
      ...snapshot,
      selectedClipIds: ["a", "a"],
      selectedClipId: "a",
    }),
    false,
  );
  assert.deepEqual(invoke(CHANNELS.timelineSnapshot, primary, snapshot), {
    status: "sent",
  });
  assert.equal(
    child.webContents.sent.at(-1)?.channel,
    CHANNELS.timelineSnapshot,
  );
  assert.throws(
    () => invoke(CHANNELS.timelineSnapshot, child, snapshot),
    /window role/,
  );
  assert.throws(
    () =>
      invoke(
        CHANNELS.timelineSnapshot,
        primary,
        timelineSnapshot("b7e53745-4f09-42b8-b49b-cd9c30be5a6e"),
      ),
    /stale window or session/,
  );
  const command = {
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId: opened.instanceId,
    commandId: `${opened.instanceId}:1`,
    stateVersion: 0,
    command: { type: "seek", frame: 24 },
  };
  assert.deepEqual(invoke(CHANNELS.timelineCommand, child, command), {
    status: "queued",
  });
  assert.equal(
    primary.webContents.sent.at(-1)?.channel,
    CHANNELS.timelineCommand,
  );
  assert.deepEqual(invoke(CHANNELS.timelineCommand, child, command), {
    status: "duplicate",
  });
  assert.equal(
    child.webContents.sent.at(-1)?.channel,
    CHANNELS.timelineCommandResult,
  );
  assert.equal(
    (child.webContents.sent.at(-1)?.payload as { status: string }).status,
    "rejected",
  );
  const accepted = {
    panelId: "timeline",
    projectId: request.projectId,
    sessionId: request.sessionId,
    instanceId: opened.instanceId,
    commandId: command.commandId,
    status: "accepted",
    stateVersion: 1,
    message: "",
  };
  assert.deepEqual(invoke(CHANNELS.timelineCommandResult, primary, accepted), {
    status: "sent",
  });
  assert.equal(child.webContents.sent.at(-1)?.payload, accepted);
  assert.deepEqual(
    invoke(CHANNELS.timelineFrame, primary, {
      panelId: "timeline",
      projectId: request.projectId,
      sessionId: request.sessionId,
      instanceId: opened.instanceId,
      stateVersion: 1,
      frame: 24,
      playing: false,
    }),
    { status: "sent" },
  );
  assert.equal(child.webContents.sent.at(-1)?.channel, CHANNELS.timelineFrame);
});

test("primary or child attach closes only its registered Timeline instance", () => {
  const primaryRequest = createHarness();
  const opened = primaryRequest.invoke(
    CHANNELS.openPanel,
    primaryRequest.primary,
    request,
  ) as { instanceId: string };
  const child = primaryRequest.windows[1];
  assert.equal(
    primaryRequest.invoke(CHANNELS.closePanel, primaryRequest.primary, {
      panelId: "timeline",
      instanceId: opened.instanceId,
    }),
    true,
  );
  assert.equal(child.isDestroyed(), true);
  assert.equal(
    primaryRequest.primary.webContents.sent.at(-1)?.channel,
    CHANNELS.panelClosed,
  );

  const childRequest = createHarness();
  childRequest.invoke(CHANNELS.openPanel, childRequest.primary, request);
  assert.equal(
    childRequest.invoke(CHANNELS.closePanel, childRequest.windows[1]),
    true,
  );
  assert.equal(childRequest.windows[1].isDestroyed(), true);
});

test("stale sessions are replaced and old window messages are rejected", () => {
  const { invoke, primary, windows } = createHarness();
  const opened = invoke(CHANNELS.openPanel, primary, request) as {
    status: string;
    instanceId: string;
  };
  assert.equal(opened.status, "opened");
  const oldChild = windows[1];
  const nextRequest = {
    ...request,
    projectId: "next-project",
    sessionId: "b7e53745-4f09-42b8-b49b-cd9c30be5a6e",
  };
  const replaced = invoke(
    CHANNELS.openPanel,
    primary,
    nextRequest,
  ) as typeof opened;
  assert.equal(replaced.status, "opened");
  assert.notEqual(replaced.instanceId, opened.instanceId);
  assert.equal(oldChild.isDestroyed(), true);
  assert.throws(
    () => invoke(CHANNELS.getContext, oldChild),
    /Unregistered Electron window/,
  );
  assert.equal(windows.length, 3);
  assert.deepEqual(invoke(CHANNELS.getContext, windows[2]), {
    role: "panel",
    panelId: "timeline",
    projectId: nextRequest.projectId,
    sessionId: nextRequest.sessionId,
    instanceId: replaced.instanceId,
    commandSequence: 0,
  });
});

test("main-frame route validation and native window guards reject navigation, popups and webviews", () => {
  const { invoke, invokeEvent, primary, windows } = createHarness();
  invoke(CHANNELS.openPanel, primary, request);
  const child = windows[1];

  let navigationPrevented = false;
  child.webContents.emit(
    "will-navigate",
    {
      preventDefault() {
        navigationPrevented = true;
      },
    },
    "https://example.com/",
  );
  assert.equal(navigationPrevented, true);

  let redirectPrevented = false;
  child.webContents.emit(
    "will-redirect",
    {
      preventDefault() {
        redirectPrevented = true;
      },
    },
    "file:///secret",
  );
  assert.equal(redirectPrevented, true);

  let webviewPrevented = false;
  child.webContents.emit("will-attach-webview", {
    preventDefault() {
      webviewPrevented = true;
    },
  });
  assert.equal(webviewPrevented, true);

  const subframe = { url: child.loadedUrl };
  assert.throws(
    () =>
      invokeEvent(CHANNELS.getContext, {
        sender: child.webContents,
        senderFrame: subframe,
      }),
    /main frame/,
  );
  const spoofedEvent = {
    sender: new FakeWebContents(child.webContents.id, child.loadedUrl),
    senderFrame: child.webContents.mainFrame,
  };
  assert.throws(
    () => invokeEvent(CHANNELS.getContext, spoofedEvent),
    /sender identity mismatch/,
  );
});

test("closing a child notifies the primary once and primary shutdown closes children silently", () => {
  const { app, invoke, primary, windows } = createHarness();
  const opened = invoke(CHANNELS.openPanel, primary, request) as {
    instanceId: string;
  };
  const child = windows[1];
  child.destroy();
  assert.deepEqual(primary.webContents.sent, [
    {
      channel: CHANNELS.panelClosed,
      payload: {
        panelId: "timeline",
        projectId: request.projectId,
        sessionId: request.sessionId,
        instanceId: opened.instanceId,
      },
    },
  ]);

  invoke(CHANNELS.openPanel, primary, request);
  const reopenedChild = windows[2];
  primary.destroy();
  assert.equal(reopenedChild.isDestroyed(), true);
  assert.equal(primary.webContents.sent.length, 1);

  app.emit("before-quit");
  assert.equal(reopenedChild.isDestroyed(), true);

  const quitting = createHarness();
  quitting.invoke(CHANNELS.openPanel, quitting.primary, request);
  const quittingChild = quitting.windows[1];
  quitting.app.emit("before-quit");
  assert.equal(quittingChild.isDestroyed(), true);
  assert.deepEqual(quitting.primary.webContents.sent, []);
  assert.throws(
    () => quitting.invoke(CHANNELS.openPanel, quitting.primary, request),
    /shutting down/,
  );
});

test("failed panel loading closes the child and restores the primary Timeline", async () => {
  const { invoke, primary, windows } = createHarness();
  FakeWindow.failNextLoad = true;
  const opened = invoke(CHANNELS.openPanel, primary, request) as {
    instanceId: string;
  };
  const child = windows[1];
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(child.isDestroyed(), true);
  assert.deepEqual(primary.webContents.sent, [
    {
      channel: CHANNELS.panelClosed,
      payload: {
        panelId: "timeline",
        projectId: request.projectId,
        sessionId: request.sessionId,
        instanceId: opened.instanceId,
      },
    },
  ]);
  assert.throws(
    () => invoke(CHANNELS.getContext, child),
    /Unregistered Electron window/,
  );
});

test("child renderer termination and unresponsiveness reattach without duplicate close events", () => {
  for (const failure of ["render-process-gone", "unresponsive"] as const) {
    const { invoke, primary, windows } = createHarness();
    const opened = invoke(CHANNELS.openPanel, primary, request) as {
      instanceId: string;
    };
    const child = windows[1];
    child.webContents.emit(failure);

    assert.equal(child.isDestroyed(), true);
    assert.deepEqual(primary.webContents.sent, [
      {
        channel: CHANNELS.panelClosed,
        payload: {
          panelId: "timeline",
          projectId: request.projectId,
          sessionId: request.sessionId,
          instanceId: opened.instanceId,
        },
      },
    ]);
  }
});

test("main-frame route load failure restores Timeline while subframe failure is ignored", () => {
  const { invoke, primary, windows } = createHarness();
  invoke(CHANNELS.openPanel, primary, request);
  const child = windows[1];
  child.webContents.emit(
    "did-fail-load",
    { preventDefault() {} },
    -105,
    "ERR_NAME_NOT_RESOLVED",
    child.loadedUrl,
    false,
  );
  assert.equal(child.isDestroyed(), false);
  assert.equal(primary.webContents.sent.length, 0);

  child.webContents.emit(
    "did-fail-load",
    { preventDefault() {} },
    -105,
    "ERR_NAME_NOT_RESOLVED",
    child.loadedUrl,
    true,
  );
  assert.equal(child.isDestroyed(), true);
  assert.equal(primary.webContents.sent.at(-1)?.channel, CHANNELS.panelClosed);
});
