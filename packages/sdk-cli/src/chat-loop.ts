import * as readline from 'readline';
import type {
  Message,
  Part,
  ToolPart,
  Session,
  PendingPermissionRequest,
  PermissionType,
  PermissionKey,
} from '@jean2/sdk';
import { isUserMessage, isAssistantMessage } from '@jean2/sdk';
import { formatMessage, formatToolCall, formatSessionHeader } from './formatters';
import type { Jean2Client } from '@jean2/sdk';

function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[39m`;
}

function red(text: string): string {
  return `\x1b[31m${text}\x1b[39m`;
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[39m`;
}

export interface ChatLoopOptions {
  sessionId?: string;
  prompt?: string;
  onMessage?: (message: Message) => void;
  onPartCreated?: (sessionId: string, part: Part) => void;
  onStreamDelta?: (sessionId: string, partId: string, field: string, delta: string) => void;
  onMessageUpdated?: (message: Message) => void;
  onToolCall?: (part: ToolPart) => void;
  onPermissionRequest?: (request: PendingPermissionRequest) => boolean | Promise<boolean>;
  onError?: (error: Error) => void;
  exitCommands?: string[];
  inputStream?: NodeJS.ReadableStream;
  outputStream?: NodeJS.WritableStream;
}

export interface ChatLoopHandle {
  stop(): void;
  sessionId: string;
}

export function createChatLoop(client: Jean2Client, options: ChatLoopOptions = {}): ChatLoopHandle {
  const {
    sessionId: initialSessionId,
    prompt = '> ',
    onMessage,
    onPartCreated,
    onStreamDelta,
    onMessageUpdated,
    onToolCall,
    onPermissionRequest,
    onError,
    exitCommands = ['/exit', '/quit', '/q'],
    inputStream = process.stdin,
    outputStream = process.stdout,
  } = options;

  const rl = readline.createInterface({
    input: inputStream as NodeJS.ReadableStream & { fd?: number },
    output: outputStream as NodeJS.WritableStream,
    prompt,
  });

  let currentSessionId = '';
  let stopped = false;
  let isReconnecting = false;
  let sessionInitialized = false;

  const defaultOnMessage = (message: Message): void => {
    if (isUserMessage(message)) {
      outputStream.write(formatMessage(message) + '\n');
    }
  };

  const defaultOnToolCall = (part: ToolPart): void => {
    outputStream.write(formatToolCall(part) + '\n');
  };

  const defaultOnStreamDelta = (
    _sessionId: string,
    _partId: string,
    field: string,
    delta: string,
  ): void => {
    if (field === 'text') {
      outputStream.write(delta);
    }
  };

  const defaultOnMessageUpdated = (message: Message): void => {
    if (isAssistantMessage(message) && message.status === 'completed') {
      outputStream.write('\n');
    }
  };

  const defaultOnError = (error: Error): void => {
    outputStream.write(red('Error: ' + error.message) + '\n');
  };

  const handleMessage = onMessage || defaultOnMessage;
  const handleToolCall = onToolCall || defaultOnToolCall;
  const handleStreamDelta = onStreamDelta || defaultOnStreamDelta;
  const handleMessageUpdated = onMessageUpdated || defaultOnMessageUpdated;
  const handleError = onError || defaultOnError;

  const defaultOnPermissionRequest = async (request: PendingPermissionRequest): Promise<boolean> => {
    const label = request.dangerous ? '⚠️  ' : '';
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${label}${request.toolName}: ${request.message} (y/n)? `, resolve);
    });
    const granted = answer.toLowerCase().startsWith('y');
    client.permissions.respond(request.toolCallId, granted, false);
    if (!granted) {
      outputStream.write('Permission denied.\n');
    }
    return granted;
  };

  const handlePermission = onPermissionRequest || defaultOnPermissionRequest;

  const messageCreatedHandler = (message: Message): void => {
    handleMessage(message);
  };

  const partCreatedHandler = (sessionId: string, part: Part): void => {
    onPartCreated?.(sessionId, part);
    if (!onToolCall && part.type === 'tool') {
      handleToolCall(part as ToolPart);
    }
  };

  const partAppendHandler = (
    sessionId: string,
    partId: string,
    field: string,
    delta: string,
  ): void => {
    handleStreamDelta(sessionId, partId, field, delta);
  };

  const messageUpdatedHandler = (message: Message): void => {
    handleMessageUpdated(message);
    if (isAssistantMessage(message) && message.status === 'completed') {
      if (!stopped) {
        rl.prompt();
      }
    }
  };

  const sessionCreatedHandler = (session: Session): void => {
    if (sessionInitialized) return;
    sessionInitialized = true;
    currentSessionId = session.id;
    outputStream.write(formatSessionHeader(session) + '\n');
    rl.prompt();

    rl.on('line', (line: string) => {
      const trimmed = line.trim();

      if (exitCommands.includes(trimmed)) {
        stop();
        return;
      }

      if (trimmed === '') {
        rl.prompt();
        return;
      }

      client.chat.send(currentSessionId, trimmed);
      rl.prompt();
    });
  };

  const sessionResumedHandler = (
    session: Session,
    _messages: unknown[],
    _usage: unknown,
    _isRunning: boolean | undefined,
  ): void => {
    if (sessionInitialized) return;
    sessionInitialized = true;
    currentSessionId = session.id;
    outputStream.write(formatSessionHeader(session) + '\n');
    rl.prompt();

    rl.on('line', (line: string) => {
      const trimmed = line.trim();

      if (exitCommands.includes(trimmed)) {
        stop();
        return;
      }

      if (trimmed === '') {
        rl.prompt();
        return;
      }

      client.chat.send(currentSessionId, trimmed);
      rl.prompt();
    });
  };

  const permissionRequestHandler = (
    sessionId: string,
    _childSessionId: string | undefined,
    _subagentName: string | undefined,
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    permissionType: PermissionType,
    permissionKey: PermissionKey,
    message: string,
    details: Record<string, unknown> | undefined,
    dangerous: boolean | undefined,
  ): void => {
    const request: PendingPermissionRequest = {
      sessionId,
      toolCallId,
      toolName,
      args,
      permissionType,
      permissionKey,
      message,
      details,
      dangerous,
    };

    const result = handlePermission(request);
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        handleError(error);
      });
    }
  };

  const errorConnectionHandler = (error: Error): void => {
    handleError(error);
  };

  const disconnectedHandler = (): void => {
    outputStream.write(yellow('Disconnected\n'));
  };

  const reconnectingHandler = (): void => {
    isReconnecting = true;
    outputStream.write(yellow('Reconnecting...\n'));
  };

  const connectedHandler = (): void => {
    if (isReconnecting) {
      outputStream.write(green('Reconnected\n'));
      isReconnecting = false;
      if (!stopped) {
        rl.prompt();
      }
    }
  };

  client.on('message.created', messageCreatedHandler);
  client.on('part.created', partCreatedHandler);
  client.on('part.append', partAppendHandler);
  client.on('message.updated', messageUpdatedHandler);
  client.on('permission.request', permissionRequestHandler);
  client.on('error.connection', errorConnectionHandler);
  client.on('disconnected', disconnectedHandler);
  client.on('reconnecting', reconnectingHandler);
  client.on('connected', connectedHandler);

  const sessionCreatedHandlerWrapper = (session: Session): void => {
    sessionCreatedHandler(session);
  };

  const sessionResumedHandlerWrapper = (
    session: Session,
    messages: unknown[],
    usage: unknown,
    isRunning: boolean | undefined,
  ): void => {
    sessionResumedHandler(session, messages, usage, isRunning);
  };

  client.on('session.created', sessionCreatedHandlerWrapper);
  client.on('session.resumed', sessionResumedHandlerWrapper);

  if (initialSessionId) {
    client.sessions.resume(initialSessionId);
  } else {
    client.sessions.create();
  }

  const stop = (): void => {
    if (stopped) return;
    stopped = true;

    client.off('message.created', messageCreatedHandler);
    client.off('part.created', partCreatedHandler);
    client.off('part.append', partAppendHandler);
    client.off('message.updated', messageUpdatedHandler);
    client.off('permission.request', permissionRequestHandler);
    client.off('error.connection', errorConnectionHandler);
    client.off('disconnected', disconnectedHandler);
    client.off('reconnecting', reconnectingHandler);
    client.off('connected', connectedHandler);
    client.off('session.created', sessionCreatedHandlerWrapper);
    client.off('session.resumed', sessionResumedHandlerWrapper);

    rl.close();
  };

  return {
    stop,
    get sessionId() {
      return currentSessionId;
    },
  };
}
