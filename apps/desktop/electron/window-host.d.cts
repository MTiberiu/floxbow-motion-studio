export function createWindowHost(options: {
  app: any;
  BrowserWindow: any;
  ipcMain: any;
  clipboard: { writeText: (value: string) => void };
  shellUrl: string;
  preloadPath: string;
}): Readonly<{ createPrimaryWindow: () => any }>;
