import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';
import { useServerDataStore } from '@/stores/serverDataStore';

export function useAgentsQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.agents,
    queryFn: () => sdkClient!.http.agents.list(),
    enabled: !!sdkClient,
  });
}

async function syncAgentsToStoreAndCache(sdkClient: Jean2Client, queryClient: ReturnType<typeof useQueryClient>) {
  const data = await sdkClient.http.agents.list();
  useServerDataStore.getState().updateAgents(data.agents);
  queryClient.setQueryData(queryKeys.config.agents, data);
}

export function usePromoteAgent(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sdkClient!.http.agents.promote(id),
    onSuccess: () => {
      if (sdkClient) syncAgentsToStoreAndCache(sdkClient, queryClient);
    },
  });
}

export function useDemoteAgent(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sdkClient!.http.agents.delete(id),
    onSuccess: () => {
      if (sdkClient) syncAgentsToStoreAndCache(sdkClient, queryClient);
    },
  });
}
