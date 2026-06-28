import type { HttpClient } from '../transport/http';
import type {
  ScheduledJob,
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
} from '../shared';

export interface ListScheduledJobsResponse {
  jobs: ScheduledJob[];
}

export interface GetScheduledJobResponse {
  job: ScheduledJob;
}

export class SchedulerRestNamespace {
  constructor(private http: HttpClient) {}

  async list(workspaceId: string, options?: { signal?: AbortSignal }): Promise<ListScheduledJobsResponse> {
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs`, {
      signal: options?.signal,
    });
  }

  async get(workspaceId: string, jobId: string, options?: { signal?: AbortSignal }): Promise<GetScheduledJobResponse> {
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}`, {
      signal: options?.signal,
    });
  }

  async create(
    workspaceId: string,
    body: CreateScheduledJobInput,
    options?: { signal?: AbortSignal },
  ): Promise<GetScheduledJobResponse> {
    return this.http.post(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs`, body, {
      signal: options?.signal,
    });
  }

  async update(
    workspaceId: string,
    jobId: string,
    body: UpdateScheduledJobInput,
    options?: { signal?: AbortSignal },
  ): Promise<GetScheduledJobResponse> {
    return this.http.patch(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}`, body, {
      signal: options?.signal,
    });
  }

  async delete(workspaceId: string, jobId: string, options?: { signal?: AbortSignal }): Promise<{ success: boolean }> {
    return this.http.delete(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}`, {
      signal: options?.signal,
    });
  }

  async pause(workspaceId: string, jobId: string, options?: { signal?: AbortSignal }): Promise<GetScheduledJobResponse> {
    return this.http.post(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}/pause`, undefined, {
      signal: options?.signal,
    });
  }

  async resume(workspaceId: string, jobId: string, options?: { signal?: AbortSignal }): Promise<GetScheduledJobResponse> {
    return this.http.post(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}/resume`, undefined, {
      signal: options?.signal,
    });
  }

  async trigger(workspaceId: string, jobId: string, options?: { signal?: AbortSignal }): Promise<{ success: boolean; message: string }> {
    return this.http.post(`/workspaces/${encodeURIComponent(workspaceId)}/scheduled-jobs/${encodeURIComponent(jobId)}/trigger`, undefined, {
      signal: options?.signal,
    });
  }
}
