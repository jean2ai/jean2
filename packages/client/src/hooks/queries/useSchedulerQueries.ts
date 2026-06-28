import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Jean2Client, ScheduledJob, CreateScheduledJobInput, UpdateScheduledJobInput } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';

export function useScheduledJobs(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  return useQuery({
    queryKey: workspaceId
      ? queryKeys.scheduledJobs.byWorkspace(workspaceId)
      : ['scheduledJobs', 'workspace', 'none'],
    enabled: !!sdkClient && !!workspaceId,
    queryFn: async (): Promise<ScheduledJob[]> => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      const response = await sdkClient.http.scheduler.list(workspaceId);
      return response.jobs;
    },
    refetchInterval: 60_000,
  });
}

export function useCreateScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateScheduledJobInput) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      const response = await sdkClient.http.scheduler.create(workspaceId, body);
      return response.job;
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}

export function useUpdateScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, updates }: { jobId: string; updates: UpdateScheduledJobInput }) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      const response = await sdkClient.http.scheduler.update(workspaceId, jobId, updates);
      return response.job;
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}

export function useDeleteScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      return sdkClient.http.scheduler.delete(workspaceId, jobId);
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}

export function usePauseScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      const response = await sdkClient.http.scheduler.pause(workspaceId, jobId);
      return response.job;
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}

export function useResumeScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      const response = await sdkClient.http.scheduler.resume(workspaceId, jobId);
      return response.job;
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}

export function useTriggerScheduledJob(
  sdkClient: Jean2Client | null,
  workspaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!sdkClient || !workspaceId) throw new Error('Not connected');
      return sdkClient.http.scheduler.trigger(workspaceId, jobId);
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.byWorkspace(workspaceId) });
      }
    },
  });
}
