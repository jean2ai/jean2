import type { GoalState } from '@jean2/sdk';
import { getSession, updateSession } from '@/store';
import { broadcastSessionUpdated } from './broadcast';
import { evaluateGoal, buildContinuationMessage } from './goal-evaluator';
import type { BroadcastFn, BroadcastSessionFn } from './broadcast';

/**
 * Helper: update goal state on session metadata and broadcast the change.
 */
function updateGoalState(
  sessionId: string,
  updates: Partial<GoalState>,
  broadcastSessionUpdatedFn?: BroadcastSessionFn,
): void {
  const session = getSession(sessionId);
  if (!session) return;

  const metadata = session.metadata ?? {};
  const existingGoal = metadata.goal as GoalState | undefined;
  if (!existingGoal) return;

  const updatedGoal = { ...existingGoal, ...updates };
  const updatedMetadata = { ...metadata, goal: updatedGoal };

  updateSession(sessionId, { metadata: updatedMetadata });

  const updated = getSession(sessionId);
  if (updated) {
    if (broadcastSessionUpdatedFn) {
      broadcastSessionUpdatedFn(updated);
    } else {
      broadcastSessionUpdated(updated);
    }
  }
}

/**
 * Run a single chat turn. This is a callback provided by the caller
 * (message-router.ts) that wraps runSingleChatTurn.
 */
export type RunTurnFn = (content: string) => Promise<{ streamCompleted: boolean; interrupted: boolean }>;

/**
 * Execute the goal loop: work → evaluate → continue or stop.
 *
 * The agent is unaware it's in a goal loop — it just receives continuation
 * messages and keeps working. The evaluator decides when the goal is met.
 */
export async function runGoalLoop(options: {
  sessionId: string;
  condition: string;
  initialPrompt?: string;
  maxTurns?: number;
  abortSignal?: AbortSignal;
  broadcast?: BroadcastFn;
  broadcastSessionCreated?: BroadcastSessionFn;
  broadcastSessionUpdated?: BroadcastSessionFn;
  runTurn: RunTurnFn;
}): Promise<void> {
  const maxTurns = options.maxTurns ?? 5;
  const {
    sessionId,
    condition,
    initialPrompt,
    abortSignal,
    broadcast,
    broadcastSessionCreated,
    broadcastSessionUpdated: broadcastSessUpdated,
    runTurn,
  } = options;

  console.log('[goal:loop] Starting goal loop', {
    sessionId,
    conditionPreview: condition.slice(0, 80),
    maxTurns,
    hasInitialPrompt: !!initialPrompt,
  });

  // Initialize goal state on session
  const session = getSession(sessionId);
  if (!session) {
    console.error('[goal:loop] Session not found', { sessionId });
    return;
  }

  const metadata = session.metadata ?? {};
  const goalState: GoalState = {
    condition,
    maxTurns,
    currentTurn: 0,
    status: 'active',
    startedAt: Date.now(),
  };
  updateSession(sessionId, { metadata: { ...metadata, goal: goalState } });
  const initialized = getSession(sessionId);
  if (initialized) {
    if (broadcastSessUpdated) {
      broadcastSessUpdated(initialized);
    } else {
      broadcastSessionUpdated(initialized);
    }
  }

  // The content for the next turn. Starts with the initial prompt.
  let nextTurnContent = initialPrompt || condition;

  // Run turns
  for (let turn = 1; turn <= maxTurns; turn++) {
    // Check abort
    if (abortSignal?.aborted) {
      console.log('[goal:loop] Aborted before turn', { turn });
      updateGoalState(sessionId, { status: 'cancelled', completedAt: Date.now() }, broadcastSessUpdated);
      return;
    }

    // Update turn counter
    updateGoalState(sessionId, { currentTurn: turn }, broadcastSessUpdated);
    console.log('[goal:loop] Starting turn', { turn, maxTurns, contentPreview: nextTurnContent.slice(0, 80) });

    // Run the agent turn
    const result = await runTurn(nextTurnContent);
    console.log('[goal:loop] Turn completed', { turn, streamCompleted: result.streamCompleted, interrupted: result.interrupted });

    // If the agent turn was interrupted (user pressed Stop), hard-stop the goal loop
    if (result.interrupted) {
      console.log('[goal:loop] Turn was interrupted, stopping goal loop', { turn });
      updateGoalState(sessionId, { status: 'cancelled', completedAt: Date.now() }, broadcastSessUpdated);
      return;
    }

    // Check abort signal (belt and suspenders — the polling in message-router also catches this)
    if (abortSignal?.aborted) {
      console.log('[goal:loop] Aborted after turn', { turn });
      updateGoalState(sessionId, { status: 'cancelled', completedAt: Date.now() }, broadcastSessUpdated);
      return;
    }

    // Evaluate
    let evaluation;
    try {
      evaluation = await evaluateGoal({
        sessionId,
        condition,
        turn,
        maxTurns,
        abortSignal,
        broadcast,
        broadcastSessionCreated,
        broadcastSessionUpdated: broadcastSessUpdated,
      });
    } catch (err) {
      console.error('[goal:loop] Evaluator failed', { turn, error: err instanceof Error ? err.message : String(err) });
      // If evaluator fails, treat as not met and continue
      evaluation = {
        goalMet: false,
        reason: 'Evaluator call failed — continuing work',
      };
    }

    if (evaluation.goalMet) {
      console.log('[goal:loop] GOAL MET!', { turn, reason: evaluation.reason });
      updateGoalState(sessionId, { status: 'met', completedAt: Date.now() }, broadcastSessUpdated);
      return;
    }

    // Prepare continuation content for the next turn
    nextTurnContent = buildContinuationMessage(
      condition,
      evaluation.reason,
      evaluation.remainingWork,
    );
    console.log('[goal:loop] Prepared continuation for next turn', { turn, continuationPreview: nextTurnContent.slice(0, 80) });
  }

  // Max turns reached
  console.log('[goal:loop] Max turns reached without meeting goal', { maxTurns });
  updateGoalState(sessionId, { status: 'failed', completedAt: Date.now() }, broadcastSessUpdated);
}
