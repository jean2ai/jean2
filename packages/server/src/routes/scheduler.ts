import type { Hono } from 'hono';
import { validate } from './validate';
import {
  createScheduledJob,
  getScheduledJob,
  listScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
} from '@/store/scheduled-jobs';
import { getWorkspace } from '@/store/workspaces';
import { runScheduledJob } from '@/scheduler/runner';
import { NotFoundError } from '@/utils/http-errors';
import { createScheduledJobSchema, updateScheduledJobSchema } from './schemas';

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

  app.post(
    '/api/workspaces/:workspaceId/scheduled-jobs',
    validate('json', createScheduledJobSchema),
    async (c) => {
      const workspaceId = c.req.param('workspaceId');
      const body = c.req.valid('json');

      const workspace = getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const job = createScheduledJob(workspaceId, {
        name: body.name.trim(),
        prompt: body.prompt.trim(),
        scheduleKind: body.scheduleKind as 'once' | 'interval' | 'daily' | 'weekly',
        scheduleConfig: body.scheduleConfig as unknown as Parameters<typeof createScheduledJob>[1]['scheduleConfig'],
        repeatLimit: body.repeatLimit ?? null,
        preconfigId: body.preconfigId ?? null,
        originSessionId: body.originSessionId ?? null,
        reuseSession: body.reuseSession ?? false,
        includeHistory: body.includeHistory ?? false,
        autoApproveSeverity: body.autoApproveSeverity ?? null,
        notificationsEnabled: body.notificationsEnabled ?? false,
      });
      return c.json({ job }, 201);
    },
  );

  app.patch(
    '/api/workspaces/:workspaceId/scheduled-jobs/:jobId',
    validate('json', updateScheduledJobSchema),
    async (c) => {
      const jobId = c.req.param('jobId');
      const body = c.req.valid('json');
      const updated = updateScheduledJob(jobId, body as unknown as Parameters<typeof updateScheduledJob>[1]);
      if (!updated) {
        throw new NotFoundError('Scheduled job not found');
      }
      return c.json({ job: updated });
    },
  );

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
