// packages/client/src/config/servers.ts

import type { SavedServer, QuickConnection } from '@jean2/shared';

const STORAGE_KEYS = {
  SERVERS: 'jean2_servers',
  ACTIVE_SERVER_ID: 'jean2_active_server_id',
  QUICK_CONNECTIONS: 'jean2_quick_connections',
} as const;

/**
 * Get all saved servers from localStorage
 */
export function getSavedServers(): SavedServer[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SERVERS);
    if (!data) {
      return [];
    }
    return JSON.parse(data) as SavedServer[];
  } catch (error) {
    console.error('Error reading saved servers from localStorage:', error);
    return [];
  }
}

/**
 * Get a specific server by ID
 */
export function getServerById(id: string): SavedServer | null {
  const servers = getSavedServers();
  return servers.find((server) => server.id === id) || null;
}

/**
 * Save a new server to localStorage
 * Adds to existing array
 */
export function saveServer(server: SavedServer): void {
  try {
    const servers = getSavedServers();
    servers.push(server);
    localStorage.setItem(STORAGE_KEYS.SERVERS, JSON.stringify(servers));
  } catch (error) {
    console.error('Error saving server to localStorage:', error);
  }
}

/**
 * Update an existing server
 * Merges updates with existing server data
 */
export function updateServer(
  id: string,
  updates: Partial<Omit<SavedServer, 'id' | 'createdAt'>>,
): void {
  try {
    const servers = getSavedServers();
    const index = servers.findIndex((server) => server.id === id);

    if (index === -1) {
      console.error('Server not found:', id);
      return;
    }

    servers[index] = { ...servers[index], ...updates };
    localStorage.setItem(STORAGE_KEYS.SERVERS, JSON.stringify(servers));
  } catch (error) {
    console.error('Error updating server in localStorage:', error);
  }
}

/**
 * Delete a server by ID
 * Also removes related quick connections
 */
export function deleteServer(id: string): void {
  try {
    const servers = getSavedServers();
    const filtered = servers.filter((server) => server.id !== id);
    localStorage.setItem(STORAGE_KEYS.SERVERS, JSON.stringify(filtered));

    // Also remove related quick connections
    const quickConnections = getQuickConnections();
    const filteredConnections = quickConnections.filter(
      (conn) => conn.serverId !== id,
    );
    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(filteredConnections),
    );

    // Clear active server if it was deleted
    const activeId = getActiveServerId();
    if (activeId === id) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SERVER_ID);
    }
  } catch (error) {
    console.error('Error deleting server from localStorage:', error);
  }
}

/**
 * Get the active server ID from localStorage
 */
export function getActiveServerId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVER_ID);
  } catch (error) {
    console.error('Error reading active server ID from localStorage:', error);
    return null;
  }
}

/**
 * Set the active server ID in localStorage
 */
export function setActiveServerId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SERVER_ID, id);
  } catch (error) {
    console.error('Error setting active server ID in localStorage:', error);
  }
}

/**
 * Get the active server object
 * Convenience function that returns full server data
 */
export function getActiveServer(): SavedServer | null {
  const activeId = getActiveServerId();
  if (!activeId) {
    return null;
  }
  return getServerById(activeId);
}

/**
 * Get all quick connections from localStorage
 */
export function getQuickConnections(): QuickConnection[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.QUICK_CONNECTIONS);
    if (!data) {
      return [];
    }
    return JSON.parse(data) as QuickConnection[];
  } catch (error) {
    console.error(
      'Error reading quick connections from localStorage:',
      error,
    );
    return [];
  }
}

/**
 * Add a new quick connection
 * Auto-generates ID and sets order to next available
 */
export function addQuickConnection(
  conn: Omit<QuickConnection, 'id' | 'order'>,
): QuickConnection {
  const connections = getQuickConnections();

  // Find max order
  const maxOrder = connections.reduce(
    (max, c) => Math.max(max, c.order),
    -1,
  );

  const newConnection: QuickConnection = {
    ...conn,
    id: crypto.randomUUID(),
    order: maxOrder + 1,
  };

  connections.push(newConnection);

  try {
    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(connections),
    );
  } catch (error) {
    console.error(
      'Error saving quick connection to localStorage:',
      error,
    );
  }

  return newConnection;
}

/**
 * Remove a quick connection by ID
 */
export function removeQuickConnection(id: string): void {
  try {
    const connections = getQuickConnections();
    const filtered = connections.filter((conn) => conn.id !== id);
    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(filtered),
    );
  } catch (error) {
    console.error(
      'Error removing quick connection from localStorage:',
      error,
    );
  }
}

/**
 * Remove all quick connections for a specific workspace
 * Used when deleting a workspace
 */
export function removeQuickConnectionForWorkspace(workspaceId: string): void {
  try {
    const connections = getQuickConnections();
    const filtered = connections.filter((conn) => conn.workspaceId !== workspaceId);
    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(filtered),
    );
  } catch (error) {
    console.error(
      'Error removing quick connections for workspace from localStorage:',
      error,
    );
  }
}

/**
 * Update an existing quick connection
 */
export function updateQuickConnection(
  id: string,
  updates: Partial<QuickConnection>,
): void {
  try {
    const connections = getQuickConnections();
    const index = connections.findIndex((conn) => conn.id === id);

    if (index === -1) {
      console.error('Quick connection not found:', id);
      return;
    }

    connections[index] = { ...connections[index], ...updates };
    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(connections),
    );
  } catch (error) {
    console.error(
      'Error updating quick connection in localStorage:',
      error,
    );
  }
}

/**
 * Reorder quick connections based on array position
 * Updates order field based on the index in the provided array
 */
export function reorderQuickConnections(ids: string[]): void {
  try {
    const connections = getQuickConnections();

    // Create a map for quick lookup
    const connectionMap = new Map(connections.map((c) => [c.id, c]));

    // Update order based on array position
    ids.forEach((id, index) => {
      const conn = connectionMap.get(id);
      if (conn) {
        conn.order = index;
      }
    });

    localStorage.setItem(
      STORAGE_KEYS.QUICK_CONNECTIONS,
      JSON.stringify(connections),
    );
  } catch (error) {
    console.error(
      'Error reordering quick connections in localStorage:',
      error,
    );
  }
}
