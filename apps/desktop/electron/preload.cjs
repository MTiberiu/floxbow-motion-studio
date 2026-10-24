const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "floxBowWindows",
  Object.freeze({
    getContext: () => ipcRenderer.invoke("flox:window:get-context"),
    captureCanvas: (rect) =>
      ipcRenderer.invoke("flox:visual-inspection:capture-canvas", rect),
    copyVisualContext: (text) =>
      ipcRenderer.invoke("flox:visual-inspection:copy-context", text),
    copyStoryboardContext: (text) =>
      ipcRenderer.invoke("flox:storyboard:copy-context", text),
    openPanel: (request) =>
      ipcRenderer.invoke("flox:window:open-panel", request),
    closePanel: (request) =>
      request === undefined
        ? ipcRenderer.invoke("flox:window:close-panel")
        : ipcRenderer.invoke("flox:window:close-panel", request),
    onPanelClosed: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("A panel close listener must be a function");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("flox:window:panel-closed", listener);
      return () =>
        ipcRenderer.removeListener("flox:window:panel-closed", listener);
    },
    publishTimelineSnapshot: (snapshot) =>
      ipcRenderer.invoke("flox:timeline:snapshot", snapshot),
    publishTimelineFrame: (frame) =>
      ipcRenderer.invoke("flox:timeline:frame", frame),
    requestTimelineSnapshot: () =>
      ipcRenderer.invoke("flox:timeline:snapshot-request"),
    sendTimelineCommand: (command) =>
      ipcRenderer.invoke("flox:timeline:command", command),
    sendTimelineCommandResult: (result) =>
      ipcRenderer.invoke("flox:timeline:command-result", result),
    onTimelineSnapshot: (callback) =>
      subscribe("flox:timeline:snapshot", callback),
    onTimelineFrame: (callback) => subscribe("flox:timeline:frame", callback),
    onTimelineSnapshotRequest: (callback) =>
      subscribe("flox:timeline:snapshot-request", callback),
    onTimelineCommand: (callback) =>
      subscribe("flox:timeline:command", callback),
    onTimelineCommandResult: (callback) =>
      subscribe("flox:timeline:command-result", callback),
  }),
);

function subscribe(channel, callback) {
  if (typeof callback !== "function")
    throw new TypeError("A Timeline listener must be a function");
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
