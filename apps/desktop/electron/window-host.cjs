const crypto = require("node:crypto");
const {
  CHANNELS,
  PANEL_REGISTRY,
  isClosePanelRequest,
  isEmptyRequest,
  isOpenPanelResult,
  isPanelClosedEvent,
  isPanelOpenRequest,
  isWindowContext,
  isWithinMessageLimit,
  isTimelineSnapshot,
  isTimelineCommand,
  isTimelineCommandResult,
  isTimelineFrame,
  isWithinTimelineSnapshotLimit,
} = require("./window-contract.cjs");

function createWindowHost({
  app,
  BrowserWindow,
  ipcMain,
  shellUrl,
  preloadPath,
}) {
  const shellOrigin = new URL(shellUrl).origin;
  const primaryUrl = shellUrl;
  let primaryWindow = null;
  let primaryRecord = null;
  let shuttingDown = false;
  const windowsByContentsId = new Map();
  const panelWindows = new Map();

  function expectedRoute(record) {
    if (record.role === "primary") return primaryUrl;
    const route = PANEL_REGISTRY[record.panelId]?.route;
    if (!route) throw new Error("Unknown panel route");
    return `${shellUrl}${route}`;
  }

  function installContentsGuards(window, record) {
    const expectedUrl = expectedRoute(record);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, target) => {
      if (target !== expectedUrl) event.preventDefault();
    });
    window.webContents.on("will-redirect", (event, target) => {
      if (target !== expectedUrl) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
  }

  function registerWindow(window, record) {
    record.window = window;
    record.webContentsId = window.webContents.id;
    windowsByContentsId.set(record.webContentsId, record);
    installContentsGuards(window, record);
  }

  function secureWebPreferences() {
    return {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    };
  }

  function assertSender(event, expectedRole) {
    const record = windowsByContentsId.get(event.sender?.id);
    if (!record || record.window.isDestroyed())
      throw new Error("Unregistered Electron window");
    if (expectedRole && record.role !== expectedRole)
      throw new Error("IPC is not permitted for this window role");
    if (event.sender !== record.window.webContents)
      throw new Error("IPC sender identity mismatch");
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error("IPC is only accepted from the main frame");
    const senderUrl = event.senderFrame?.url;
    if (senderUrl !== expectedRoute(record))
      throw new Error("IPC sender route mismatch");
    if (new URL(senderUrl).origin !== shellOrigin)
      throw new Error("IPC sender origin mismatch");
    if (record.role === "panel" && panelWindows.get(record.panelId) !== record)
      throw new Error("Stale panel window");
    return record;
  }

  function primaryContext() {
    return Object.freeze({ role: "primary", panelId: null });
  }

  function validateOutgoingMessage(value, schema, label) {
    if (!schema(value) || !isWithinMessageLimit(value))
      throw new Error(`Invalid ${label} message`);
    return value;
  }

  function notifyPanelClosed(record) {
    if (
      shuttingDown ||
      !primaryWindow ||
      primaryWindow.isDestroyed() ||
      primaryWindow.webContents.isDestroyed()
    )
      return;
    const payload = validateOutgoingMessage(
      {
        panelId: record.panelId,
        projectId: record.projectId,
        sessionId: record.sessionId,
        instanceId: record.instanceId,
      },
      isPanelClosedEvent,
      "panel close",
    );
    primaryWindow.webContents.send(CHANNELS.panelClosed, payload);
  }

  function closePanel(record, notify = true) {
    if (panelWindows.get(record.panelId) !== record) return;
    panelWindows.delete(record.panelId);
    windowsByContentsId.delete(record.webContentsId);
    if (!record.window.isDestroyed()) record.window.destroy();
    if (notify) notifyPanelClosed(record);
  }

  function createPanelWindow(request) {
    const registration = PANEL_REGISTRY[request.panelId];
    const instanceId = crypto.randomUUID();
    const record = {
      role: "panel",
      panelId: registration.id,
      projectId: request.projectId,
      sessionId: request.sessionId,
      instanceId,
      window: null,
      webContentsId: null,
      commandIds: new Set(),
      lastCommandSequence: 0,
    };
    const window = new BrowserWindow({
      title: registration.title,
      width: registration.width,
      height: registration.height,
      minWidth: registration.minWidth,
      minHeight: registration.minHeight,
      resizable: true,
      maximizable: true,
      fullscreenable: true,
      show: false,
      parent: primaryWindow,
      backgroundColor: "#10151d",
      webPreferences: secureWebPreferences(),
    });
    registerWindow(window, record);
    panelWindows.set(record.panelId, record);
    window.once("ready-to-show", () => {
      if (!shuttingDown && !window.isDestroyed()) window.show();
    });
    window.once("closed", () => {
      if (panelWindows.get(record.panelId) !== record) return;
      panelWindows.delete(record.panelId);
      windowsByContentsId.delete(record.webContentsId);
      notifyPanelClosed(record);
    });
    window.webContents.once("render-process-gone", () => {
      if (panelWindows.get(record.panelId) === record) closePanel(record);
    });
    window.webContents.on(
      "did-fail-load",
      (_event, _errorCode, _description, _validatedUrl, isMainFrame) => {
        if (isMainFrame && panelWindows.get(record.panelId) === record)
          closePanel(record);
      },
    );
    window.webContents.once("unresponsive", () => {
      if (panelWindows.get(record.panelId) === record) closePanel(record);
    });
    try {
      Promise.resolve(window.loadURL(expectedRoute(record))).catch(() => {
        if (panelWindows.get(record.panelId) === record) closePanel(record);
      });
    } catch {
      if (panelWindows.get(record.panelId) === record) closePanel(record);
    }
    return record;
  }

  function createPrimaryWindow() {
    if (primaryWindow && !primaryWindow.isDestroyed()) {
      primaryWindow.focus();
      return primaryWindow;
    }
    const window = new BrowserWindow({
      title: "AI Motion Studio",
      width: 1440,
      height: 980,
      minWidth: 1000,
      minHeight: 700,
      backgroundColor: "#10151d",
      webPreferences: secureWebPreferences(),
    });
    const record = {
      role: "primary",
      panelId: null,
      window,
      webContentsId: null,
      commandIds: new Set(),
    };
    primaryWindow = window;
    primaryRecord = record;
    registerWindow(window, record);
    window.once("closed", () => {
      if (primaryWindow === window) {
        primaryWindow = null;
        primaryRecord = null;
      }
      for (const panelRecord of [...panelWindows.values()])
        closePanel(panelRecord, false);
    });
    window.loadURL(primaryUrl);
    return window;
  }

  ipcMain.handle(CHANNELS.getContext, (event, ...args) => {
    const record = assertSender(event);
    if (!isEmptyRequest(args))
      throw new Error("Window context takes no arguments");
    const context =
      record.role === "primary"
        ? primaryContext()
        : Object.freeze({
            role: "panel",
            panelId: record.panelId,
            projectId: record.projectId,
            sessionId: record.sessionId,
            instanceId: record.instanceId,
            commandSequence: record.lastCommandSequence,
          });
    return validateOutgoingMessage(context, isWindowContext, "window context");
  });

  ipcMain.handle(CHANNELS.openPanel, (event, request, ...args) => {
    assertSender(event, "primary");
    if (args.length !== 0 || !isPanelOpenRequest(request))
      throw new Error("Invalid panel open request");
    if (shuttingDown) throw new Error("Application is shutting down");
    if (!primaryWindow || primaryWindow.isDestroyed())
      throw new Error("Primary window is unavailable");
    const existing = panelWindows.get(request.panelId);
    if (existing && !existing.window.isDestroyed()) {
      if (
        existing.projectId === request.projectId &&
        existing.sessionId === request.sessionId
      ) {
        existing.window.show();
        existing.window.focus();
        return validateOutgoingMessage(
          {
            panelId: request.panelId,
            instanceId: existing.instanceId,
            status: "focused",
          },
          isOpenPanelResult,
          "panel open result",
        );
      }
      closePanel(existing, false);
    }
    const record = createPanelWindow(request);
    return validateOutgoingMessage(
      {
        panelId: record.panelId,
        instanceId: record.instanceId,
        status: "opened",
      },
      isOpenPanelResult,
      "panel open result",
    );
  });

  ipcMain.handle(CHANNELS.closePanel, (event, request, ...args) => {
    const sender = assertSender(event);
    if (sender.role === "primary") {
      if (args.length !== 0 || !isClosePanelRequest(request))
        throw new Error("Invalid panel close request");
      const record = panelWindows.get(request.panelId);
      if (!record || record.instanceId !== request.instanceId)
        throw new Error("Timeline window is no longer active");
      closePanel(record);
      return true;
    }
    if (args.length !== 0 || request !== undefined)
      throw new Error("A panel close request takes no arguments");
    closePanel(sender);
    return true;
  });

  ipcMain.handle(CHANNELS.timelineSnapshot, (event, snapshot, ...args) => {
    assertSender(event, "primary");
    if (args.length !== 0 || !isTimelineSnapshot(snapshot))
      throw new Error("Invalid Timeline snapshot");
    if (!isWithinTimelineSnapshotLimit(snapshot))
      throw new Error("Timeline snapshot exceeds the 1 MiB transport limit");
    const record = panelWindows.get("timeline");
    if (!record || record.window.isDestroyed())
      return Object.freeze({ status: "unavailable" });
    if (
      snapshot.projectId !== record.projectId ||
      snapshot.sessionId !== record.sessionId ||
      snapshot.instanceId !== record.instanceId
    )
      throw new Error("Timeline snapshot belongs to a stale window or session");
    record.window.webContents.send(CHANNELS.timelineSnapshot, snapshot);
    return Object.freeze({ status: "sent" });
  });

  ipcMain.handle(CHANNELS.timelineSnapshotRequest, (event, ...args) => {
    const record = assertSender(event, "panel");
    if (args.length !== 0)
      throw new Error("Snapshot request takes no arguments");
    if (!primaryWindow || primaryWindow.isDestroyed())
      throw new Error("Primary editor is unavailable");
    primaryWindow.webContents.send(CHANNELS.timelineSnapshotRequest, {
      panelId: record.panelId,
      projectId: record.projectId,
      sessionId: record.sessionId,
      instanceId: record.instanceId,
    });
    return Object.freeze({ status: "requested" });
  });

  ipcMain.handle(CHANNELS.timelineFrame, (event, frame, ...args) => {
    assertSender(event, "primary");
    if (args.length !== 0 || !isTimelineFrame(frame))
      throw new Error("Invalid Timeline playhead update");
    const record = panelWindows.get("timeline");
    if (!record || record.window.isDestroyed())
      return Object.freeze({ status: "unavailable" });
    if (
      frame.projectId !== record.projectId ||
      frame.sessionId !== record.sessionId ||
      frame.instanceId !== record.instanceId
    )
      throw new Error("Timeline playhead belongs to a stale window or session");
    record.window.webContents.send(CHANNELS.timelineFrame, frame);
    return Object.freeze({ status: "sent" });
  });

  ipcMain.handle(CHANNELS.timelineCommand, (event, command, ...args) => {
    const record = assertSender(event, "panel");
    if (args.length !== 0 || !isTimelineCommand(command))
      throw new Error("Invalid Timeline command");
    if (
      command.panelId !== record.panelId ||
      command.projectId !== record.projectId ||
      command.sessionId !== record.sessionId ||
      command.instanceId !== record.instanceId
    )
      throw new Error("Timeline command belongs to a stale window or session");
    const sequence = Number(
      command.commandId.slice(command.instanceId.length + 1),
    );
    if (sequence !== record.lastCommandSequence + 1) {
      const result = {
        panelId: record.panelId,
        projectId: record.projectId,
        sessionId: record.sessionId,
        instanceId: record.instanceId,
        commandId: command.commandId,
        status: "rejected",
        stateVersion: command.stateVersion,
        message:
          sequence <= record.lastCommandSequence
            ? "Duplicate Timeline command rejected."
            : "Out-of-order Timeline command rejected.",
      };
      if (!isWithinMessageLimit(result))
        throw new Error(
          "Timeline command result exceeds the control-message limit",
        );
      record.window.webContents.send(CHANNELS.timelineCommandResult, result);
      return Object.freeze({
        status:
          sequence <= record.lastCommandSequence ? "duplicate" : "out-of-order",
      });
    }
    record.lastCommandSequence = sequence;
    record.commandIds.add(command.commandId);
    if (!primaryWindow || primaryWindow.isDestroyed() || !primaryRecord)
      throw new Error("Primary editor is unavailable");
    primaryWindow.webContents.send(CHANNELS.timelineCommand, command);
    return Object.freeze({ status: "queued" });
  });

  ipcMain.handle(CHANNELS.timelineCommandResult, (event, result, ...args) => {
    assertSender(event, "primary");
    if (args.length !== 0 || !isTimelineCommandResult(result))
      throw new Error("Invalid Timeline command result");
    if (!isWithinMessageLimit(result))
      throw new Error(
        "Timeline command result exceeds the control-message limit",
      );
    const record = panelWindows.get(result.panelId);
    if (
      !record ||
      record.window.isDestroyed() ||
      record.projectId !== result.projectId ||
      record.sessionId !== result.sessionId ||
      record.instanceId !== result.instanceId ||
      !record.commandIds.has(result.commandId)
    )
      return Object.freeze({ status: "stale" });
    record.commandIds.delete(result.commandId);
    record.window.webContents.send(CHANNELS.timelineCommandResult, result);
    return Object.freeze({ status: "sent" });
  });

  app.on("before-quit", () => {
    shuttingDown = true;
    for (const record of [...panelWindows.values()]) closePanel(record, false);
  });

  return Object.freeze({ createPrimaryWindow });
}

module.exports = { createWindowHost };
