import type { Hono } from 'hono';
import type { CreateScheduledJobInput, UpdateScheduledJobInput, AutoApproveSeverity } from '@jean2/sdk';
import {
  createScheduledJob,
  getScheduledJob,
  listScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
} from '@/store/scheduled-jobs';
import { getWorkspace } from '@/store/workspaces';
import { runScheduledJob } from '@/scheduler/runner';
import { NotFoundError, BadRequestError } from '@/utils/http-errors';

export function registerSchedulerRoutes(app: Hono): void {
  app.get('/api/workspaces/:workspaceId/scheduled-jobs', async (c) => {
    const workspaceId = c.req.param('workspaceId');
    const jobs = listScheduledJobs(workspaceId);
    return c.json({ jobs });
  });

  app.get('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const job = getScheduledJob(jobId);
    if (!job) {
      throw new NotFoundError('Scheduled job not found');
    }
    return c.json({ job });
  });

  app.post('/api/workspaces/:workspaceId/scheduled-jobs', async (c) => {
    const workspaceId = c.req.param('workspaceId');
    const body = await c.req.json().catch(() => ({})) as Partial<CreateScheduledJobInput>;

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      throw new BadRequestError('Name is required');
    }
    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      throw new BadRequestError('Prompt is required');
    }
    if (!body.scheduleKind || !body.scheduleConfig) {
      throw new BadRequestError('scheduleKind and scheduleConfig are required');
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    if (body.autoApproveSeverity !== undefined && body.autoApproveSeverity !== null) {
      const validSeverities: AutoApproveSeverity[] = ['off', 'none', 'low', 'medium', 'high'];
      if (!validSeverities.includes(body.autoApproveSeverity)) {
        throw new BadRequestError('autoApproveSeverity must be a valid severity level');
      }
    }

    const job = createScheduledJob(workspaceId, {
      name: body.name.trim(),
      prompt: body.prompt.trim(),
      scheduleKind: body.scheduleKind,
      scheduleConfig: body.scheduleConfig,
      repeatLimit: body.repeatLimit ?? null,
      preconfigId: body.preconfigId ?? null,
      originSessionId: body.originSessionId ?? null,
      reuseSession: body.reuseSession ?? false,
      includeHistory: body.includeHistory ?? false,
      autoApproveSeverity: body.autoApproveSeverity ?? null,
    });
    return c.json({ job }, 201);
  });

  app.patch('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const body = await c.req.json().catch(() => ({})) as UpdateScheduledJobInput;
    const updated = updateScheduledJob(jobId, body);
    if (!updated) {
      throw new NotFoundError('Scheduled job not found');
    }
    return c.json({ job: updated });
  });

  app.delete('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const deleted = deleteScheduledJob(jobId);
    if (!deleted) {
      throw new NotFoundError('Scheduled job not found');
    }
    return c.json({ success: true });
  });

  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/pause', async (c) => {
    const jobId = c.req.param('jobId');
    const updated = updateScheduledJob(jobId, { state: 'paused' });
    if (!updated) {
      throw new NotFoundError('Scheduled job not found');
    }
    return c.json({ job: updated });
  });

  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/resume', async (c) => {
    const jobId = c.req.param('jobId');
    const updated = updateScheduledJob(jobId, { state: 'active' });
    if (!updated) {
      throw new NotFoundError('Scheduled job not found');
    }
    return c.json({ job: updated });
  });

  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/trigger', async (c) => {
    const jobId = c.req.param('jobId');
    const job = getScheduledJob(jobId);
    if (!job) {
      throw new NotFoundError('Scheduled job not found');
    }

    runScheduledJob(job).catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Manual trigger of '${job.name}' failed:`, message);
    });

    return c.json({ success: true, message: 'Job triggered' });
  });
}
