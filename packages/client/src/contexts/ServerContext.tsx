import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';

import {
  getSavedServers,
  saveServer,
  updateServer as updateServerStorage,
  deleteServer,
  getQuickConnections,
  addQuickConnection,
  removeQuickConnection,
  removeQuickConnectionForWorkspace,
  reorderQuickConnections,
} from '@/config/servers';
import type { SavedServer, QuickConnection } from '@jean2/sdk';
import { normalizeServerUrl } from '@/config/auth';

interface ServerContextValue {
  servers: SavedServer[];
  quickConnections: QuickConnection[];
  isHydrated: boolean;

  // Server CRUD actions
  addServer: (name: string, url: string, token: string) => SavedServer;
  editServer: (
    id: string,
    updates: { name?: string; url?: string; token?: string },
  ) => void;
  removeServer: (id: string) => void;

  // Quick connection actions
  addToQuickConnections: (
    serverId: string,
    serverName: string,
    workspaceId?: string,
    workspaceName?: string,
  ) => void;
  removeFromQuickConnections: (id: string) => void;
  removeFromQuickConnectionsByWorkspace: (workspaceId: string) => void;
  reorderQuick: (ids: string[]) => void;
}

export const ServerContext = createContext<ServerContextValue | null>(null);

interface ServerProviderProps {
  children: ReactNode;
}

export const ServerProvider = ({ children }: ServerProviderProps) => {
  const [servers, setServers] = useState<SavedServer[]>([]);
  const [quickConnections, setQuickConnections] = useState<QuickConnection[]>(
    [],
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const loadedServers = getSavedServers();
    const loadedQuickConnections = getQuickConnections();

    setServers(loadedServers);
    setQuickConnections(loadedQuickConnections);
    setIsHydrated(true);
  }, []);

  const addServer = useCallback((name: string, url: string, token: string): SavedServer => {
    const normalizedUrl = normalizeServerUrl(url);

    const newServer: SavedServer = {
      id: crypto.randomUUID(),
      name,
      url: normalizedUrl,
      token,
      createdAt: new Date().toISOString(),
    };

    saveServer(newServer);
    setServers(getSavedServers());

    return newServer;
  }, []);

  const editServer = useCallback((
    id: string,
    updates: { name?: string; url?: string; token?: string },
  ): void => {
    const normalizedUpdates = {
      ...updates,
      ...(updates.url && { url: normalizeServerUrl(updates.url) }),
    };

    updateServerStorage(id, normalizedUpdates);
    setServers(getSavedServers());
  }, []);

  const removeServer = useCallback((id: string): void => {
    deleteServer(id);
    setServers(getSavedServers());
    // Refresh quick connections as they may have been cleaned up
    setQuickConnections(getQuickConnections());
  }, []);

  const addToQuickConnections = useCallback((
    serverId: string,
    serverName: string,
    workspaceId?: string,
    workspaceName?: string,
  ): void => {
    addQuickConnection({
      serverId,
      serverName,
      workspaceId,
      workspaceName,
    });
    setQuickConnections(getQuickConnections());
  }, []);

  const removeFromQuickConnections = useCallback((id: string): void => {
    removeQuickConnection(id);
    setQuickConnections(getQuickConnections());
  }, []);

  const removeFromQuickConnectionsByWorkspace = useCallback((workspaceId: string): void => {
    removeQuickConnectionForWorkspace(workspaceId);
    setQuickConnections(getQuickConnections());
  }, []);

  const reorderQuick = useCallback((ids: string[]): void => {
    reorderQuickConnections(ids);
    setQuickConnections(getQuickConnections());
  }, []);

  const value: ServerContextValue = {
    servers,
    quickConnections,
    isHydrated,
    addServer,
    editServer,
    removeServer,
    addToQuickConnections,
    removeFromQuickConnections,
    removeFromQuickConnectionsByWorkspace,
    reorderQuick,
  };

  return (
    <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
  );
};

export const useServerContext = (): ServerContextValue => {
  const context = useContext(ServerContext);

  if (context === null) {
    throw new Error(
      'useServerContext must be used within a ServerProvider',
    );
  }

  return context;
};
