// Service worker type declarations for vite-plugin-pwa injectManifest mode.

/// <reference lib="webworker" />

declare module 'workbox-precaching' {
  export function precacheAndRoute(entries: unknown[]): void;
  export function cleanupOutdatedCaches(): void;
  export function createHandlerBoundToURL(url: string): (options: unknown) => Promise<Response>;
}

declare module 'workbox-routing' {
  export class NavigationRoute {
    constructor(
      handler: (options: unknown) => Promise<Response>,
      options?: { denylist?: RegExp[]; allowlist?: RegExp[] },
    );
  }
  export function registerRoute(route: NavigationRoute): void;
}

interface ServiceWorkerGlobalScope {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  addEventListener(
    type: 'push',
    listener: (event: PushEvent) => void,
  ): void;
  addEventListener(
    type: 'notificationclick',
    listener: (event: NotificationEvent) => void,
  ): void;
  addEventListener(
    type: 'message',
    listener: (event: ExtendableMessageEvent) => void,
  ): void;
  addEventListener(
    type: 'activate',
    listener: (event: ExtendableEvent) => void,
  ): void;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<readonly Client[]>;
    get(id: string): Promise<Client | undefined>;
    openWindow(url: string): Promise<Client | undefined>;
  };
  registration: ServiceWorkerRegistration;
  location: Location;
}

declare const self: ServiceWorkerGlobalScope;

// Extend the NotificationEvent interface for data access
interface NotificationEvent extends ExtendableEvent {
  notification: Notification & {
    data?: { route?: string };
  };
}

// Extend Client with focus and navigate methods
interface Client {
  id: string;
  url: string;
  visibilityState: 'visible' | 'hidden';
  focused: boolean;
  focus(): Promise<Client>;
  navigate(url: string): Promise<Client>;
}
