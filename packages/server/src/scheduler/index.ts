import { getDueScheduledJobs, advanceScheduledJob, markScheduledJobError } from '@/store/scheduled-jobs';
import { runScheduledJob } from './runner';

const TICK_INTERVAL_MS = 60_000;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function startScheduler(): void {
  if (schedulerInterval) return;
  console.log('[scheduler] Starting scheduler (60s tick interval)');
  schedulerInterval = setInterval(() => {
    tick().catch(err => console.error('[scheduler] tick error:', err));
  }, TICK_INTERVAL_MS);

  // Run an immediate tick on startup to catch jobs that became due while offline
  tick().catch(err => console.error('[scheduler] startup tick error:', err));
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[scheduler] Stopped scheduler');
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    const dueJobs = getDueScheduledJobs(now);
    if (dueJobs.length === 0) return;

    console.log(`[scheduler] ${dueJobs.length} job(s) due`);

    for (const job of dueJobs) {
      // At-most-once: advance nextRunAt BEFORE execution
      // For one-shot jobs or those hitting repeat limit, this marks them completed
      advanceScheduledJob(job.id);

      // Execute the job (fire-and-forget with error capture)
      runScheduledJob(job).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Job '${job.name}' failed:`, message);
        markScheduledJobError(job.id, message);
      });
    }
  } finally {
    ticking = false;
  }
}
