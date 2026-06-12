import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';
import type { OAuthRedirectStrategy } from '@jean2/sdk';

export function useProvidersQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.providers.all,
    queryFn: () => sdkClient!.http.providers.list(),
    enabled: !!sdkClient,
  });
}

export function useProviderCredentialsQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.providers.credentials,
    queryFn: () => sdkClient!.http.providers.listCredentials(),
    enabled: !!sdkClient,
  });
}

export function useConnectProvider(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, redirectStrategy }: { providerId: string; redirectStrategy?: OAuthRedirectStrategy }) =>
      sdkClient!.http.providers.connect(providerId, { redirectStrategy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.providers.all });
    },
  });
}

export function useDisconnectProvider(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      sdkClient!.http.providers.disconnect(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.providers.all });
    },
  });
}

export function useCompleteOAuth(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { flowId: string; code: string; state: string; redirectUri: string }) =>
      sdkClient!.http.providers.completeOAuth(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.providers.all });
    },
  });
}

export function useSetProviderCredential(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, body }: {
      provider: string;
      body: { apiKey: string };
    }) => sdkClient!.http.providers.setCredential(provider, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.providers.credentials });
    },
  });
}

export function useClearProviderCredential(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      sdkClient!.http.providers.clearCredential(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.providers.credentials });
    },
  });
}
