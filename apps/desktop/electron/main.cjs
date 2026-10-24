const { app, BrowserWindow, ipcMain, clipboard, session } = require("electron");
const path = require("node:path");
const { createWindowHost } = require("./window-host.cjs");

const url = process.env.STUDIO_URL;
if (!url || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url))
  throw new Error("Launch through npm run dev or npm start");

app.commandLine.appendSwitch("site-per-process");
// Play starts in the trusted shell and reaches the sandboxed preview by IPC;
// Chromium otherwise treats that cross-origin preview call as autoplay.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app
  .whenReady()
  .then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);

    const host = createWindowHost({
      app,
      BrowserWindow,
      ipcMain,
      clipboard,
      shellUrl: url,
      preloadPath: path.join(__dirname, "preload.cjs"),
    });
    host.createPrimaryWindow();
  })
  .catch((error) => {
    console.error(
      "Could not initialize the FloxBow desktop window host:",
      error,
    );
    app.exit(1);
  });

app.on("window-all-closed", () => app.quit());
