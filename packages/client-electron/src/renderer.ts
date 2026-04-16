// This file is a placeholder that redirects to the React client
// In production, the React client from ../client/dist/ is loaded
// In development, Vite serves the React client from http://localhost:5173

// The main Electron window loads either:
// - Production: file:// path to ../client/dist/index.html
// - Development: http://localhost:5173 (proxied from client dev server)

// This entry point is only used for the Vite dev server when running `vite` alone
// The actual electron entry point is main.ts

import { app, BrowserWindow, shell } from 'electron';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV !== 'production';

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 500,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: 'preload.js' as never, // Will be replaced by vite-plugin-electron
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  // Load the client
  if (isDev) {
    window.loadURL('http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    const clientPath = app.isPackaged
      ? `file://${process.resourcesPath}/client/dist/index.html`
      : `file://${__dirname}/../client/dist/index.html`;
    window.loadURL(clientPath);
  }

  // Handle external links
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return window;
}

app.on('ready', () => {
  mainWindow = createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});
