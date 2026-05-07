import { create } from 'zustand';

interface ClientIdentityStore {
  clientId: string | null;
  setClientId: (clientId: string) => void;
  clearClientId: () => void;
}

export const useClientIdentityStore = create<ClientIdentityStore>((set) => ({
  clientId: null,
  setClientId: (clientId) => set({ clientId }),
  clearClientId: () => set({ clientId: null }),
}));
