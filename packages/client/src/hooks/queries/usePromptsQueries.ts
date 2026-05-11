import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client, CreatePromptRequest, UpdatePromptRequest } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';
import { useServerDataStore } from '@/stores/serverDataStore';

export function usePromptsQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.prompts,
    queryFn: () => sdkClient!.http.config.prompts.list(),
    enabled: !!sdkClient,
  });
}

async function syncPromptsToStoreAndCache(sdkClient: Jean2Client, queryClient: import('@tanstack/react-query').QueryClient) {
  const data = await sdkClient.http.config.prompts.list();
  useServerDataStore.getState().updatePrompts(data.prompts);
  queryClient.setQueryData(queryKeys.config.prompts, data);
}

export function useCreatePrompt(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePromptRequest) =>
      sdkClient!.http.config.prompts.create(body),
    onSuccess: () => {
      if (sdkClient) syncPromptsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useUpdatePrompt(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: UpdatePromptRequest }) =>
      sdkClient!.http.config.prompts.update(name, body),
    onSuccess: () => {
      if (sdkClient) syncPromptsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useDeletePrompt(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      sdkClient!.http.config.prompts.delete(name),
    onSuccess: () => {
      if (sdkClient) syncPromptsToStoreAndCache(sdkClient, queryClient);
    },
  });
}
