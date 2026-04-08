import type {
  Message,
  AssistantMessage,
  ToolPart,
  Session,
} from '@jean2/sdk';

export interface FormatMessageOptions {
  maxWidth?: number;
  showTimestamp?: boolean;
  color?: boolean;
}

export interface FormatToolCallOptions {
  color?: boolean;
  maxWidth?: number;
}

function bold(text: string, color = true): string {
  return color ? `\x1b[1m${text}\x1b[22m` : text;
}

function dim(text: string, color = true): string {
  return color ? `\x1b[2m${text}\x1b[22m` : text;
}

function red(text: string, color = true): string {
  return color ? `\x1b[31m${text}\x1b[39m` : text;
}

function green(text: string, color = true): string {
  return color ? `\x1b[32m${text}\x1b[39m` : text;
}

function blue(text: string, color = true): string {
  return color ? `\x1b[34m${text}\x1b[39m` : text;
}

function cyan(text: string, color = true): string {
  return color ? `\x1b[36m${text}\x1b[39m` : text;
}

function gray(text: string, color = true): string {
  return color ? `\x1b[90m${text}\x1b[39m` : text;
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiPattern = /\x1b\[\d+m/g;
  return text.replace(ansiPattern, '');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function formatMessage(message: Message, options: FormatMessageOptions = {}): string {
  const { color = true } = options;
  let result = '';

  if (options.showTimestamp) {
    const date = new Date(message.createdAt);
    result += dim(`[${date.toISOString()}]`, color) + ' ';
  }

  if (message.role === 'user') {
    result += `${blue('[You]', color)}`;
  } else if (message.role === 'assistant') {
    result += `${green('[Assistant]', color)} (${(message as AssistantMessage).status})`;
  } else if (message.role === 'system') {
    result += `${gray('[System]', color)}`;
  }

  return result;
}

export function formatToolCall(part: ToolPart, options: FormatToolCallOptions = {}): string {
  const { color = true } = options;
  const argsJson = JSON.stringify(part.state.input, null, 2);

  let result = `${cyan(bold('🔧 ' + part.name + '(args)'), color)}\n`;

  if (argsJson.length > 60) {
    result += dim('  ' + truncate(argsJson.replace(/\n/g, ' '), 58), color) + '\n';
  } else {
    result += dim('  ' + argsJson, color) + '\n';
  }

  if (part.state.status === 'completed' && 'output' in part.state) {
    const outputStr = String(part.state.output);
    result += `${green('→ ' + truncate(outputStr, 200), color)}`;
  }

  if (part.state.status === 'error' && 'error' in part.state) {
    result += `${red('→ Error: ' + part.state.error, color)}`;
  }

  return result.trimEnd();
}

export function formatSessionHeader(session: Session): string {
  const title = session.title || 'Untitled';
  const status = session.status;
  const created = session.createdAt;

  let header = bold(`Session: ${title}`);
  header += dim(` (${status})`);
  header += dim(` created: ${created}`);

  return header;
}
