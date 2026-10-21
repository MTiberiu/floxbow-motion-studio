export function createWindowHost(options: {
  app: any;
  BrowserWindow: any;
  ipcMain: any;
  shellUrl: string;
  preloadPath: string;
}): Readonly<{ createPrimaryWindow: () => any }>;
