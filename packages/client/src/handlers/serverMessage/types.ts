import type {
  Session,
  Message,
  Part,
  MessageWithParts,
  ToolPermission,
  ProviderStatus,
} from '@jean2/sdk';
import type { PendingPermissionRequest } from '@/stores/sessionMetaStore';
import type { CompletionRecord } from '@/stores/uiStore';

export type SessionUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelInfo = {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: boolean;
    };
  };
  runtimeStatus: {
    providerSupported: boolean;
    providerConfigured: boolean;
    usable: boolean;
  };
};

export interface PartIndexEntry {
  sessionId: string;
  messageId: string;
  index: number;
}

export interface SessionHandlersContext {
  setSessions: (updater: Session[] | ((prev: Session[]) => Session[])) => void;
  setCurrentSession: (session: Session | null) => void;
  setMessagesBySession: (updater: Record<string, Message[]> | ((prev: Record<string, Message[]>) => Record<string, Message[]>)) => void;
  setPartsBySession: (updater: Record<string, Record<string, Part[]>> | ((prev: Record<string, Record<string, Part[]>>) => Record<string, Record<string, Part[]>>)) => void;
  setSessionUsage: (usage: SessionUsage) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  addStreamingSession: (sessionId: string) => void;
  removeStreamingSession: (sessionId: string) => void;
  addInterruptedSession: (sessionId: string) => void;
  removeInterruptedSession: (sessionId: string) => void;
  setQueuedMessagesForSession: (sessionId: string, messages: import('@jean2/sdk').QueuedMessage[]) => void;
  addQueuedMessage: (sessionId: string, message: import('@jean2/sdk').QueuedMessage) => void;
  removeQueuedMessageById: (sessionId: string, queueId: string) => void;
  clearPendingPermissions: () => void;
  clearQueuedMessages: () => void;
  setCompactionSuccess: (success: boolean) => void;
  setCompletion: (sessionId: string, record: CompletionRecord) => void;
  clearCompletion: (sessionId: string) => void;
  clearAllCompletions: () => void;
  pendingSessionCreateRef: React.MutableRefObject<boolean>;
  sessionAccessTimesRef: React.MutableRefObject<Map<string, number>>;
  partIdIndexRef: React.MutableRefObject<Map<string, PartIndexEntry>>;
  partAppendRafRef: React.MutableRefObject<number | null>;
  pendingPartAppendsRef: React.MutableRefObject<Map<string, string>>;
  lastPartAppendFlushAtRef: React.MutableRefObject<number>;
  partAppendTimeoutRef: React.MutableRefObject<number | null>;
  skipFinishSoundSessionIdsRef: React.MutableRefObject<Set<string>>;
  currentSessionIdRef: React.MutableRefObject<string | null>;
  models: ModelInfo[];
  defaultModel: string;
  interruptedSessions: Set<string>;
  sessionsRef: React.MutableRefObject<Session[]>;
  flushPendingPartAppends: () => void;
  setProviderStatuses: React.Dispatch<React.SetStateAction<ProviderStatus[]>>;
  setPermissions: React.Dispatch<React.SetStateAction<ToolPermission[]>>;
  mergePendingPermissions: (newPermissions: PendingPermissionRequest[]) => void;
  addPendingPermission: (permission: PendingPermissionRequest) => void;
  removePendingPermissionByToolCallId: (toolCallId: string) => void;
  notifiedToolCallIdsRef: React.MutableRefObject<Set<string>>;
  permissionSoundEnabledRef: React.MutableRefObject<boolean>;
  playPermissionSound: () => void;
  chatFinishSoundEnabledRef: React.MutableRefObject<boolean>;
  playChatFinishSound: () => void;
}

export type SessionHandlers = {
  'session.created': (msg: { type: 'session.created'; session: Session }, ctx: SessionHandlersContext) => void;
  'session.resumed': (msg: { type: 'session.resumed'; session: Session; messages?: MessageWithParts[]; usage?: SessionUsage; isRunning?: boolean }, ctx: SessionHandlersContext) => void;
  'session.closed': (msg: { type: 'session.closed'; sessionId: string }, ctx: SessionHandlersContext) => void;
  'session.reopened': (msg: { type: 'session.reopened'; session: Session }, ctx: SessionHandlersContext) => void;
  'session.deleted': (msg: { type: 'session.deleted'; sessionId: string }, ctx: SessionHandlersContext) => void;
  'session.updated': (msg: { type: 'session.updated'; session: Session }, ctx: SessionHandlersContext) => void;
  'session.renamed': (msg: { type: 'session.renamed'; session: Session }, ctx: SessionHandlersContext) => void;
  'session.interrupted': (msg: { type: 'session.interrupted'; sessionId: string; result: { cascadedTo: string[] } }, ctx: SessionHandlersContext) => void;
  'session.reverted': (msg: { type: 'session.reverted'; sessionId: string; revertedTo: { messageId: string; messageCount: number }; removed: { messageIds: string[]; partCount: number } }, ctx: SessionHandlersContext) => void;
  'session.forked': (msg: { type: 'session.forked'; originalSessionId: string; forkedSession: Session; messages: MessageWithParts[] }, ctx: SessionHandlersContext) => void;
  'session.state': (msg: { type: 'session.state'; sessionId: string; messages: MessageWithParts[] }, ctx: SessionHandlersContext) => void;
};

export type MessagePartHandlers = {
  'message.created': (msg: { type: 'message.created'; message: Message }, ctx: SessionHandlersContext) => void;
  'message.updated': (msg: { type: 'message.updated'; message: Message }, ctx: SessionHandlersContext) => void;
  'part.created': (msg: { type: 'part.created'; sessionId: string; part: Part }, ctx: SessionHandlersContext) => void;
  'part.updated': (msg: { type: 'part.updated'; sessionId: string; part: Part }, ctx: SessionHandlersContext) => void;
  'part.append': (msg: { type: 'part.append'; sessionId: string; partId: string; field: 'text' | 'reasoning'; delta: string }, ctx: SessionHandlersContext) => void;
  'chat.usage': (msg: { type: 'chat.usage'; sessionId: string; usage: SessionUsage; model: string }, ctx: SessionHandlersContext) => void;
};

export type PermissionQueueHandlers = {
  'permission.list': (msg: { type: 'permission.list'; workspaceId: string; permissions: ToolPermission[] }, ctx: SessionHandlersContext) => void;
  'permissions.sync': (msg: { type: 'permissions.sync'; approvals: Array<{ sessionId: string; childSessionId?: string; subagentName?: string; toolCallId: string; toolName: string; args: Record<string, unknown>; permissionType: import('@jean2/sdk').PermissionType; permissionKey: string; message: string; details?: Record<string, unknown>; dangerous?: boolean }> }, ctx: SessionHandlersContext) => void;
  'permission.revoked': (msg: { type: 'permission.revoked'; permissionId: string }, ctx: SessionHandlersContext) => void;
  'permission.all_revoked': (msg: { type: 'permission.all_revoked'; workspaceId: string; count: number }, ctx: SessionHandlersContext) => void;
  'permission.request': (msg: { type: 'permission.request'; sessionId: string; childSessionId?: string; subagentName?: string; toolCallId: string; toolName: string; args: Record<string, unknown>; permissionType: import('@jean2/sdk').PermissionType; permissionKey: string; message: string; details?: Record<string, unknown>; dangerous?: boolean }, ctx: SessionHandlersContext) => void;
  'permission.granted': (msg: { type: 'permission.granted'; toolCallId: string; cached: boolean }, ctx: SessionHandlersContext) => void;
  'queue.list': (msg: { type: 'queue.list'; sessionId: string; messages: import('@jean2/sdk').QueuedMessage[] }, ctx: SessionHandlersContext) => void;
  'queue.added': (msg: { type: 'queue.added'; sessionId: string; message: import('@jean2/sdk').QueuedMessage }, ctx: SessionHandlersContext) => void;
  'queue.removed': (msg: { type: 'queue.removed'; sessionId: string; queueId: string }, ctx: SessionHandlersContext) => void;
  'queue.sending': (msg: { type: 'queue.sending'; sessionId: string; queueId: string }, ctx: SessionHandlersContext) => void;
};

export type ProviderHandlers = {
  'provider.status': (msg: { type: 'provider.status'; provider: string; connected: boolean; authorizationUrl?: string; error?: string }, ctx: SessionHandlersContext) => void;
  'provider.connected': (msg: { type: 'provider.connected'; provider: string; connected: boolean; connectedAt?: string; accountId?: string }, ctx: SessionHandlersContext) => void;
};

export type HandlerContext = SessionHandlersContext;
