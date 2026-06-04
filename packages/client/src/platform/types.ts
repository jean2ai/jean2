export interface PlatformCapabilities {
  storage: boolean;
  sound: boolean;
  themeSync: boolean;
  windowManagement: boolean;
  webviews: boolean;
  serverManagement: boolean;
  updater: boolean;
  accelerators: boolean;
  fileOpen: boolean;
  terminal: boolean;
  workspacePath: boolean;
  explorer: boolean;
  serverSwitching: boolean;
  multiView: boolean;
}

export interface PlatformInitConfig {
  serverUrl: string;
  token?: string;
  workspacePath?: string;
  theme?: 'dark' | 'light' | 'system';
}

export interface PlatformStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PlatformViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlatformSoundKey = 'chatFinish' | 'chatPermission';

export interface UpdaterEvent {
  type: string;
  data?: unknown;
}

export interface IJean2Platform {
  readonly id: string;
  readonly capabilities: PlatformCapabilities;

  storage?: PlatformStorage;
  playSound?: (key: PlatformSoundKey) => Promise<void>;
  syncTheme?: (mode: 'dark' | 'light' | 'system') => void;
  onAccelerator?: (cb: (action: string) => void) => () => void;
  createWindow?: () => Promise<void>;
  createWebview?: (url: string, bounds: PlatformViewBounds) => Promise<string>;
  removeWebview?: (id: string) => Promise<void>;
  resizeWebview?: (id: string, bounds: PlatformViewBounds) => Promise<void>;
  onWebviewMessage?: (cb: (viewId: string, data: unknown) => void) => () => void;
  onUpdaterEvent?: (cb: (event: UpdaterEvent) => void) => () => void;
  checkForUpdates?: () => Promise<void>;
  getAppVersion?: () => Promise<string>;
  getServerStatus?: () => Promise<{ running: boolean; port: number }>;
  startServer?: () => Promise<number>;
  stopServer?: () => Promise<void>;
  getWorkspacePath?: () => Promise<string | undefined>;
  openFile?: (path: string) => Promise<void>;
  openTerminal?: (cwd?: string) => Promise<void>;
  showExplorer?: () => Promise<void>;
  onInit?: (cb: (config: PlatformInitConfig) => void) => () => void;
}
