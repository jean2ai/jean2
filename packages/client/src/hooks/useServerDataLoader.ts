import { useEffect, useRef, type RefObject } from 'react';
import type { Preconfig, PromptInfo, Workspace, ProviderStatus, Session } from '@jean2/shared';

const getApiUrl = (url: string | null) => url ? `http://${url}/api` : null;

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
}

export interface UseServerDataLoaderParams {
  apiToken: string | null;
  serverUrl: string | null;
  reconnectTrigger: number;
  serverEpochRef: RefObject<number>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
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
  fetchWithAuth,
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

  // Persist activeWorkspace to localStorage
  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspaceId', activeWorkspace.id);
    }
  }, [activeWorkspace]);

  // Consolidated effect for fetching sessions, preconfigs, models, and workspaces
  useEffect(() => {
    if (!apiToken || !serverUrl) return;

    // Abort previous requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const apiUrl = getApiUrl(serverUrl);
    if (!apiUrl) return;

    // Capture local epoch to detect stale fetch results
    const localEpoch = serverEpochRef.current;

    // Show loading state
    setIsLoadingServerData(true);

    Promise.all([
      fetchWithAuth(`${apiUrl}/sessions`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/preconfigs`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/prompts`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/models`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/workspaces`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/providers`, { signal }).then(r => r.json()),
    ])
      .then(([sessionsData, preconfigsData, promptsData, modelsData, workspacesData, providersData]) => {
        // Ignore stale results from previous connection epochs
        if (serverEpochRef.current !== localEpoch) return;

        setSessions(sessionsData.sessions || []);
        setPreconfigs(preconfigsData.preconfigs || []);
        setPrompts(promptsData.prompts || []);
        setModels(modelsData.models || []);
        setDefaultModel(modelsData.defaultModel || 'gpt-4o');
        setProviderStatuses(providersData.providers || []);

        // Handle workspace selection
        const workspaces = workspacesData.workspaces || [];
        setWorkspaces(workspaces);

        // Apply pending workspace selection if any
        if (pendingWorkspaceIdRef.current) {
          const saved = workspaces.find((w: Workspace) => w.id === pendingWorkspaceIdRef.current);
          if (saved) setActiveWorkspace(saved);
          pendingWorkspaceIdRef.current = null;
        } else {
          const savedId = localStorage.getItem('activeWorkspaceId');
          const saved = workspaces.find((w: Workspace) => w.id === savedId);
          setActiveWorkspace(saved || workspaces[0]);
        }

        // Clear switching state
        clearSwitchingState();
        setIsLoadingServerData(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          console.log('Fetch aborted due to server switch');
          return;
        }
        console.error('Failed to load server data:', err);
        setIsLoadingServerData(false);
        if (!err.message?.includes('Unauthorized')) {
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
    fetchWithAuth,
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
