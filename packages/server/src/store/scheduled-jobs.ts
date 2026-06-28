import { randomUUID } from 'crypto';
import type {
  ScheduledJob,
  ScheduledJobState,
  ScheduleConfig,
  ScheduleKind,
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
} from '@jean2/sdk';
import { getDatabase } from './index';
import { computeNextRun, scheduleDisplay } from './schedule-utils';

interface ScheduledJobRow {
  id: string;
  workspace_id: string;
  name: string;
  prompt: string;
  schedule_kind: string;
  schedule_config: string;
  schedule_display: string;
  state: string;
  repeat_limit: number | null;
  run_count: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_run_session_id: string | null;
  last_error: string | null;
  reuse_session: number;
  include_history: number;
  preconfig_id: string | null;
  origin_session_id: string | null;
  created_at: number;
  updated_at: number;
}

function rowToScheduledJob(row: ScheduledJobRow): ScheduledJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    prompt: row.prompt,
    scheduleKind: row.schedule_kind as ScheduleKind,
    scheduleConfig: JSON.parse(row.schedule_config) as ScheduleConfig,
    scheduleDisplay: row.schedule_display,
    state: row.state as ScheduledJobState,
    repeatLimit: row.repeat_limit,
    runCount: row.run_count,
    nextRunAt: row.next_run_at !== null ? new Date(row.next_run_at).toISOString() : null,
    lastRunAt: row.last_run_at !== null ? new Date(row.last_run_at).toISOString() : null,
    lastRunSessionId: row.last_run_session_id,
    lastError: row.last_error,
    reuseSession: row.reuse_session === 1,
    includeHistory: row.include_history === 1,
    preconfigId: row.preconfig_id,
    originSessionId: row.origin_session_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function createScheduledJob(
  workspaceId: string,
  input: CreateScheduledJobInput,
): ScheduledJob {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();
  const display = scheduleDisplay(input.scheduleConfig);
  const nextRun = computeNextRun(input.scheduleConfig, now);

  db.run(
    `INSERT INTO scheduled_jobs
      (id, workspace_id, name, prompt, schedule_kind, schedule_config, schedule_display, state, repeat_limit, run_count, next_run_at, last_run_at, last_run_session_id, last_error, reuse_session, include_history, preconfig_id, origin_session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      input.name,
      input.prompt,
      input.scheduleKind,
      JSON.stringify(input.scheduleConfig),
      display,
      input.repeatLimit ?? null,
      nextRun,
      input.reuseSession ? 1 : 0,
      input.includeHistory ? 1 : 0,
      input.preconfigId ?? null,
      input.originSessionId ?? null,
      now,
      now,
    ],
  );

  return getScheduledJob(id)!;
}

export function getScheduledJob(id: string): ScheduledJob | null {
  const db = getDatabase();
  const row = db
    .query('SELECT * FROM scheduled_jobs WHERE id = ?')
    .get(id) as ScheduledJobRow | undefined;
  return row ? rowToScheduledJob(row) : null;
}

export function listScheduledJobs(workspaceId: string): ScheduledJob[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM scheduled_jobs WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(workspaceId) as ScheduledJobRow[];
  return rows.map(rowToScheduledJob);
}

export function updateScheduledJob(
  id: string,
  updates: UpdateScheduledJobInput,
): ScheduledJob | null {
  const db = getDatabase();
  const existing = getScheduledJob(id);
  if (!existing) return null;

  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.prompt !== undefined) {
    setClauses.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.preconfigId !== undefined) {
    setClauses.push('preconfig_id = ?');
    values.push(updates.preconfigId);
  }
  if (updates.repeatLimit !== undefined) {
    setClauses.push('repeat_limit = ?');
    values.push(updates.repeatLimit);
  }
  if (updates.reuseSession !== undefined) {
    setClauses.push('reuse_session = ?');
    values.push(updates.reuseSession ? 1 : 0);
  }
  if (updates.includeHistory !== undefined) {
    setClauses.push('include_history = ?');
    values.push(updates.includeHistory ? 1 : 0);
  }
  if (updates.state !== undefined) {
    setClauses.push('state = ?');
    values.push(updates.state);
  }

  // Handle schedule changes
  const scheduleChanged =
    updates.scheduleKind !== undefined || updates.scheduleConfig !== undefined;
  if (scheduleChanged) {
    const kind = updates.scheduleKind ?? existing.scheduleKind;
    const config = updates.scheduleConfig ?? existing.scheduleConfig;
    const display = scheduleDisplay(config);
    setClauses.push('schedule_kind = ?', 'schedule_config = ?', 'schedule_display = ?');
    values.push(kind, JSON.stringify(config), display);

    // Recompute next run if the job is active and not paused
    if ((updates.state ?? existing.state) === 'active') {
      const nextRun = computeNextRun(config, now);
      setClauses.push('next_run_at = ?');
      values.push(nextRun);
    }
  } else if (updates.state === 'active' && existing.state === 'paused') {
    // Resuming a paused job: recompute next run
    const nextRun = computeNextRun(existing.scheduleConfig, now);
    setClauses.push('next_run_at = ?');
    values.push(nextRun);
  }

  if (updates.state === 'paused') {
    setClauses.push('next_run_at = ?');
    values.push(null);
  }

  values.push(id);
  db.run(`UPDATE scheduled_jobs SET ${setClauses.join(', ')} WHERE id = ?`, values);

  return getScheduledJob(id);
}

export function deleteScheduledJob(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM scheduled_jobs WHERE id = ?', [id]);
  return result.changes > 0;
}

export function deleteScheduledJobsByWorkspace(workspaceId: string): number {
  const db = getDatabase();
  const result = db.run('DELETE FROM scheduled_jobs WHERE workspace_id = ?', [workspaceId]);
  return result.changes;
}

export function getDueScheduledJobs(now: number): ScheduledJob[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT * FROM scheduled_jobs
       WHERE state = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
    )
    .all(now) as ScheduledJobRow[];
  return rows.map(rowToScheduledJob);
}

export function markScheduledJobRun(id: string, sessionId: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.run(
    `UPDATE scheduled_jobs
     SET run_count = run_count + 1, last_run_at = ?, last_run_session_id = ?, last_error = NULL, updated_at = ?
     WHERE id = ?`,
    [now, sessionId, now, id],
  );
}

export function markScheduledJobError(id: string, error: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.run(
    `UPDATE scheduled_jobs SET last_error = ?, updated_at = ? WHERE id = ?`,
    [error, now, id],
  );
}

export function advanceScheduledJob(id: string): void {
  const db = getDatabase();
  const job = getScheduledJob(id);
  if (!job) return;

  const nextRun = computeNextRun(job.scheduleConfig, Date.now());
  const now = Date.now();

  if (job.scheduleKind === 'once' || (job.repeatLimit !== null && job.runCount + 1 >= job.repeatLimit)) {
    db.run(
      `UPDATE scheduled_jobs SET state = 'completed', next_run_at = NULL, updated_at = ? WHERE id = ?`,
      [now, id],
    );
  } else {
    db.run(
      `UPDATE scheduled_jobs SET next_run_at = ?, updated_at = ? WHERE id = ?`,
      [nextRun, now, id],
    );
  }
}

export function markScheduledJobCompleted(id: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.run(
    `UPDATE scheduled_jobs SET state = 'completed', next_run_at = NULL, updated_at = ? WHERE id = ?`,
    [now, id],
  );
}
