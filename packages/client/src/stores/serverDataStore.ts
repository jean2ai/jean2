import { create } from 'zustand';
import type {
  Workspace,
  Preconfig,
  PromptInfo,
  ModelWithStatus,
  ProviderStatus,
} from '@jean2/sdk';

interface ServerDataState {
  serverId: string | null;
  workspaces: Workspace[];
  preconfigs: Preconfig[];
  prompts: PromptInfo[];
  models: ModelWithStatus[];
  defaultModel: string;
  defaultProvider: string;
  providers: ProviderStatus[];
}

interface ServerDataActions {
  hydrate: (serverId: string, data: {
    workspaces: Workspace[];
    preconfigs: Preconfig[];
    prompts: PromptInfo[];
    models: ModelWithStatus[];
    defaultModel: string;
    defaultProvider: string;
    providers: ProviderStatus[];
  }) => void;
  updateModels: (models: ModelWithStatus[], defaultModel: string, defaultProvider: string) => void;
  updatePreconfigs: (preconfigs: Preconfig[]) => void;
  updatePrompts: (prompts: PromptInfo[]) => void;
  updateProviders: (providers: ProviderStatus[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  clearAll: () => void;
}

export const useServerDataStore = create<ServerDataState & ServerDataActions>((set) => ({
  serverId: null,
  workspaces: [],
  preconfigs: [],
  prompts: [],
  models: [],
  defaultModel: 'gpt-4o',
  defaultProvider: 'openai',
  providers: [],

  hydrate: (serverId, data) => set({
    serverId,
    ...data,
  }),

  updateModels: (models, defaultModel, defaultProvider) => set({
    models,
    defaultModel,
    defaultProvider,
  }),

  updatePreconfigs: (preconfigs) => set({ preconfigs }),
  updatePrompts: (prompts) => set({ prompts }),
  updateProviders: (providers) => set({ providers }),
  setWorkspaces: (workspaces) => set({ workspaces }),

  clearAll: () => set({
    serverId: null,
    workspaces: [],
    preconfigs: [],
    prompts: [],
    models: [],
    defaultModel: 'gpt-4o',
    defaultProvider: 'openai',
    providers: [],
  }),
}));
