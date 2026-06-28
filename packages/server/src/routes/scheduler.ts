import type { Hono } from 'hono';
import type { CreateScheduledJobInput, UpdateScheduledJobInput } from '@jean2/sdk';
import {
  createScheduledJob,
  getScheduledJob,
  listScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
} from '@/store/scheduled-jobs';
import { getWorkspace } from '@/store/workspaces';
import { runScheduledJob } from '@/scheduler/runner';

export function registerSchedulerRoutes(app: Hono): void {
  // GET /api/workspaces/:workspaceId/scheduled-jobs - List all jobs in a workspace
  app.get('/api/workspaces/:workspaceId/scheduled-jobs', async (c) => {
    const workspaceId = c.req.param('workspaceId');
    try {
      const jobs = listScheduledJobs(workspaceId);
      return c.json({ jobs });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list scheduled jobs', message }, 500);
    }
  });

  // GET /api/workspaces/:workspaceId/scheduled-jobs/:jobId - Get a specific job
  app.get('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    try {
      const job = getScheduledJob(jobId);
      if (!job) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }
      return c.json({ job });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get scheduled job', message }, 500);
    }
  });

  // POST /api/workspaces/:workspaceId/scheduled-jobs - Create a new job
  app.post('/api/workspaces/:workspaceId/scheduled-jobs', async (c) => {
    const workspaceId = c.req.param('workspaceId');
    const body = await c.req.json().catch(() => ({})) as Partial<CreateScheduledJobInput>;

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return c.json({ error: 'Bad Request', message: 'Name is required' }, 400);
    }
    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      return c.json({ error: 'Bad Request', message: 'Prompt is required' }, 400);
    }
    if (!body.scheduleKind || !body.scheduleConfig) {
      return c.json({ error: 'Bad Request', message: 'scheduleKind and scheduleConfig are required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
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
      });
      return c.json({ job }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create scheduled job', message }, 500);
    }
  });

  // PATCH /api/workspaces/:workspaceId/scheduled-jobs/:jobId - Update a job
  app.patch('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const body = await c.req.json().catch(() => ({})) as UpdateScheduledJobInput;

    try {
      const updated = updateScheduledJob(jobId, body);
      if (!updated) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }
      return c.json({ job: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update scheduled job', message }, 500);
    }
  });

  // DELETE /api/workspaces/:workspaceId/scheduled-jobs/:jobId - Delete a job
  app.delete('/api/workspaces/:workspaceId/scheduled-jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    try {
      const deleted = deleteScheduledJob(jobId);
      if (!deleted) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete scheduled job', message }, 500);
    }
  });

  // POST /api/workspaces/:workspaceId/scheduled-jobs/:jobId/pause - Pause a job
  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/pause', async (c) => {
    const jobId = c.req.param('jobId');
    try {
      const updated = updateScheduledJob(jobId, { state: 'paused' });
      if (!updated) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }
      return c.json({ job: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to pause scheduled job', message }, 500);
    }
  });

  // POST /api/workspaces/:workspaceId/scheduled-jobs/:jobId/resume - Resume a job
  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/resume', async (c) => {
    const jobId = c.req.param('jobId');
    try {
      const updated = updateScheduledJob(jobId, { state: 'active' });
      if (!updated) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }
      return c.json({ job: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to resume scheduled job', message }, 500);
    }
  });

  // POST /api/workspaces/:workspaceId/scheduled-jobs/:jobId/trigger - Trigger a job immediately
  app.post('/api/workspaces/:workspaceId/scheduled-jobs/:jobId/trigger', async (c) => {
    const jobId = c.req.param('jobId');
    try {
      const job = getScheduledJob(jobId);
      if (!job) {
        return c.json({ error: 'Not Found', message: 'Scheduled job not found' }, 404);
      }

      // Fire-and-forget execution
      runScheduledJob(job).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Manual trigger of '${job.name}' failed:`, message);
      });

      return c.json({ success: true, message: 'Job triggered' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to trigger scheduled job', message }, 500);
    }
  });
}
