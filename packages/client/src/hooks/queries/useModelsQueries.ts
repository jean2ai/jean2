import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client, CreateModelRequest } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';
import { useServerDataStore } from '@/stores/serverDataStore';

interface ModelsConfigResponse {
  providers: Array<{
    id: string;
    name: string;
    models: Array<import('@jean2/sdk').ModelWithStatus>;
  }>;
  defaultModel: string;
  defaultProvider: string;
}

export function useModelsConfigQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.models,
    queryFn: (): Promise<ModelsConfigResponse> =>
      sdkClient!.http.config.models.get(),
    enabled: !!sdkClient,
  });
}

async function syncModelsToStoreAndCache(sdkClient: Jean2Client, queryClient: import('@tanstack/react-query').QueryClient) {
  const data = await sdkClient.http.config.models.get() as ModelsConfigResponse;
  const usableModels = data.providers.flatMap(p => p.models).filter(m => m.runtimeStatus?.usable);
  useServerDataStore.getState().updateModels(usableModels, data.defaultModel, data.defaultProvider);
  queryClient.setQueryData(queryKeys.config.models, data);
}

export function useCreateProvider(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; name: string }) =>
      sdkClient!.http.config.models.createProvider(body),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useUpdateProvider(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, body }: { providerId: string; body: { name: string } }) =>
      sdkClient!.http.config.models.updateProvider(providerId, body),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useDeleteProvider(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      sdkClient!.http.config.models.deleteProvider(providerId),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useCreateModel(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, body }: { providerId: string; body: CreateModelRequest }) =>
      sdkClient!.http.config.models.createModel(providerId, body),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useUpdateModel(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId, body }: {
      providerId: string;
      modelId: string;
      body: Omit<CreateModelRequest, 'id'>;
    }) => sdkClient!.http.config.models.updateModel(providerId, modelId, body),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useDeleteModel(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string }) =>
      sdkClient!.http.config.models.deleteModel(providerId, modelId),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useSetModelDefaults(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { defaultProvider: string; defaultModel: string }) =>
      sdkClient!.http.config.models.setDefaults(body),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useSyncModels(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: 'merge' | 'override') =>
      sdkClient!.http.config.models.sync(mode),
    onSuccess: () => {
      if (sdkClient) syncModelsToStoreAndCache(sdkClient, queryClient);
    },
  });
}
