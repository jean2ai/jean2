import { streamText } from 'ai';
import { randomUUID } from 'crypto';
import type { TextPart, UserMessage, AssistantMessage } from '@jean2/sdk';
import { createMessage, createPart, createSession, getSession, updateSession } from '@/store';
import { getWorkspaceAutoApproveSeverity } from '@/store/workspaces';
import { getModelsConfig } from '@/config';
import { getModelWithMetadata } from '@/core/model-utils';
import { broadcastEvent, broadcastSessionCreated, broadcastSessionUpdated, type BroadcastFn, type BroadcastSessionFn } from './broadcast';
import { extractJsonFromText } from './structured-output';

/**
 * Options for running a lightweight orchestrator session (decomposer or synthesizer).
 * These are single-shot LLM calls wrapped in a visible session — no agent loop, no tools.
 */
export interface OrchestratorSessionOptions {
  /** Parent session ID (the session running the workflow tool) */
  parentSessionId: string;
  /** What this session does — shown as the title */
  title: string;
  /** Agent name shown in the session tree (e.g. 'decomposer', 'synthesizer') */
  agentName: string;
  /** The system prompt for the LLM call */
  systemPrompt: string;
  /** The user prompt for the LLM call */
  userPrompt: string;
  /** Max output tokens */
  maxTokens?: number;
  /** Abort signal from the workflow */
  abortSignal?: AbortSignal;
  /** Broadcast functions from the workflow context */
  broadcast?: BroadcastFn;
  broadcastSessionCreated?: BroadcastSessionFn;
  broadcastSessionUpdated?: BroadcastSessionFn;
}

export interface OrchestratorSessionResult {
  /** The raw text response from the LLM */
  text: string;
  /** Parsed JSON if the response contained valid JSON */
  json: Record<string, unknown> | null;
  /** The session ID of the orchestrator session */
  sessionId: string;
}

/**
 * Run a single LLM call as a visible child session.
 * Creates the session, stores messages, runs generateText, and broadcasts events.
 * This is lightweight — no agent loop, no tools, no compaction. Just prompt → response.
 */
export async function runOrchestratorSession(
  options: OrchestratorSessionOptions,
): Promise<OrchestratorSessionResult> {
  const {
    parentSessionId,
    title,
    agentName,
    systemPrompt,
    userPrompt,
    maxTokens = 4096,
    abortSignal,
    broadcast = broadcastEvent as BroadcastFn,
    broadcastSessionCreated: broadcastSessCreated = broadcastSessionCreated as BroadcastSessionFn,
    broadcastSessionUpdated: broadcastSessUpdated = broadcastSessionUpdated as BroadcastSessionFn,
  } = options;

  // Resolve model from parent session
  const parentSession = getSession(parentSessionId);
  const config = getModelsConfig();
  const modelId = parentSession?.selectedModel || config.defaultModel;
  const providerId = parentSession?.selectedProvider || config.defaultProvider;

  // Create the orchestrator child session
  const session = createSession({
    id: randomUUID(),
    workspaceId: parentSession?.workspaceId || '',
    preconfigId: null,
    title,
    status: 'active',
    metadata: null,
    parentId: parentSessionId,
    agentName,
    subagentStatus: 'running',
    selectedModel: modelId,
    selectedProvider: providerId,
    autoApproveSeverity: getWorkspaceAutoApproveSeverity(parentSession?.workspaceId || ''),
  });

  broadcastSessCreated(session);
  console.log(`[workflow:${agentName}] Session created`, { sessionId: session.id, modelId, providerId });

  try {
    // Create user message
    const userMsgId = randomUUID();
    const userMessage: UserMessage = {
      id: userMsgId,
      sessionId: session.id,
      role: 'user',
      createdAt: Date.now(),
    };
    const userTextPart: TextPart = {
      id: randomUUID(),
      messageId: userMsgId,
      createdAt: Date.now(),
      type: 'text',
      text: userPrompt,
    };
    createMessage(userMessage);
    createPart(userTextPart, session.id);

    broadcast({
      type: 'message.created',
      message: userMessage,
    });
    broadcast({
      type: 'part.created',
      sessionId: session.id,
      part: userTextPart,
    });

    // Resolve model metadata
    const { model, omitMaxOutputTokens, providerOptions, useProviderInstructions } = await getModelWithMetadata({
      modelId,
      providerId,
      systemPrompt,
      sessionId: parentSessionId,
    });

    // Run the LLM call via streamText (works universally, including providers
    // like Codex/OpenAI Responses API that require stream: true)
    console.log(`[workflow:${agentName}] Calling streamText...`);
    const stream = streamText({
      model,
      system: useProviderInstructions ? undefined : systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxOutputTokens: omitMaxOutputTokens ? undefined : maxTokens,
      providerOptions: providerOptions as unknown as Parameters<typeof streamText>[0]['providerOptions'],
      abortSignal,
    });

    const text = await stream.text;
    const streamUsage = await stream.usage;
    console.log(`[workflow:${agentName}] streamText returned`, { textLength: text?.length });

    // Create assistant message
    const assistantMsgId = randomUUID();
    const assistantTextPart: TextPart = {
      id: randomUUID(),
      messageId: assistantMsgId,
      createdAt: Date.now(),
      type: 'text',
      text,
    };
    // Parse JSON from the response so we can attach it as structuredOutput
    // — this makes the client render it as a nice card instead of raw JSON text
    const parsedJson = extractJsonFromText(text);

    const assistantMessage: AssistantMessage = {
      id: assistantMsgId,
      sessionId: session.id,
      role: 'assistant',
      status: 'completed',
      modelId,
      providerId,
      agent: agentName,
      tokens: {
        prompt: streamUsage?.inputTokens ?? 0,
        completion: streamUsage?.outputTokens ?? 0,
      },
      cost: 0,
      createdAt: Date.now(),
      completedAt: Date.now(),
      ...(parsedJson ? {
        structuredOutput: {
          formatName: title,
          data: parsedJson,
        },
      } : {}),
    };
    createMessage(assistantMessage);
    createPart(assistantTextPart, session.id);

    broadcast({
      type: 'message.created',
      message: assistantMessage,
    });
    broadcast({
      type: 'part.created',
      sessionId: session.id,
      part: assistantTextPart,
    });

    // Update session status
    updateSession(session.id, { subagentStatus: 'completed' });
    const updatedSession = getSession(session.id);
    if (updatedSession) {
      broadcastSessUpdated(updatedSession);
    }

    return {
      text,
      json: parsedJson,
      sessionId: session.id,
    };
  } catch (err) {
    // Log full error details so bad-request failures are diagnosable.
    // AI SDK errors (AI_APICallError) carry statusCode, responseBody, url, etc.
    const errAny = err as Record<string, unknown>;
    console.error(`[workflow:${agentName}] FAILED`, {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      statusCode: errAny?.statusCode ?? errAny?.status,
      url: errAny?.url,
      responseBody: errAny?.responseBody ?? errAny?.response,
      data: errAny?.data,
      cause: err instanceof Error ? err.cause : undefined,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined,
    });

    // Mark session as error
    updateSession(session.id, { subagentStatus: 'error' });
    const updatedSession = getSession(session.id);
    if (updatedSession) {
      broadcastSessUpdated(updatedSession);
    }

    throw err;
  }
}
