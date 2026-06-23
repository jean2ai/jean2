import { runOrchestratorSession } from './workflow-orchestrator-session';
import { listMessagesWithParts } from '@/store';
import type { GoalEvaluation, TextPart, ToolPart } from '@jean2/sdk';
import type { BroadcastFn, BroadcastSessionFn } from './broadcast';

const MAX_TRANSCRIPT_MESSAGES = 20;
const MAX_TOOL_OUTPUT_CHARS = 500;

/**
 * Build a compact transcript summary for the evaluator.
 * Includes recent user/assistant messages and tool call summaries.
 */
function buildTranscriptSummary(sessionId: string): string {
  const messages = listMessagesWithParts(sessionId);
  const recent = messages.slice(-MAX_TRANSCRIPT_MESSAGES);

  return recent
    .map((entry) => {
      const msg = entry.message;
      if (msg.role === 'user') {
        const text = entry.parts
          .filter((p): p is TextPart => p.type === 'text')
          .map((p) => p.text || '')
          .join('');
        return text ? `[USER]: ${text}` : '';
      }

      if (msg.role === 'assistant') {
        const parts: string[] = [];
        for (const part of entry.parts) {
          if (part.type === 'text' && part.text) {
            parts.push(`[ASSISTANT]: ${part.text}`);
          } else if (part.type === 'tool') {
            const toolPart = part as ToolPart;
            const summary = summarizeToolState(toolPart);
            parts.push(`[TOOL: ${toolPart.name}]: ${summary}`);
          }
        }
        return parts.join('\n');
      }

      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function summarizeToolState(toolPart: ToolPart): string {
  const state = toolPart.state;
  if (state.status === 'completed') {
    const output = state.output;
    if (typeof output === 'string') {
      return output.slice(0, MAX_TOOL_OUTPUT_CHARS);
    }
    if (output && typeof output === 'object') {
      const str = JSON.stringify(output);
      return str.slice(0, MAX_TOOL_OUTPUT_CHARS);
    }
    return '(completed)';
  }
  if (state.status === 'error') {
    return `ERROR: ${state.error ?? 'unknown'}`;
  }
  return `(${state.status})`;
}

/**
 * Evaluate whether the goal completion condition has been met.
 * Uses runOrchestratorSession for visibility in the session tree.
 */
export async function evaluateGoal(options: {
  sessionId: string;
  condition: string;
  turn: number;
  maxTurns: number;
  abortSignal?: AbortSignal;
  broadcast?: BroadcastFn;
  broadcastSessionCreated?: BroadcastSessionFn;
  broadcastSessionUpdated?: BroadcastSessionFn;
}): Promise<GoalEvaluation> {
  console.log('[goal:evaluator] Starting evaluation', {
    sessionId: options.sessionId,
    turn: options.turn,
    conditionPreview: options.condition.slice(0, 80),
  });

  const transcript = buildTranscriptSummary(options.sessionId);

  const system = [
    'You are a goal evaluator. Your job is to determine if a completion condition',
    'has been met based on the conversation transcript of an AI agent working on a task.',
    '',
    `Completion condition: "${options.condition}"`,
    '',
    'Rules:',
    '- Look for evidence in tool outputs (test results, lint output, build status, file contents).',
    '- Only return goalMet: true if you find CONCRETE evidence the condition is satisfied.',
    '- Do NOT assume the condition is met just because the agent said it was — verify from tool outputs.',
    '- If the condition requires tests to pass, look for actual test output showing all tests passing.',
    '',
    `Conversation transcript (turn ${options.turn} of ${options.maxTurns}):`,
    transcript,
    '',
    'Respond with ONLY valid JSON (no markdown fences, no extra text):',
    '{"goalMet": true/false, "reason": "explanation", "remainingWork": "what is left to do"}',
  ].join('\n');

  const result = await runOrchestratorSession({
    parentSessionId: options.sessionId,
    title: `Goal Eval (Turn ${options.turn}): ${options.condition.slice(0, 40)}`,
    agentName: 'goal-evaluator',
    systemPrompt: system,
    userPrompt: `Evaluate: has the condition "${options.condition}" been met based on the transcript above?`,
    maxTokens: 2048,
    abortSignal: options.abortSignal,
    broadcast: options.broadcast,
    broadcastSessionCreated: options.broadcastSessionCreated,
    broadcastSessionUpdated: options.broadcastSessionUpdated,
  });

  console.log('[goal:evaluator] Evaluation complete', {
    goalMet: result.json?.goalMet === true,
    reason: result.json?.reason,
  });

  return {
    goalMet: result.json?.goalMet === true,
    reason: (result.json?.reason as string) ?? 'No reason provided',
    remainingWork: (result.json?.remainingWork as string) ?? undefined,
  };
}

/**
 * Build the continuation message injected between goal turns.
 */
export function buildContinuationMessage(
  condition: string,
  reason: string,
  remainingWork?: string,
): string {
  return [
    `The goal is NOT yet met: ${condition}`,
    '',
    `Evaluator feedback: ${reason}`,
    remainingWork ? `\nRemaining work: ${remainingWork}` : '',
    '',
    'Continue working toward the goal. Do not repeat work you have already done.',
  ].join('\n');
}
