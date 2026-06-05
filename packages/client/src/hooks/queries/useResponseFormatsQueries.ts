import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client, CreateResponseFormatRequest, UpdateResponseFormatRequest } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';

export function useResponseFormatsQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.config.responseFormats,
    queryFn: () => sdkClient!.http.responseFormats.list(),
    enabled: !!sdkClient,
  });
}

export function useCreateResponseFormat(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateResponseFormatRequest) =>
      sdkClient!.http.responseFormats.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.responseFormats });
    },
  });
}

export function useUpdateResponseFormat(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateResponseFormatRequest }) =>
      sdkClient!.http.responseFormats.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.responseFormats });
    },
  });
}

export function useDeleteResponseFormat(sdkClient: Jean2Client | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sdkClient!.http.responseFormats.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.responseFormats });
    },
  });
}
