export type {
  IJean2Platform,
  PlatformCapabilities,
  PlatformInitConfig,
  PlatformStorage,
  PlatformSoundKey,
  PlatformViewBounds,
  UpdaterEvent,
} from './types';

export { platform, hasCapability } from './singleton';
export { useCapability, useStorage, usePlaySound } from './hooks';
