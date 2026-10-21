const { app, BrowserWindow, session } = require("electron");
const url = process.env.STUDIO_URL;
if (!url || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url))
  throw new Error("Launch through npm run dev or npm start");
app.commandLine.appendSwitch("site-per-process");
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const win = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#10151d",
    title: "AI Motion Studio",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, target) => {
    if (target !== url) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.loadURL(url);
});
app.on("window-all-closed", () => app.quit());
