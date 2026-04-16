import type { Jean2ElectronAPI } from './preload.js';

declare global {
  interface Window {
    __JEAN2_ELECTRON__?: Jean2ElectronAPI;
  }

  var __JEAN2_CREATE_WINDOW__: (() => import('electron').BrowserWindow) | undefined;
}

export {};
