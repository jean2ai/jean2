import { useEffect, useRef } from 'react';
import type { Jean2Client, ToolPermission, ProviderStatus } from '@jean2/sdk';

export interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UseEventSideEffectsParams {
  clientRef: React.RefObject<Jean2Client | null>;
  currentSessionIdRef: React.RefObject<string | null>;
  notifiedToolCallIdsRef: React.RefObject<Set<string>>;
  skipFinishSoundSessionIdsRef: React.RefObject<Set<string>>;
  permissionSoundEnabledRef: React.RefObject<boolean>;
  chatFinishSoundEnabledRef: React.RefObject<boolean>;
  playChatFinishSound: () => void;
  playPermissionSound: () => void;
  setSessionUsage: (usage: SessionUsage) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  setCompactionSuccess: (success: boolean) => void;
  setCompletion: (sessionId: string, record: { type: 'flash-only' | 'flash-then-sticky'; flashStartedAt: number }) => void;
  clearCompletion: (sessionId: string) => void;
  clearAllCompletions: () => void;
  setProviderStatuses: React.Dispatch<React.SetStateAction<ProviderStatus[]>>;
  setPermissions: React.Dispatch<React.SetStateAction<ToolPermission[]>>;
  addInterruptedSession: (id: string) => void;
  removeInterruptedSession: (id: string) => void;
  models: Array<{ id: string; variants?: Record<string, unknown> }>;
  defaultModel: string;
  sessions: Array<{ id: string; parentId?: string | null }>;
}

export function useEventSideEffects({
  clientRef,
  currentSessionIdRef,
  notifiedToolCallIdsRef,
  skipFinishSoundSessionIdsRef,
  permissionSoundEnabledRef,
  chatFinishSoundEnabledRef,
  playChatFinishSound,
  playPermissionSound,
  setSessionUsage,
  setCurrentModel,
  setSelectedVariant,
  setCompactionSuccess,
  setCompletion,
  clearCompletion,
  clearAllCompletions,
  setProviderStatuses,
  setPermissions,
  addInterruptedSession,
  removeInterruptedSession,
  models,
  defaultModel,
  sessions,
}: UseEventSideEffectsParams): void {
  const sessionsRef = useRef(sessions);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-subscriptions
  sessionsRef.current = sessions;
  const modelsRef = useRef(models);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-subscriptions
  modelsRef.current = models;
  const defaultModelRef = useRef(defaultModel);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-subscriptions
  defaultModelRef.current = defaultModel;

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const handlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

    const clientForHandlers = client;
    function add(event: string, handler: (...args: unknown[]) => void) {
      clientForHandlers.on(event as never, handler as never);
      handlers.push({ event, handler });
    }

    // Chat finish sound & completion state
    add('message.updated', (...args) => {
      const [message] = args as [import('@jean2/sdk').Message];

      if (message.role === 'assistant' && 'status' in message && message.status === 'completed') {
        const session = sessionsRef.current.find(s => s.id === message.sessionId);
        const isTopLevel = session?.parentId === null;

        if (isTopLevel) {
          if (chatFinishSoundEnabledRef.current && !skipFinishSoundSessionIdsRef.current.has(message.sessionId)) {
            playChatFinishSound();
          }
          setCompletion(message.sessionId, { type: 'flash-only', flashStartedAt: Date.now() });
        }
      }
    });

    // Permission sound
    add('permission.request', (...args) => {
      const [sessionId, , , toolCallId] = args as [string, string | undefined, string | undefined, string];

      const session = sessionsRef.current.find(s => s.id === sessionId);
      if (session?.parentId === null && permissionSoundEnabledRef.current && !notifiedToolCallIdsRef.current.has(toolCallId)) {
        playPermissionSound();
        notifiedToolCallIdsRef.current.add(toolCallId);
      }
    });

    // Chat usage
    add('chat.usage', (...args) => {
      const [sessionId, usage, model] = args as [string, SessionUsage, string];

      if (sessionId === currentSessionIdRef.current) {
        setSessionUsage(usage);
        setCurrentModel(model || defaultModelRef.current);
      }
    });

    // Session resumed - restore model/variant state
    add('session.resumed', (...args) => {
      const [session, , usage] = args as [import('@jean2/sdk').Session, unknown, SessionUsage | undefined];

      removeInterruptedSession(session.id);
      clearCompletion(session.id);

      if (session.id === currentSessionIdRef.current) {
        setSessionUsage(usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

        const restoredModelId = session.selectedModel || defaultModelRef.current;
        setCurrentModel(restoredModelId);

        const restoredVariants = modelsRef.current.find(m => m.id === restoredModelId)?.variants;
        if (session.selectedVariant && restoredVariants && !restoredVariants[session.selectedVariant]) {
          setSelectedVariant(null);
        } else {
          setSelectedVariant(session.selectedVariant ?? null);
        }
      }
    });

    // Session interrupted
    add('session.interrupted', (...args) => {
      const [sessionId] = args as [string];

      addInterruptedSession(sessionId);
      skipFinishSoundSessionIdsRef.current.add(sessionId);
    });

    // Compaction complete
    add('compaction.complete', (...args) => {
      const [sessionId] = args as [string, { prompt: number; completion: number }];

      if (sessionId === currentSessionIdRef.current) {
        setCompactionSuccess(true);
      }
    });

    // Provider status
    add('provider.status', (...args) => {
      const [provider, connected, authorizationUrl, error] = args as [string, boolean, string | undefined, string | undefined];

      setProviderStatuses(prev => {
        const existing = prev.find(s => s.provider === provider);
        if (existing) {
          return prev.map(s => s.provider === provider
            ? { ...s, connected, authorizationUrl, error }
            : s
          );
        }
        return [...prev, { provider, connected, authorizationUrl, error }];
      });
    });

    add('provider.connected', (...args) => {
      const [provider, connected, connectedAt, accountId] = args as [string, boolean, string | undefined, string | undefined];

      setProviderStatuses(prev =>
        prev.map(s => s.provider === provider
          ? { ...s, connected, connectedAt, accountId }
          : s
        )
      );
    });

    // Permission list
    add('permission.list', (...args) => {
      const [, permissions] = args as [string, ToolPermission[]];

      setPermissions(permissions);
    });

    // Permission revoked
    add('permission.revoked', (...args) => {
      const [permissionId] = args as [string];

      setPermissions(prev => prev.map(p =>
        p.id === permissionId ? { ...p, revokedAt: new Date().toISOString() } : p
      ));
    });

    // All permissions revoked
    add('permission.all_revoked', () => {
      const now = new Date().toISOString();
      setPermissions(prev => prev.map(p => ({ ...p, revokedAt: now })));
    });

    return () => {
      for (const { event, handler } of handlers) {
        clientForHandlers.off(event as never, handler as never);
      }
    };
  }, [
    currentSessionIdRef,
    notifiedToolCallIdsRef,
    skipFinishSoundSessionIdsRef,
    permissionSoundEnabledRef,
    chatFinishSoundEnabledRef,
    playChatFinishSound,
    playPermissionSound,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    setCompactionSuccess,
    setCompletion,
    clearCompletion,
    clearAllCompletions,
    setProviderStatuses,
    setPermissions,
    addInterruptedSession,
    removeInterruptedSession,
  ]);
}
