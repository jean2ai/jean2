import type { IJean2Platform } from '../types';

export function createBrowserAdapter(): IJean2Platform {
  return {
    id: 'web',

    capabilities: {
      storage: false,
      sound: false,
      themeSync: false,
      windowManagement: false,
      webviews: false,
      serverManagement: false,
      updater: false,
      accelerators: false,
      fileOpen: false,
      terminal: false,
      workspacePath: false,
      explorer: false,
      serverSwitching: true,
      multiView: true,
    },
  };
}
