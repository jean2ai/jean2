export { version } from './version';

export { Jean2ClientContext } from './context';
export { Jean2ClientProvider } from './provider';

export { useJean2Client } from './hooks/use-client';
export { useConnectionState } from './hooks/use-connection-state';

export { useSessionManager } from './hooks/use-session-manager';
export { useMessageStore } from './hooks/use-message-store';
export { usePermissionTracker } from './hooks/use-permission-tracker';

export { useSession } from './hooks/use-session';
export { useMessages } from './hooks/use-messages';
export { useChat } from './hooks/use-chat';

export type { UseSessionManagerOptions, UseSessionManagerReturn } from './hooks/use-session-manager';
export type { UseMessageStoreOptions, UseMessageStoreReturn } from './hooks/use-message-store';
export type { UsePermissionTrackerOptions, UsePermissionTrackerReturn } from './hooks/use-permission-tracker';
export type { UseSessionReturn } from './hooks/use-session';
export type { UseMessagesReturn } from './hooks/use-messages';
export type { UseChatOptions, UseChatReturn, ChatAttachment } from './hooks/use-chat';
