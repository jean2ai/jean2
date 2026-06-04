import type { IJean2Platform, PlatformInitConfig } from '../types';
import { VSMessageType } from './vscode-messages';

declare function acquireVsCodeApi(): VSCodeApi;

interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export function createVSCodeAdapter(): IJean2Platform {
  let vscode: VSCodeApi;
  try {
    vscode = acquireVsCodeApi();
  } catch {
    return {
      id: 'vscode',
      capabilities: {
        storage: false, sound: false, themeSync: false,
        windowManagement: false, webviews: false,
        serverManagement: false, updater: false,
        accelerators: false, fileOpen: false,
        terminal: false, workspacePath: false,
        explorer: false, serverSwitching: false,
        multiView: false,
      },
    };
  }

  let initConfig: PlatformInitConfig | null = null;
  const initCallbacks: Array<(config: PlatformInitConfig) => void> = [];

  window.addEventListener('message', (e) => {
    if (e.data?.type === VSMessageType.Init) {
      initConfig = e.data.config as PlatformInitConfig;
      for (const cb of initCallbacks) {
        cb(initConfig);
      }
    }
  });

  // Signal readiness to the extension host so it can send the init config
  vscode.postMessage({ type: VSMessageType.Ready });

  return {
    id: 'vscode',

    capabilities: {
      storage: false,
      sound: false,
      themeSync: true,
      windowManagement: false,
      webviews: false,
      serverManagement: false,
      updater: false,
      accelerators: false,
      fileOpen: true,
      terminal: true,
      workspacePath: true,
      explorer: true,
      serverSwitching: false,
      multiView: false,
    },

    syncTheme: (_mode) => {
      // Theme is unidirectional: extension pushes theme via CSS variables
      // and jean2:init config. Webview does not control VSCode theme.
    },

    openFile: (path) => {
      vscode.postMessage({ type: VSMessageType.OpenFile, path });
      return Promise.resolve();
    },

    openTerminal: (cwd) => {
      vscode.postMessage({ type: VSMessageType.ToggleTerminal, cwd });
      return Promise.resolve();
    },

    showExplorer: () => {
      vscode.postMessage({ type: VSMessageType.ToggleExplorer });
      return Promise.resolve();
    },

    getWorkspacePath: () => Promise.resolve(initConfig?.workspacePath),

    onInit: (cb) => {
      initCallbacks.push(cb);
      if (initConfig) {
        cb(initConfig);
      }
      return () => {
        const idx = initCallbacks.indexOf(cb);
        if (idx >= 0) initCallbacks.splice(idx, 1);
      };
    },
  };
}
