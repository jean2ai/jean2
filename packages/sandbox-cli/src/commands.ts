import type { SandboxApiClient } from './api-client';
import {
  displayAutoResponders,
  displayCallDetail,
  displayHelp,
  displayHistory,
  displayPendingCalls,
  displayStatus,
} from './display';
import type { AutoResponderRule, LlmCallContext, SandboxResponse } from './types';

interface HandleOptions {
  exit: () => void;
}

function tokenize(input: string): string[] {
  const tokens = input.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) || [];
  return tokens.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith('\'') && token.endsWith('\''))) {
      return token.slice(1, -1);
    }
    return token;
  });
}

function isNumericIndex(token: string): boolean {
  return /^\d+$/.test(token);
}

async function resolvePendingCall(calls: LlmCallContext[], token?: string): Promise<string> {
  if (calls.length === 0) {
    throw new Error('No pending calls');
  }

  if (!token) {
    return calls[calls.length - 1].callId;
  }

  if (isNumericIndex(token)) {
    const index = Number.parseInt(token, 10) - 1;
    if (index < 0 || index >= calls.length) {
      throw new Error(`Invalid pending call index: ${token}`);
    }
    return calls[index].callId;
  }

  return token;
}

function parseResponse(responseType: string | undefined, rest: string[]): SandboxResponse {
  const type = responseType?.toLowerCase();

  switch (type) {
    case 'text':
    case 't':
      return { type: 'text', content: rest.join(' ') };

    case 'tool-call':
    case 'tc': {
      if (rest.length < 2) {
        throw new Error('Usage: tool-call <toolName> <jsonArgs>');
      }
      const toolName = rest[0];
      const rawArgs = rest.slice(1).join(' ');
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        throw new Error('Invalid JSON args for tool-call response');
      }
      return { type: 'tool-call', toolName, args };
    }

    case 'error':
    case 'e': {
      const typeIndex = rest.findIndex((token) => token === '--type');
      if (typeIndex === -1) {
        return { type: 'error', error: rest.join(' ') || 'Unknown error' };
      }

      const error = rest.slice(0, typeIndex).join(' ') || 'Unknown error';
      const errorType = rest[typeIndex + 1];
      if (!errorType) {
        throw new Error('Usage: error <message> [--type <errorType>]');
      }
      return {
        type: 'error',
        error,
        errorType: errorType as 'rate_limit' | 'server' | 'timeout' | 'auth' | 'invalid_request',
      };
    }

    case 'reasoning': {
      const textIndex = rest.findIndex((token) => token === '--text');
      if (textIndex <= 0) {
        throw new Error('Usage: reasoning <reasoning> --text <text>');
      }
      const reasoning = rest.slice(0, textIndex).join(' ');
      const text = rest.slice(textIndex + 1).join(' ');
      if (!text) {
        throw new Error('Usage: reasoning <reasoning> --text <text>');
      }
      return { type: 'reasoning', reasoning, text };
    }

    default:
      throw new Error(`Unknown response type: ${responseType}`);
  }
}

function parseAutoMatch(tokens: string[]): { match: AutoResponderRule['match']; rest: string[]; maxUses?: number; label?: string } {
  const match: AutoResponderRule['match'] = {};
  let maxUses: number | undefined;
  let label: string | undefined;

  let index = 0;
  while (index < tokens.length && tokens[index].includes(':')) {
    const [rawKey, ...valueParts] = tokens[index].split(':');
    const key = rawKey.trim();
    const value = valueParts.join(':').trim();

    switch (key) {
      case 'mode':
        if (value !== 'stream' && value !== 'generate') {
          throw new Error('mode must be stream or generate');
        }
        match.mode = value;
        break;
      case 'depth':
        match.depth = Number.parseInt(value, 10);
        if (Number.isNaN(match.depth)) {
          throw new Error('depth must be a number');
        }
        break;
      case 'session':
      case 'sessionId':
        match.sessionId = value;
        break;
      case 'hasToolResults':
        match.hasToolResults = value === 'true';
        break;
      case 'maxUses': {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('maxUses must be a positive number');
        }
        maxUses = parsed;
        break;
      }
      case 'label':
        label = value;
        break;
      default:
        return { match, rest: tokens.slice(index), maxUses, label };
    }

    index += 1;
  }

  return { match, rest: tokens.slice(index), maxUses, label };
}

async function handleRespond(client: SandboxApiClient, tokens: string[]): Promise<void> {
  if (tokens.length === 0) {
    throw new Error('Usage: respond [callId|index] <type> [args...]');
  }

  const knownTypes = new Set(['text', 't', 'tool-call', 'tc', 'error', 'e', 'reasoning']);
  let callHint: string | undefined;
  let responseType: string | undefined;
  let responseTokens: string[];

  if (knownTypes.has(tokens[0]?.toLowerCase() || '')) {
    responseType = tokens[0];
    responseTokens = tokens.slice(1);
  } else {
    callHint = tokens[0];
    responseType = tokens[1];
    responseTokens = tokens.slice(2);
  }

  const pendingCalls = await client.getPendingCalls();
  const callId = await resolvePendingCall(pendingCalls, callHint);
  const response = parseResponse(responseType, responseTokens);

  await client.respond(callId, response);
  console.log(`✓ Response sent to call #${callId.slice(0, 8)}`);
}

async function handlePending(client: SandboxApiClient): Promise<void> {
  const pending = await client.getPendingCalls();
  displayPendingCalls(pending);
}

async function handleHistory(client: SandboxApiClient): Promise<void> {
  const history = await client.getHistory();
  displayHistory(history);
}

async function handleCall(client: SandboxApiClient, token?: string): Promise<void> {
  if (!token) {
    throw new Error('Usage: call <callId|index>');
  }

  const pending = await client.getPendingCalls();
  const callId = await resolvePendingCall(pending, token);
  const call = await client.getPendingCall(callId);
  if (!call) {
    throw new Error(`Call not found or already completed: ${callId}`);
  }

  displayCallDetail(call);
}

async function handleAutoRespond(client: SandboxApiClient, tokens: string[]): Promise<void> {
  const action = tokens[0]?.toLowerCase();

  if (action === 'list') {
    const rules = await client.getAutoResponderRules();
    displayAutoResponders(rules);
    return;
  }

  if (action === 'clear') {
    await client.setAutoResponderRules([]);
    console.log('✓ Auto-responder rules cleared.');
    return;
  }

  const existing = await client.getAutoResponderRules();
  const parsed = parseAutoMatch(tokens);
  if (parsed.rest.length === 0) {
    throw new Error('Usage: auto-respond [match...] <response>');
  }

  const response = parseResponse(parsed.rest[0], parsed.rest.slice(1));
  const rule: AutoResponderRule = {
    match: parsed.match,
    response,
  };

  if (parsed.maxUses) {
    rule.maxUses = parsed.maxUses;
  }

  if (parsed.label) {
    rule.label = parsed.label;
  }

  await client.setAutoResponderRules([...existing, rule]);
  console.log('✓ Auto-responder rule added.');
}

async function handleStatus(client: SandboxApiClient): Promise<void> {
  const [status, rules] = await Promise.all([
    client.getStatus(),
    client.getAutoResponderRules(),
  ]);
  displayStatus(status, rules.length);
}

async function handleClear(client: SandboxApiClient): Promise<void> {
  await client.clearHistory();
  console.log('✓ History cleared.');
}

export async function handleCommand(client: SandboxApiClient, input: string, options: HandleOptions): Promise<void> {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return;
  }

  const command = tokens[0].toLowerCase();

  switch (command) {
    case 'respond':
    case 'r':
      await handleRespond(client, tokens.slice(1));
      return;

    case 'pending':
    case 'p':
      await handlePending(client);
      return;

    case 'history':
    case 'h':
      await handleHistory(client);
      return;

    case 'call':
      await handleCall(client, tokens[1]);
      return;

    case 'auto-respond':
      await handleAutoRespond(client, tokens.slice(1));
      return;

    case 'status':
    case 's':
      await handleStatus(client);
      return;

    case 'clear':
      await handleClear(client);
      return;

    case 'help':
      displayHelp();
      return;

    case 'exit':
    case 'quit':
      options.exit();
      return;

    default:
      console.log(`Unknown command: ${command}. Type "help" for commands.`);
  }
}
