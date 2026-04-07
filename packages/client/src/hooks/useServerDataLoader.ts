import { useEffect, useRef, type RefObject } from 'react';
import { AuthError, type HttpClient } from '@jean2/sdk';
import type { Preconfig, PromptInfo, Workspace, ProviderStatus, Session } from '@jean2/shared';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
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
  serverEpochRef: RefObject<number>;
  httpClient: HttpClient | null;
  clearSwitchingState: () => void;
  setSessions: (sessions: Session[]) => void;
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
}

export function useServerDataLoader({
  apiToken,
  serverUrl,
  reconnectTrigger,
  serverEpochRef,
  httpClient,
  clearSwitchingState,
  setSessions,
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
}: UseServerDataLoaderParams) {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspaceId', activeWorkspace.id);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (!apiToken || !serverUrl || !httpClient) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const localEpoch = serverEpochRef.current;

    setIsLoadingServerData(true);

    Promise.all([
      httpClient.get<{ sessions: Session[] }>('/sessions', { signal }),
      httpClient.get<{ preconfigs: Preconfig[] }>('/preconfigs', { signal }),
      httpClient.get<{ prompts: PromptInfo[] }>('/prompts', { signal }),
      httpClient.get<{ models: ModelInfo[]; defaultModel: string }>('/models', { signal }),
      httpClient.get<{ workspaces: Workspace[] }>('/workspaces', { signal }),
      httpClient.get<{ providers: ProviderStatus[] }>('/providers', { signal }),
    ])
      .then(([sessionsData, preconfigsData, promptsData, modelsData, workspacesData, providersData]) => {
        if (serverEpochRef.current !== localEpoch) return;

        setSessions(sessionsData.sessions || []);
        setPreconfigs(preconfigsData.preconfigs || []);
        setPrompts(promptsData.prompts || []);
        setModels((modelsData.models || []).filter((m: ModelInfo) => m.runtimeStatus?.usable));
        setDefaultModel(modelsData.defaultModel || 'gpt-4o');
        setProviderStatuses(providersData.providers || []);

        const workspaces = workspacesData.workspaces || [];
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
        if (!message.includes('Unauthorized') && !(err instanceof AuthError)) {
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
    serverEpochRef,
    httpClient,
    clearSwitchingState,
    setSessions,
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
  ]);
}
