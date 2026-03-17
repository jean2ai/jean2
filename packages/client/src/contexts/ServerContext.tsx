import {
  createContext,
  useState,
  useEffect,
  useContext,
  type ReactNode,
} from 'react';

import {
  getSavedServers,
  saveServer,
  updateServer,
  deleteServer,
  setActiveServerId,
  getActiveServer,
  getQuickConnections,
  addQuickConnection,
  removeQuickConnection,
  reorderQuickConnections,
} from '@/config/servers';
import type { SavedServer, QuickConnection } from '@jean2/shared';
import { normalizeServerUrl } from '@/config/auth';

interface ServerContextValue {
  servers: SavedServer[];
  activeServer: SavedServer | null;
  quickConnections: QuickConnection[];

  // Server actions
  addServer: (name: string, url: string, token: string) => SavedServer;
  editServer: (
    id: string,
    updates: { name?: string; url?: string; token?: string },
  ) => void;
  removeServer: (id: string) => void;
  switchServer: (id: string) => void;

  // Quick connection actions
  addToQuickConnections: (
    serverId: string,
    serverName: string,
    workspaceId?: string,
    workspaceName?: string,
  ) => void;
  removeFromQuickConnections: (id: string) => void;
  reorderQuick: (ids: string[]) => void;
}

export const ServerContext = createContext<ServerContextValue | null>(null);

interface ServerProviderProps {
  children: ReactNode;
}

export const ServerProvider = ({ children }: ServerProviderProps) => {
  const [servers, setServers] = useState<SavedServer[]>([]);
  const [activeServer, setActiveServer] = useState<SavedServer | null>(null);
  const [quickConnections, setQuickConnections] = useState<QuickConnection[]>(
    [],
  );

  useEffect(() => {
    const loadedServers = getSavedServers();
    const loadedActiveServer = getActiveServer();
    const loadedQuickConnections = getQuickConnections();

    setServers(loadedServers);
    setActiveServer(loadedActiveServer);
    setQuickConnections(loadedQuickConnections);
  }, []);

  const addServer = (name: string, url: string, token: string): SavedServer => {
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

    // If this is the first server, set it as active
    if (servers.length === 0) {
      setActiveServerId(newServer.id);
      setActiveServer(newServer);
    }

    return newServer;
  };

  const editServer = (
    id: string,
    updates: { name?: string; url?: string; token?: string },
  ): void => {
    const normalizedUpdates = {
      ...updates,
      ...(updates.url && { url: normalizeServerUrl(updates.url) }),
    };

    updateServer(id, normalizedUpdates);
    setServers(getSavedServers());

    // Update active server if it's the one being edited
    if (activeServer?.id === id) {
      setActiveServer(getActiveServer());
    }
  };

  const removeServer = (id: string): void => {
    const wasActive = activeServer?.id === id;

    deleteServer(id);
    setServers(getSavedServers());

    if (wasActive) {
      const remainingServers = getSavedServers();
      const newActiveServer = remainingServers.length > 0
        ? remainingServers[0]
        : null;

      if (newActiveServer) {
        setActiveServerId(newActiveServer.id);
        setActiveServer(newActiveServer);
      } else {
        setActiveServer(null);
      }
    }

    // Refresh quick connections as they may have been cleaned up
    setQuickConnections(getQuickConnections());
  };

  const switchServer = (id: string): void => {
    setActiveServerId(id);
    const newActiveServer = getServerByIdFromList(id);
    setActiveServer(newActiveServer);
  };

  const getServerByIdFromList = (id: string): SavedServer | null => {
    return servers.find((s) => s.id === id) || null;
  };

  const addToQuickConnections = (
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
  };

  const removeFromQuickConnections = (id: string): void => {
    removeQuickConnection(id);
    setQuickConnections(getQuickConnections());
  };

  const reorderQuick = (ids: string[]): void => {
    reorderQuickConnections(ids);
    setQuickConnections(getQuickConnections());
  };

  const value: ServerContextValue = {
    servers,
    activeServer,
    quickConnections,
    addServer,
    editServer,
    removeServer,
    switchServer,
    addToQuickConnections,
    removeFromQuickConnections,
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
