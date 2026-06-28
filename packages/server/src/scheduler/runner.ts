import { randomUUID } from 'crypto';
import type { Preconfig, ScheduledJob } from '@jean2/sdk';
import { createSession, getSession } from '@/store/sessions';
import { getWorkspace } from '@/store/workspaces';
import { markScheduledJobRun, markScheduledJobError } from '@/store/scheduled-jobs';
import { getPreconfig, getDefaultPreconfig } from '@/core/preconfig';
import { getModelsConfig, findModel } from '@/config';
import { executeChildSession } from '@/core/child-session';

function findProviderFromModel(modelId: string): string | null {
  const modelInfo = findModel(modelId);
  return modelInfo?.providerId ?? null;
}

export async function runScheduledJob(job: ScheduledJob): Promise<void> {
  const preconfig = job.preconfigId
    ? await getPreconfig(job.preconfigId)
    : await getDefaultPreconfig();

  if (!preconfig) {
    throw new Error('No preconfig available for scheduled job execution');
  }

  const config = getModelsConfig();
  const workspace = getWorkspace(job.workspaceId);

  const modelId = preconfig.model || config.defaultModel;
  const providerId =
    preconfig.provider ||
    findProviderFromModel(modelId) ||
    config.defaultProvider;

  // Determine whether to reuse an existing session or create a new one
  let sessionId: string;
  let resumeFromHistory = false;

  if (job.reuseSession && job.lastRunSessionId) {
    const existing = getSession(job.lastRunSessionId);
    if (existing && existing.status === 'active') {
      sessionId = existing.id;
      resumeFromHistory = job.includeHistory;
      console.log(`[scheduler] Reusing session ${sessionId} for job '${job.name}' (history: ${resumeFromHistory})`);
    } else {
      sessionId = randomUUID();
      createSession({
        id: sessionId,
        workspaceId: job.workspaceId,
        preconfigId: preconfig.id,
        title: `[Scheduled] ${job.name}`,
        status: 'active',
        metadata: { scheduledJobId: job.id },
        parentId: null,
        agentName: null,
        selectedModel: modelId,
        selectedProvider: providerId,
        selectedVariant: preconfig.variant ?? null,
      });
    }
  } else {
    sessionId = randomUUID();
    createSession({
      id: sessionId,
      workspaceId: job.workspaceId,
      preconfigId: preconfig.id,
      title: `[Scheduled] ${job.name}`,
      status: 'active',
      metadata: { scheduledJobId: job.id },
      parentId: null,
      agentName: null,
      selectedModel: modelId,
      selectedProvider: providerId,
      selectedVariant: preconfig.variant ?? null,
    });
  }

  // Strip the schedule tool to prevent recursive scheduling
  const safePreconfig: Preconfig = {
    ...preconfig,
    tools: (preconfig.tools ?? []).filter(t => t !== 'schedule'),
  };

  console.log(`[scheduler] Running job '${job.name}' in session ${sessionId}`);

  const result = await executeChildSession({
    parentSessionId: sessionId,
    childSessionId: sessionId,
    preconfig: safePreconfig,
    prompt: job.prompt,
    workspacePath: workspace?.path || undefined,
    workspaceId: job.workspaceId,
    modelId,
    providerId,
    resumeFromHistory,
  });

  markScheduledJobRun(job.id, sessionId);

  if (result.error) {
    markScheduledJobError(job.id, result.error);
  }
}
