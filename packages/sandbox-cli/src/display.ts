import type { AutoResponderRule, LlmCallContext, SandboxHistoryEntry, SandboxResponse, SandboxStatus } from './types';

function shortId(value: string): string {
  return value.slice(0, 8);
}

function formatMessageContent(content: unknown, maxLength = 100): string {
  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  if (!raw) {
    return '';
  }
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

function responseSummary(response: SandboxResponse | null): string {
  if (!response) {
    return 'no response';
  }

  switch (response.type) {
    case 'text':
      return `text "${formatMessageContent(response.content, 40)}"`;
    case 'tool-call':
      return `tool-call ${response.toolName}`;
    case 'multi-tool-call':
      return `multi-tool-call (${response.calls.length})`;
    case 'reasoning':
      return `reasoning "${formatMessageContent(response.text, 40)}"`;
    case 'error':
      return `error "${formatMessageContent(response.error, 40)}"`;
  }
}

export function displayPendingCalls(calls: LlmCallContext[]): void {
  if (calls.length === 0) {
    console.log('\n⏳  PENDING (0 calls)\n');
    return;
  }

  console.log(`\n⏳  PENDING (${calls.length} calls)\n`);

  calls.forEach((call, index) => {
    const toolList = call.tools.length > 7
      ? `${call.tools.slice(0, 7).map((tool) => tool.name).join(', ')}, ...`
      : call.tools.map((tool) => tool.name).join(', ');

    console.log(`  #${index + 1} (${shortId(call.callId)})  session: ${shortId(call.sessionId)}  depth: ${call.depth}  mode: ${call.mode}`);
    console.log(`      Tools: ${toolList || '(none)'}`);

    const lastMessage = [...call.messages].reverse().find((message) => message.role === 'user' || message.role === 'tool');
    if (lastMessage) {
      const label = lastMessage.role === 'tool' ? 'Tool result' : 'Last message';
      console.log(`      ${label}: "${formatMessageContent(lastMessage.content, 120)}"`);
    }

    console.log();
  });
}

export function displayNotification(context: LlmCallContext): void {
  console.log(`\n🔔  New call #${shortId(context.callId)} — session: ${shortId(context.sessionId)}, depth: ${context.depth}`);
  const toolNames = context.tools.map((tool) => tool.name).join(', ');
  console.log(`    Tools: ${toolNames || '(none)'}`);

  const lastUser = [...context.messages].reverse().find((message) => message.role === 'user');
  if (lastUser) {
    console.log(`    Last message: "${formatMessageContent(lastUser.content, 120)}"`);
  }
}

export function displayHistory(entries: SandboxHistoryEntry[]): void {
  if (entries.length === 0) {
    console.log('\n✅  HISTORY (0 entries)\n');
    return;
  }

  console.log(`\n✅  HISTORY (${entries.length} entries)\n`);

  for (const entry of entries) {
    const status = entry.completedAt ? 'completed' : entry.respondedAt ? 'responded' : 'pending';
    const duration = entry.completedAt && entry.respondedAt
      ? ` (${((entry.completedAt - entry.respondedAt) / 1000).toFixed(1)}s)`
      : '';

    console.log(`  #${shortId(entry.callId)}  ${responseSummary(entry.response)}  →  ${status}${duration}`);
  }
  console.log();
}

export function displayCallDetail(call: LlmCallContext): void {
  console.log(`\nCall #${call.callId}`);
  console.log(`Session: ${call.sessionId}  Depth: ${call.depth}  Mode: ${call.mode}`);
  console.log(`Model: ${call.modelId}  Provider: ${call.providerId}`);
  console.log(`Timestamp: ${new Date(call.timestamp).toISOString()}`);
  if (call.systemPrompt) {
    console.log(`System prompt: ${formatMessageContent(call.systemPrompt, 200)}`);
  }

  console.log(`\nMessages (${call.messages.length}):`);
  for (const message of call.messages) {
    console.log(`  [${message.role}] ${formatMessageContent(message.content, 200)}`);
  }

  const tools = call.tools.map((tool) => tool.name).join(', ');
  console.log(`\nAvailable tools: ${tools || '(none)'}\n`);
}

export function displayStatus(status: SandboxStatus, autoResponderCount: number): void {
  console.log('\n🎛️  Sandbox Status');
  console.log(`  Active: ${status.active}`);
  console.log(`  Pending calls: ${status.pendingCallCount}`);
  console.log(`  Total handled: ${status.totalCallsHandled}`);
  console.log(`  Auto-responders: ${autoResponderCount}`);
  console.log();
}

export function displayAutoResponders(rules: AutoResponderRule[]): void {
  if (rules.length === 0) {
    console.log('\n🤖 Auto-responders: none\n');
    return;
  }

  console.log(`\n🤖 Auto-responders (${rules.length})\n`);
  rules.forEach((rule, index) => {
    const matchParts: string[] = [];
    if (rule.match.mode) matchParts.push(`mode:${rule.match.mode}`);
    if (rule.match.depth !== undefined) matchParts.push(`depth:${JSON.stringify(rule.match.depth)}`);
    if (rule.match.sessionId !== undefined) matchParts.push(`session:${JSON.stringify(rule.match.sessionId)}`);
    if (rule.match.hasToolResults !== undefined) matchParts.push(`hasToolResults:${rule.match.hasToolResults}`);

    console.log(`  ${index + 1}. ${rule.label || '(no label)'}`);
    console.log(`     Match: ${matchParts.join(', ') || 'all calls'}`);
    console.log(`     Response: ${responseSummary(rule.response)}`);
  });
  console.log();
}

export function displayHelp(): void {
  console.log(`
Commands:
  respond|r [callId|index] <type> [args...]      Respond to a pending call
    types:
      text|t <message>
      tool-call|tc <toolName> <jsonArgs>
      error|e <message> [--type <errorType>]
      reasoning <reasoning> --text <message>

  pending|p                                      List pending calls
  history|h                                      Show response history
  call <callId|index>                            Show full call context
  auto-respond list                              List auto-responder rules
  auto-respond clear                             Clear auto-responder rules
  auto-respond [match...] <response>             Add an auto-responder rule
    match tokens: mode:stream|generate depth:N session:<id> hasToolResults:true|false maxUses:N label:<name>

  status|s                                       Show sandbox status
  clear                                          Clear sandbox history
  help                                           Show this help
  exit|quit                                      Exit CLI
`);
}
