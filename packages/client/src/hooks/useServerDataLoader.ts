import { useEffect, useRef, type RefObject } from 'react';
import { AuthError } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import type { Preconfig, PromptInfo, Workspace, ProviderStatus, Session } from '@jean2/sdk';

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
  clientRef: RefObject<Jean2Client | null>;
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
  clientRef,
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
    const sdkClient = clientRef.current;
    if (!apiToken || !serverUrl || !sdkClient) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const localEpoch = serverEpochRef.current;

    setIsLoadingServerData(true);

    sdkClient.http.loadAll({ signal })
      .then((data) => {
        if (serverEpochRef.current !== localEpoch) return;

        setSessions(data.sessions);
        setPreconfigs(data.preconfigs);
        setPrompts(data.prompts);
        setModels((data.models || []).filter((m) => m.runtimeStatus?.usable) as ModelInfo[]);
        setDefaultModel(data.defaultModel || 'gpt-4o');
        setProviderStatuses(data.providers);

        const workspaces = data.workspaces;
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
    clientRef,
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
