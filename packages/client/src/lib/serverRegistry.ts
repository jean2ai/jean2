import { getSavedServers } from '@/config/servers';
import type { SavedServer } from '@jean2/sdk';

export interface ServerRegistry {
  getServer: (id: string) => SavedServer | undefined;
  getServers: () => SavedServer[];
}

export const serverRegistry: ServerRegistry = {
  getServer: (id) => getSavedServers().find(s => s.id === id),
  getServers: () => getSavedServers(),
};
