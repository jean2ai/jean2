import type { ScheduleConfig, ScheduleKind, ScheduledJob, PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';
import { computeNextRun, scheduleDisplay } from '@/store/schedule-utils';
import {
  createScheduledJob,
  getScheduledJob,
  listScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
} from '@/store/scheduled-jobs';
import { runScheduledJob } from '@/scheduler/runner';

export const schedulerToolDefinition = {
  name: 'scheduler',
  description: `Manage scheduled tasks for the current workspace. Create recurring or one-shot automated tasks that run as agent sessions on a schedule. Each run creates a new session (or reuses one) with the given prompt.

Actions:
- "create": Create a new scheduled job. Requires name, prompt, and schedule.
- "list": List all scheduled jobs in the workspace.
- "update": Update an existing job by ID. All fields optional except jobId.
- "pause": Pause a job (stops scheduling, keeps the job).
- "resume": Resume a paused job.
- "trigger": Run a job immediately (does not affect the schedule).
- "remove": Permanently delete a job.

Schedule types (convert the user's natural language to these):
- { type: "once", runAt: "2025-01-15T14:30:00.000Z" } — one-shot at an ISO timestamp
- { type: "interval", intervalMinutes: 120 } — recurring every N minutes
- { type: "daily", time: "09:00" } — daily at a specific time (HH:mm, server timezone)
- { type: "weekly", days: [1,2,3,4,5], time: "17:00" } — on specific weekdays (0=Sun, 1=Mon, ..., 6=Sat) at a time

Examples:
- "every 2 hours" → { type: "interval", intervalMinutes: 120 }
- "daily at 9am" → { type: "daily", time: "09:00" }
- "every weekday at 5pm" → { type: "weekly", days: [1,2,3,4,5], time: "17:00" }
- "in 30 minutes" → { type: "once", runAt: "<ISO timestamp 30 min from now>" }

The prompt should be self-contained — it is the full instruction given to the agent for each run.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['create', 'list', 'update', 'pause', 'resume', 'trigger', 'remove'],
        description: 'The action to perform.',
      },
      jobId: {
        type: 'string' as const,
        description: 'Job ID (for update/pause/resume/trigger/remove actions). Use "list" to find job IDs.',
      },
      name: {
        type: 'string' as const,
        description: 'Friendly name for the job (create/update).',
      },
      prompt: {
        type: 'string' as const,
        description: 'The task instruction to run on each execution (create/update). Must be self-contained.',
      },
      schedule: {
        type: 'object' as const,
        description: 'Schedule configuration (create/update). See tool description for format.',
        properties: {
          type: {
            type: 'string' as const,
            enum: ['once', 'interval', 'daily', 'weekly'],
          },
          runAt: { type: 'string' as const, description: 'ISO timestamp (for type: "once")' },
          intervalMinutes: { type: 'number' as const, description: 'Minutes between runs (for type: "interval")' },
          time: { type: 'string' as const, description: 'HH:mm time (for type: "daily" or "weekly")' },
          days: {
            type: 'array' as const,
            items: { type: 'number' as const },
            description: 'Weekdays 0-6 (0=Sun) for type: "weekly"',
          },
        },
      },
      repeatLimit: {
        type: 'number' as const,
        description: 'Maximum number of runs. Omit for infinite. (create/update)',
      },
      reuseSession: {
        type: 'boolean' as const,
        description: 'If true, all runs accumulate in the same session. If false (default), each run creates a new session.',
      },
      includeHistory: {
        type: 'boolean' as const,
        description: 'When reuseSession is true, whether the agent sees previous run history. Default false.',
      },
      autoApproveSeverity: {
        type: 'string' as const,
        enum: ['off', 'none', 'low', 'medium', 'high'],
        description: 'Auto-approve severity for sessions created by this job. Omit or null to use workspace default.',
      },
    },
    required: ['action'],
  },
  timeout: 10000,
};

export interface SchedulerToolResult {
  success: boolean;
  action: string;
  title: string;
  job?: ScheduledJob;
  jobs?: ScheduledJob[];
  jobId?: string;
  error?: string;
}

export async function executeSchedulerTool(
  input: Record<string, unknown>,
  workspaceId: string,
  currentSessionId: string,
  permissionRisk: PermissionRiskLevel,
  askFn?: (ask: PermissionAsk) => Promise<unknown>,
): Promise<SchedulerToolResult> {
  const action = input.action as string;

  // "list" is read-only, no permission needed
  if (action !== 'list' && permissionRisk !== 'none' && askFn) {
    const actionLabel: Record<string, string> = {
      create: 'create',
      update: 'update',
      pause: 'pause',
      resume: 'resume',
      trigger: 'trigger',
      remove: 'delete',
    };
    const verb = actionLabel[action] || action;
    const name = (input.name as string) || (input.jobId as string) || '';
    const ask: PermissionAsk = {
      type: 'permission',
      question: name
        ? `Allow scheduler to ${verb} scheduled job "${name.slice(0, 80)}"?`
        : `Allow scheduler to ${verb} a scheduled job?`,
      description: `Tool: scheduler\nAction: ${verb}${name ? `\nJob: ${name.slice(0, 200)}` : ''}`,
      risk: permissionRisk,
      resource: 'scheduler',
      action: verb,
    };

    console.log(`[scheduler-tool] Requesting permission for "${verb}"...`);
    const approved = await askFn(ask);

    if (!approved) {
      return { success: false, action, title: 'Permission denied', error: 'USER_REJECTION' };
    }
  }

  let result: SchedulerToolResult;
  try {
    switch (action) {
    case 'create':
      result = executeCreate(input, workspaceId, currentSessionId);
      break;
    case 'list':
      result = executeList(workspaceId);
      break;
    case 'update':
      result = executeUpdate(input);
      break;
    case 'pause':
      result = executeStateChange(input, 'paused');
      break;
    case 'resume':
      result = executeStateChange(input, 'active');
      break;
    case 'trigger':
      result = executeTrigger(input);
      break;
    case 'remove':
      result = executeRemove(input);
      break;
    default:
      result = { success: false, action, title: 'Invalid action', error: `Unknown action: ${action}` };
    }
  } catch (err) {
    console.error(`[scheduler-tool] Action "${action}" failed:`, err);
    return { success: false, action, title: 'Internal error', error: err instanceof Error ? err.message : String(err) };
  }
  return result;
}

function parseSchedule(raw: Record<string, unknown>): { kind: ScheduleKind; config: ScheduleConfig } | { error: string } {
  const type = raw.type as string;
  if (!type) return { error: 'Schedule type is required' };

  switch (type) {
    case 'once': {
      const runAt = raw.runAt as string;
      if (!runAt) return { error: 'runAt (ISO timestamp) is required for type "once"' };
      const ts = new Date(runAt).getTime();
      if (!Number.isFinite(ts)) return { error: `Invalid runAt timestamp: ${runAt}` };
      return { kind: 'once', config: { type: 'once', runAt: new Date(ts).toISOString() } };
    }
    case 'interval': {
      const minutes = raw.intervalMinutes as number;
      if (!minutes || minutes < 1) return { error: 'intervalMinutes must be a positive number' };
      return { kind: 'interval', config: { type: 'interval', intervalMinutes: minutes } };
    }
    case 'daily': {
      const time = raw.time as string;
      if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be in HH:mm format for type "daily"' };
      return { kind: 'daily', config: { type: 'daily', time } };
    }
    case 'weekly': {
      const time = raw.time as string;
      const days = raw.days as number[];
      if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be in HH:mm format for type "weekly"' };
      if (!Array.isArray(days) || days.length === 0) return { error: 'days array is required for type "weekly"' };
      const validDays = days.filter(d => typeof d === 'number' && d >= 0 && d <= 6);
      if (validDays.length === 0) return { error: 'days must contain valid weekday numbers (0-6)' };
      return { kind: 'weekly', config: { type: 'weekly', days: validDays, time } };
    }
    default:
      return { error: `Unknown schedule type: ${type}` };
  }
}

function executeCreate(
  input: Record<string, unknown>,
  workspaceId: string,
  currentSessionId: string,
): SchedulerToolResult {
  const name = input.name as string;
  const prompt = input.prompt as string;
  const rawSchedule = input.schedule as Record<string, unknown>;

  console.log(`[scheduler-tool] executeCreate: name="${name}" workspaceId="${workspaceId}"`);

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return { success: false, action: 'create', title: 'Validation error', error: 'name is required' };
  }
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return { success: false, action: 'create', title: 'Validation error', error: 'prompt is required' };
  }
  if (!rawSchedule || typeof rawSchedule !== 'object') {
    return { success: false, action: 'create', title: 'Validation error', error: 'schedule is required' };
  }

  const parsed = parseSchedule(rawSchedule);
  if ('error' in parsed) {
    console.log(`[scheduler-tool] parseSchedule error: ${parsed.error}`);
    return { success: false, action: 'create', title: 'Validation error', error: parsed.error };
  }

  console.log(`[scheduler-tool] Creating job in DB...`);
  const job = createScheduledJob(workspaceId, {
    name: name.trim(),
    prompt: prompt.trim(),
    scheduleKind: parsed.kind,
    scheduleConfig: parsed.config,
    repeatLimit: input.repeatLimit as number | null | undefined,
    reuseSession: input.reuseSession as boolean | undefined,
    includeHistory: input.includeHistory as boolean | undefined,
    originSessionId: currentSessionId,
    autoApproveSeverity: input.autoApproveSeverity as ScheduledJob['autoApproveSeverity'],
  });
  console.log(`[scheduler-tool] Job created: id=${job.id} state=${job.state} nextRunAt=${job.nextRunAt}`);

  return {
    success: true,
    action: 'create',
    title: `Scheduled job "${job.name}" created`,
    job,
  };
}

function executeList(workspaceId: string): SchedulerToolResult {
  const jobs = listScheduledJobs(workspaceId);
  return {
    success: true,
    action: 'list',
    title: `${jobs.length} scheduled job${jobs.length === 1 ? '' : 's'}`,
    jobs,
  };
}

function executeUpdate(input: Record<string, unknown>): SchedulerToolResult {
  const jobId = input.jobId as string;
  if (!jobId) return { success: false, action: 'update', title: 'Validation error', error: 'jobId is required' };

  const existing = getScheduledJob(jobId);
  if (!existing) return { success: false, action: 'update', title: 'Not found', error: `Job ${jobId} not found` };

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.prompt !== undefined) updates.prompt = input.prompt;
  if (input.repeatLimit !== undefined) updates.repeatLimit = input.repeatLimit;
  if (input.reuseSession !== undefined) updates.reuseSession = input.reuseSession;
  if (input.includeHistory !== undefined) updates.includeHistory = input.includeHistory;
  if (input.autoApproveSeverity !== undefined) updates.autoApproveSeverity = input.autoApproveSeverity;

  if (input.schedule) {
    const parsed = parseSchedule(input.schedule as Record<string, unknown>);
    if ('error' in parsed) {
      return { success: false, action: 'update', title: 'Validation error', error: parsed.error };
    }
    updates.scheduleKind = parsed.kind;
    updates.scheduleConfig = parsed.config;
  }

  const job = updateScheduledJob(jobId, updates);
  if (!job) {
    return { success: false, action: 'update', title: 'Update failed', error: 'Failed to update job' };
  }

  return {
    success: true,
    action: 'update',
    title: `Scheduled job "${job.name}" updated`,
    job,
  };
}

function executeStateChange(
  input: Record<string, unknown>,
  state: 'active' | 'paused',
): SchedulerToolResult {
  const jobId = input.jobId as string;
  if (!jobId) return { success: false, action: input.action as string, title: 'Validation error', error: 'jobId is required' };

  const existing = getScheduledJob(jobId);
  if (!existing) return { success: false, action: input.action as string, title: 'Not found', error: `Job ${jobId} not found` };

  const job = updateScheduledJob(jobId, { state });
  return {
    success: true,
    action: input.action as string,
    title: `Job "${existing.name}" ${state === 'paused' ? 'paused' : 'resumed'}`,
    job: job ?? undefined,
  };
}

function executeTrigger(input: Record<string, unknown>): SchedulerToolResult {
  const jobId = input.jobId as string;
  if (!jobId) return { success: false, action: 'trigger', title: 'Validation error', error: 'jobId is required' };

  const job = getScheduledJob(jobId);
  if (!job) return { success: false, action: 'trigger', title: 'Not found', error: `Job ${jobId} not found` };

  // Fire-and-forget
  runScheduledJob(job).catch(err => {
    console.error(`[scheduler-tool] Trigger of '${job.name}' failed:`, err);
  });

  return {
    success: true,
    action: 'trigger',
    title: `Job "${job.name}" triggered`,
    jobId,
  };
}

function executeRemove(input: Record<string, unknown>): SchedulerToolResult {
  const jobId = input.jobId as string;
  if (!jobId) return { success: false, action: 'remove', title: 'Validation error', error: 'jobId is required' };

  const existing = getScheduledJob(jobId);
  if (!existing) return { success: false, action: 'remove', title: 'Not found', error: `Job ${jobId} not found` };

  deleteScheduledJob(jobId);
  return {
    success: true,
    action: 'remove',
    title: `Job "${existing.name}" deleted`,
    jobId,
  };
}

// Suppress unused import warnings - these are used by the store layer
void computeNextRun;
void scheduleDisplay;
