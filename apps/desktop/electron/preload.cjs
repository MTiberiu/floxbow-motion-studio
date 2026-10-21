const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "floxBowWindows",
  Object.freeze({
    getContext: () => ipcRenderer.invoke("flox:window:get-context"),
    openPanel: (request) =>
      ipcRenderer.invoke("flox:window:open-panel", request),
    onPanelClosed: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("A panel close listener must be a function");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("flox:window:panel-closed", listener);
      return () =>
        ipcRenderer.removeListener("flox:window:panel-closed", listener);
    },
  }),
);
