import { useEffect, useRef, type RefObject } from 'react';
import type { Jean2Client, SessionManager } from '@jean2/sdk';
import type { Preconfig, PromptInfo, Workspace, ProviderStatus, Session } from '@jean2/sdk';

export interface ModelInfo {
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
      file?: string[];
    };
  };
  runtimeStatus: {
    providerSupported: boolean;
    providerConfigured: boolean;
    usable: boolean;
  };
}

export interface UseServerDataLoaderParams {
  apiToken: string | null;
  serverUrl: string | null;
  reconnectTrigger: number;
  clientRef: RefObject<Jean2Client | null>;
  clearSwitchingState: () => void;
  loadSessions: (sessions: Session[]) => void;
  setPreconfigs: (preconfigs: Preconfig[]) => void;
  setPrompts: (prompts: PromptInfo[]) => void;
  setModels: (models: ModelInfo[]) => void;
  setDefaultModel: (model: string) => void;
  setProviderStatuses: (statuses: ProviderStatus[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  activeWorkspace: Workspace | null;
  setIsLoadingServerData: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
  pendingWorkspaceIdRef: RefObject<string | null>;
  sessionManager: SessionManager | null;
}

export function useServerDataLoader({
  apiToken,
  serverUrl,
  reconnectTrigger,
  clientRef,
  clearSwitchingState,
  loadSessions,
  setPreconfigs,
  setPrompts,
  setModels,
  setDefaultModel,
  setProviderStatuses,
  setWorkspaces,
  setActiveWorkspace,
  activeWorkspace,
  setIsLoadingServerData,
  setAuthError,
  pendingWorkspaceIdRef,
  sessionManager,
}: UseServerDataLoaderParams) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionManagerRef = useRef(sessionManager);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-runs
  sessionManagerRef.current = sessionManager;
  const loadSessionsRef = useRef(loadSessions);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-runs
  loadSessionsRef.current = loadSessions;

  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspaceId', activeWorkspace.id);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    const http = clientRef.current?.http;
    if (!apiToken || !serverUrl || !http || !sessionManagerRef.current) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoadingServerData(true);

    http.loadAll({ signal })
      .then((data) => {
        loadSessionsRef.current(data.sessions || []);
        setPreconfigs(data.preconfigs || []);
        setPrompts(data.prompts || []);
        setModels((data.models || []).filter((m) => m.runtimeStatus?.usable));
        setDefaultModel(data.defaultModel || 'gpt-4o');
        setProviderStatuses(data.providers || []);

        const workspaces = data.workspaces || [];
        setWorkspaces(workspaces);

        if (pendingWorkspaceIdRef.current) {
          const saved = workspaces.find((w: Workspace) => w.id === pendingWorkspaceIdRef.current);
          if (saved) setActiveWorkspace(saved);
          pendingWorkspaceIdRef.current = null;
        } else {
          const savedId = localStorage.getItem('activeWorkspaceId');
          const saved = workspaces.find((w: Workspace) => w.id === savedId);
          setActiveWorkspace(saved || workspaces[0]);
        }

        clearSwitchingState();
        setIsLoadingServerData(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log('Fetch aborted due to server switch');
          return;
        }
        console.error('Failed to load server data:', err);
        setIsLoadingServerData(false);
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('Unauthorized')) {
          setAuthError('Failed to connect to server');
        }
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [
    apiToken,
    serverUrl,
    reconnectTrigger,
    clientRef,
    clearSwitchingState,
    setPreconfigs,
    setPrompts,
    setModels,
    setDefaultModel,
    setProviderStatuses,
    setWorkspaces,
    setActiveWorkspace,
    setIsLoadingServerData,
    setAuthError,
    pendingWorkspaceIdRef,
    sessionManager,
  ]);
}
