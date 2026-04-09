import {
  createContext,
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
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
  removeQuickConnectionForWorkspace,
  reorderQuickConnections,
} from '@/config/servers';
import type { SavedServer, QuickConnection } from '@/types/client';
import { normalizeServerUrl } from '@/config/auth';

interface ServerContextValue {
  servers: SavedServer[];
  activeServer: SavedServer | null;
  quickConnections: QuickConnection[];
  isSwitching: boolean;
  isAddingServerRef: React.MutableRefObject<boolean>;

  // Server actions
  prepareForServerAdd: () => void;
  addServer: (name: string, url: string, token?: string) => SavedServer;
  editServer: (
    id: string,
    updates: { name?: string; url?: string; token?: string },
  ) => void;
  removeServer: (id: string) => void;
  switchServer: (id: string) => boolean;
  clearSwitchingState: () => void;

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
  const [activeServer, setActiveServer] = useState<SavedServer | null>(null);
  const [quickConnections, setQuickConnections] = useState<QuickConnection[]>(
    [],
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAddingServerRef = useRef(false);

  useEffect(() => {
    const loadedServers = getSavedServers();
    const loadedActiveServer = getActiveServer();
    const loadedQuickConnections = getQuickConnections();

    setServers(loadedServers);
    setActiveServer(loadedActiveServer);
    setQuickConnections(loadedQuickConnections);
  }, []);

  // Called before addServer to mark that a server is being added
  // so App.tsx can trigger reset logic when activeServer changes
  const prepareForServerAdd = (): void => {
    isAddingServerRef.current = true;
  };

  const addServer = (name: string, url: string, token?: string): SavedServer => {
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

    // Always set the newly added server as active
    setActiveServerId(newServer.id);
    setActiveServer(newServer);

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

  const switchServer = useCallback((id: string): boolean => {
    // Clear any pending switch
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }

    // If already switching to this server, ignore
    if (isSwitching && activeServer?.id === id) {
      return false;
    }

    // If currently switching to a different server, abort and switch to new one
    if (isSwitching) {
      setIsSwitching(false);
    }

    setIsSwitching(true);

    // Debounce the actual switch by 100ms
    switchTimeoutRef.current = setTimeout(() => {
      setActiveServerId(id);
      const newActiveServer = servers.find((s) => s.id === id) || null;
      setActiveServer(newActiveServer);
      setIsSwitching(false);
    }, 100);

    return true;
  }, [isSwitching, activeServer, servers]);

  const clearSwitchingState = useCallback(() => {
    setIsSwitching(false);
  }, []);

  const addToQuickConnections = (
    serverId: string,
    serverName: string,
    workspaceId?: string,
    workspaceName?: string,
  ): void => {
    addQuickConnection({
      serverId,
      name: serverName,
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

  const removeFromQuickConnectionsByWorkspace = (workspaceId: string): void => {
    removeQuickConnectionForWorkspace(workspaceId);
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
    isSwitching,
    isAddingServerRef,
    prepareForServerAdd,
    addServer,
    editServer,
    removeServer,
    switchServer,
    clearSwitchingState,
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
