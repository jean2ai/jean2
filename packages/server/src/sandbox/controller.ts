import type {
  AutoResponderRule,
  LlmCallContext,
  SandboxControlEvent,
  SandboxHistoryEntry,
  SandboxResponse,
} from '@/sandbox/types';

interface PendingCall {
  context: LlmCallContext;
  resolve: (response: SandboxResponse) => void;
}

interface InternalAutoResponderRule extends AutoResponderRule {
  uses: number;
}

function cloneResponse(response: SandboxResponse): SandboxResponse {
  if (response.type === 'multi-tool-call') {
    return {
      ...response,
      calls: response.calls.map((call) => ({
        ...call,
        args: { ...call.args },
      })),
    };
  }

  if (response.type === 'tool-call') {
    return {
      ...response,
      args: { ...response.args },
    };
  }

  return { ...response };
}

function hasToolResults(context: LlmCallContext): boolean {
  return context.messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => {
      if (!part || typeof part !== 'object') {
        return false;
      }

      const candidate = part as { type?: unknown };
      return candidate.type === 'tool-result';
    });
  });
}

function matchesScalar<T extends string | number>(
  value: T,
  matcher: T | T[] | undefined,
): boolean {
  if (matcher === undefined) {
    return true;
  }

  return Array.isArray(matcher) ? matcher.includes(value) : matcher === value;
}

export class SandboxController {
  private pendingCalls = new Map<string, PendingCall>();
  private history: SandboxHistoryEntry[] = [];
  private autoResponderRules: InternalAutoResponderRule[] = [];
  private broadcastEvent: ((event: SandboxControlEvent) => void) | null = null;

  constructor(initialRules: AutoResponderRule[] = []) {
    this.setAutoResponderRules(initialRules);
  }

  async waitForResponse(context: LlmCallContext): Promise<SandboxResponse> {
    const historyEntry: SandboxHistoryEntry = {
      callId: context.callId,
      context,
      response: null,
      respondedAt: null,
      completedAt: null,
    };

    this.history.push(historyEntry);

    const rule = this.findMatchingRule(context);
    if (rule) {
      const response = cloneResponse(rule.response);
      historyEntry.response = response;
      historyEntry.respondedAt = Date.now();
      this.broadcastHistory();
      return response;
    }

    this.broadcast({
      type: 'sandbox.call_waiting',
      context,
    });
    this.broadcastHistory();

    return new Promise<SandboxResponse>((resolve) => {
      this.pendingCalls.set(context.callId, { context, resolve });
    });
  }

  respond(callId: string, response: SandboxResponse): void {
    const pending = this.pendingCalls.get(callId);
    if (!pending) {
      throw new Error(`No pending call with id: ${callId}`);
    }

    this.pendingCalls.delete(callId);

    const entry = this.history.find((candidate) => candidate.callId === callId);
    if (entry) {
      entry.response = cloneResponse(response);
      entry.respondedAt = Date.now();
    }

    this.broadcastHistory();
    pending.resolve(response);
  }

  complete(callId: string): void {
    const entry = this.history.find((candidate) => candidate.callId === callId);
    if (entry) {
      entry.completedAt = Date.now();
    }

    this.broadcast({
      type: 'sandbox.call_completed',
      callId,
    });
    this.broadcastHistory();
  }

  getPendingCalls(): LlmCallContext[] {
    return Array.from(this.pendingCalls.values()).map((pending) => pending.context);
  }

  getPendingCall(callId: string): LlmCallContext | undefined {
    return this.pendingCalls.get(callId)?.context;
  }

  getHistory(): SandboxHistoryEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    this.broadcastHistory();
  }

  getAutoResponderRules(): AutoResponderRule[] {
    return this.autoResponderRules.map(({ uses: _uses, ...rule }) => rule);
  }

  setAutoResponderRules(rules: AutoResponderRule[]): void {
    this.autoResponderRules = rules.map((rule) => ({
      ...rule,
      response: cloneResponse(rule.response),
      uses: 0,
    }));
  }

  setBroadcast(fn: ((event: SandboxControlEvent) => void) | null): void {
    this.broadcastEvent = fn;
  }

  reset(): void {
    this.pendingCalls = new Map<string, PendingCall>();
    this.history = [];
    this.autoResponderRules = [];
    this.broadcastEvent = null;
  }

  private findMatchingRule(context: LlmCallContext): InternalAutoResponderRule | null {
    for (const rule of this.autoResponderRules) {
      if (!matchesScalar(context.mode, rule.match.mode)) {
        continue;
      }

      if (!matchesScalar(context.depth, rule.match.depth)) {
        continue;
      }

      if (!matchesScalar(context.sessionId, rule.match.sessionId)) {
        continue;
      }

      if (rule.match.hasToolResults !== undefined && rule.match.hasToolResults !== hasToolResults(context)) {
        continue;
      }

      rule.uses += 1;
      if (rule.maxUses !== undefined && rule.uses >= rule.maxUses) {
        this.autoResponderRules = this.autoResponderRules.filter((candidate) => candidate !== rule);
      }
      return rule;
    }

    return null;
  }

  private broadcast(event: SandboxControlEvent): void {
    this.broadcastEvent?.(event);
  }

  private broadcastHistory(): void {
    this.broadcast({
      type: 'sandbox.history',
      entries: this.getHistory(),
    });
  }
}

export const sandboxController = new SandboxController();
