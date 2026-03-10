import { createApp } from './app';
import { initializePreconfigs, getPreconfig, getDefaultPreconfig } from './core/preconfig';
import { scanTools } from './tools';
import { closeDatabase } from './store';
import type { ServerMessage, ClientMessage, Message, ToolCallBlock, SecurityCheckResult } from '@jean2/shared';
import { createSession, getSession, updateSession, deleteSession } from '@/store';
import { listMessages, createMessage } from '@/store';
import { getWorkspace } from '@/store/workspaces';
import { getWorkspacePermissions, revokePermission, revokeAllWorkspacePermissions } from '@/store/permissions';
import { streamChat } from './core/agent';
import { createPendingApproval, resolveApproval } from './core/approvals';
import { getModelsConfig, findModel } from './config';
import type { ServerWebSocket } from 'bun';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Store connected clients with their session info
const clients = new Map<ServerWebSocket, { sessionId?: string }>();

// Store pending permission requests by toolCallId
const pendingPermissions = new Map<string, { 
  resolve: (result: { allowed: boolean; alwaysAllow: boolean }) => void 
}>();

function getWsForSession(sessionId: string): ServerWebSocket | undefined {
  for (const [ws, data] of clients.entries()) {
    if (data.sessionId === sessionId) {
      return ws;
    }
  }
  return undefined;
}

function broadcast(message: ServerMessage, excludeWs?: ServerWebSocket) {
  const messageStr = JSON.stringify(message);
  for (const [ws] of clients.entries()) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  }
}

async function main() {
  console.log('Starting AI Agent Server...');
  
  // Check available API keys
  const availableProviders: string[] = [];
  if (process.env.LLM_OPENAI_API_KEY) availableProviders.push('openai');
  if (process.env.LLM_ANTHROPIC_API_KEY) availableProviders.push('anthropic');
  if (process.env.LLM_OPENROUTER_API_KEY) availableProviders.push('openrouter');
  if (process.env.LLM_GOOGLE_API_KEY) availableProviders.push('google');

  if (availableProviders.length > 0) {
    console.log(`Available providers: ${availableProviders.join(', ')}`);
    console.log(`Default model: stepfun/step-3.5-flash:free (set via models.json)`);
  } else {
    console.warn('WARNING: No LLM API keys configured. Chat will not work.');
    console.warn('Set at least one of: LLM_OPENAI_API_KEY, LLM_ANTHROPIC_API_KEY, LLM_OPENROUTER_API_KEY, LLM_GOOGLE_API_KEY');
  }
  
  // Initialize preconfigs
  console.log('Initializing preconfigs...');
  await initializePreconfigs();
  
  // Scan for tools
  console.log('Scanning for tools...');
  const tools = await scanTools();
  console.log(`Found ${tools.length} tools: ${tools.map(t => t.definition.name).join(', ')}`);
  
  // Create the app
  const app = createApp();
  
  console.log(`Server starting on http://${HOST}:${PORT}`);
  
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    
    async fetch(req: Request): Promise<Response | undefined> {
      const url = new URL(req.url);
      
      // Handle WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
        return undefined;
      }
      
      // Handle API requests with Hono
      return app.fetch(req);
    },
    
    websocket: {
      open(ws: ServerWebSocket) {
        clients.set(ws, {});
        console.log('Client connected. Total clients:', clients.size);
      },
      
      close(ws: ServerWebSocket) {
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
      },
      
      async message(ws: ServerWebSocket, message: string | Buffer) {
        try {
          const msg: ClientMessage = JSON.parse(message.toString());
          await handleClientMessage(ws, msg);
        } catch (err) {
          console.error('WebSocket message error:', err);
          ws.send(JSON.stringify({ type: 'error', code: 'parse_error', message: String(err) }));
        }
      },
    },
  });
  
  console.log(`AI Agent Server running at http://${HOST}:${PORT}`);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.stop();
    closeDatabase();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    server.stop();
    closeDatabase();
    process.exit(0);
  });
}

function send(ws: ServerWebSocket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

async function handleClientMessage(ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'session.create': {
      const session = createSession({
        id: crypto.randomUUID(),
        workspaceId: msg.workspaceId || '',
        preconfigId: msg.preconfigId || null,
        title: msg.title || 'New Session',
        status: 'active',
        metadata: null,
        parentId: null,
        agentName: null,
      });
      clients.set(ws, { sessionId: session.id });
      send(ws, { type: 'session.created', session });
      break;
    }
    
    case 'session.resume': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      clients.set(ws, { sessionId: session.id });
      send(ws, { 
        type: 'session.resumed', 
        session,
        usage: session.totalTokens ? {
          promptTokens: session.promptTokens ?? 0,
          completionTokens: session.completionTokens ?? 0,
          totalTokens: session.totalTokens ?? 0,
        } : undefined,
      });
      break;
    }

    case 'session.update': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updates: { preconfigId?: string } = {};
      if (msg.preconfigId !== undefined) {
        updates.preconfigId = msg.preconfigId;
      }
      const updated = updateSession(msg.sessionId, updates);
      send(ws, { type: 'session.updated', session: updated! });
      break;
    }

    case 'session.update_model': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updated = updateSession(msg.sessionId, { 
        selectedModel: msg.modelId,
        selectedProvider: msg.providerId 
      });
      send(ws, { type: 'session.updated', session: updated! });
      break;
    }
    
    case 'session.close': {
      updateSession(msg.sessionId, { status: 'closed' });
      send(ws, { type: 'session.closed', sessionId: msg.sessionId });
      break;
    }

    case 'session.reopen': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const updated = updateSession(msg.sessionId, { status: 'active' });
      send(ws, { type: 'session.reopened', session: updated! });
      break;
    }

    case 'session.delete': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      deleteSession(msg.sessionId);
      send(ws, { type: 'session.deleted', sessionId: msg.sessionId });
      break;
    }

    case 'session.rename': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const trimmedTitle = msg.title?.trim() ?? '';
      if (!trimmedTitle) {
        send(ws, { type: 'error', code: 'invalid_title', message: 'Title cannot be empty' });
        break;
      }
      const updatedSession = updateSession(msg.sessionId, { title: trimmedTitle });
      broadcast({ type: 'session.renamed', session: updatedSession! });
      break;
    }
    
    case 'chat.message': {
      await handleChat(ws, msg.sessionId, msg.content);
      break;
    }
    
    case 'tool.approval': {
      const resolved = resolveApproval(msg.toolCallId, msg.approved);
      if (!resolved) {
        console.warn('tool.approval received for unknown or expired toolCallId:', msg.toolCallId);
      }
      break;
    }
    
    case 'permission.response': {
      const pending = pendingPermissions.get(msg.toolCallId);
      if (pending) {
        pendingPermissions.delete(msg.toolCallId);
        pending.resolve({ allowed: msg.allowed, alwaysAllow: msg.alwaysAllow });
      } else {
        console.warn('permission.response received for unknown toolCallId:', msg.toolCallId);
      }
      break;
    }

    case 'permission.list': {
      const permissions = getWorkspacePermissions(msg.workspaceId, msg.includeRevoked);
      send(ws, { type: 'permission.list', workspaceId: msg.workspaceId, permissions });
      break;
    }

    case 'permission.revoke': {
      revokePermission(msg.permissionId, null);
      send(ws, { type: 'permission.revoked', permissionId: msg.permissionId });
      break;
    }

    case 'permission.revoke_all': {
      const count = revokeAllWorkspacePermissions(msg.workspaceId, null);
      send(ws, { type: 'permission.all_revoked', workspaceId: msg.workspaceId, count });
      break;
    }
    
    default:
      send(ws, { type: 'error', code: 'unknown_message', message: 'Unknown message type' });
  }
}

async function handleChat(ws: ServerWebSocket, sessionId: string, content: string) {
  const session = getSession(sessionId);
  if (!session) {
    send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }
  
  // Prevent sending messages to closed/archived sessions
  if (session.status === 'closed') {
    send(ws, { type: 'error', code: 'session_closed', message: 'Cannot send messages to an archived session. Reopen it first.' });
    return;
  }
  
  // Get workspace path for tool execution
  const workspace = session.workspaceId ? getWorkspace(session.workspaceId) : null;
  const workspacePath = workspace?.path;
  
  // Get preconfig (for default model)
  const preconfig = session.preconfigId 
    ? await getPreconfig(session.preconfigId)
    : await getDefaultPreconfig();

  if (!preconfig) {
    send(ws, { type: 'error', code: 'no_preconfig', message: 'No preconfig found' });
    return;
  }

  // Get the default model from config
  const config = getModelsConfig();
  const configDefaultModel = config.defaultModel;

  // Determine which model and provider will be used:
  // session > preconfig > config default
  const modelId = session.selectedModel || preconfig?.model || configDefaultModel;
  const provider = session.selectedProvider || 
                  (preconfig?.model ? findProviderFromModel(preconfig.model) : null) || 
                  config.defaultProvider;

  // Helper function to find provider from model (for preconfig fallback)
  function findProviderFromModel(m: string): string {
    const modelInfo = findModel(m);
    if (modelInfo) return modelInfo.providerId;
    // Fallback parsing
    if (m.includes('/')) return 'openrouter';
    if (m.startsWith('claude-')) return 'anthropic';
    if (m.startsWith('gemini-')) return 'google';
    return 'openai';
  }
  
  // Map provider to API key env var
  type Provider = 'openai' | 'anthropic' | 'openrouter' | 'google';
  const apiKeyEnvMap: Record<Provider, string> = {
    'openai': 'LLM_OPENAI_API_KEY',
    'anthropic': 'LLM_ANTHROPIC_API_KEY',
    'openrouter': 'LLM_OPENROUTER_API_KEY',
    'google': 'LLM_GOOGLE_API_KEY',
  };
  const apiKeyEnv = apiKeyEnvMap[provider as Provider];
  
  if (!process.env[apiKeyEnv]) {
    send(ws, { type: 'error', code: 'no_api_key', message: `No API key configured for provider: ${provider}. Set ${apiKeyEnv}` });
    return;
  }
  
  // Store user message
  const userMsgId = crypto.randomUUID();
  createMessage({
    id: userMsgId,
    sessionId,
    role: 'user',
    content: [{ type: 'text', text: content }],
  });
  
  // Broadcast user message to all clients
  broadcast({
    type: 'chat.user_message',
    sessionId,
    message: {
      id: userMsgId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      createdAt: new Date().toISOString(),
    }
  });
  
  // Get message history
  const history = listMessages(sessionId);
  
  // Generate assistant message ID
  const assistantMsgId = crypto.randomUUID();
  
  // Send chat start
  broadcast({ type: 'chat.start', sessionId, messageId: assistantMsgId });

  // Create approval callback that communicates with client
  const onToolApprovalRequired = async (toolCall: ToolCallBlock, dangerous: boolean): Promise<boolean> => {
    // Send approval request to client
    const clientWs = getWsForSession(sessionId);
    
    if (clientWs) {
      send(clientWs, {
        type: 'tool.approval_required',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
        dangerous,
      });
    } else {
      console.warn('Could not find client WebSocket for session:', sessionId);
    }
    
    // Wait for client response
    return createPendingApproval(toolCall, dangerous);
  };

  // Permission request callback for new security system
  const onPermissionRequest = async (
    toolName: string,
    args: Record<string, unknown>,
    securityResult: SecurityCheckResult
  ): Promise<{ allowed: boolean; alwaysAllow: boolean }> => {
    // Generate a unique ID for this permission request
    const toolCallId = crypto.randomUUID();
    
    // Send permission request to client
    const clientWs = getWsForSession(sessionId);
    
    if (clientWs) {
      send(clientWs, {
        type: 'permission.request',
        sessionId,
        toolCallId,
        toolName,
        args,
        permissionType: securityResult.permissionType,
        permissionKey: securityResult.permissionKey,
        message: securityResult.message,
        details: securityResult.details,
      });
    } else {
      console.warn('Could not find client WebSocket for session:', sessionId);
      return { allowed: false, alwaysAllow: false };
    }
    
    // Wait for client response
    return new Promise((resolve) => {
      pendingPermissions.set(toolCallId, { resolve });
      
      // Set timeout (5 minutes)
      setTimeout(() => {
        const pending = pendingPermissions.get(toolCallId);
        if (pending) {
          pendingPermissions.delete(toolCallId);
          resolve({ allowed: false, alwaysAllow: false });
        }
      }, 5 * 60 * 1000);
    });
  };

  try {
    // Stream the response
    for await (const event of streamChat({
      sessionId,
      preconfig,
      messages: history,
      onToolApprovalRequired,
      onPermissionRequest,
      modelId: modelId,
      providerId: provider,
      workspacePath,
      workspaceId: session.workspaceId || undefined,
    })) {
      switch (event.type) {
        case 'delta':
          broadcast({ type: 'chat.delta', sessionId, messageId: assistantMsgId, delta: event.content });
          break;
          
        case 'tool_call':
          broadcast({ type: 'chat.tool_call', sessionId, messageId: assistantMsgId, toolCall: event.toolCall });
          break;
          
        case 'tool_result':
          broadcast({ 
            type: 'chat.tool_result', 
            sessionId, 
            messageId: assistantMsgId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result 
          });
          break;
          
        case 'usage': {
          broadcast({ 
            type: 'chat.usage', 
            sessionId, 
            usage: event.usage,
            model: event.model,
          });
          // Persist usage to database
          const currentSession = getSession(sessionId);
          if (currentSession) {
            updateSession(sessionId, {
              promptTokens: (currentSession.promptTokens ?? 0) + event.usage.promptTokens,
              completionTokens: (currentSession.completionTokens ?? 0) + event.usage.completionTokens,
              totalTokens: (currentSession.totalTokens ?? 0) + event.usage.totalTokens,
            });
          }
          break;
        }
        
        case 'complete': {
          // Store assistant message
          const assistantMessage: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: event.message.content,
            createdAt: event.message.createdAt,
          };
          createMessage({
            id: assistantMsgId,
            sessionId,
            role: 'assistant',
            content: event.message.content,
          });
          broadcast({ type: 'chat.complete', sessionId, message: assistantMessage });
          break;
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    console.error('Chat error:', err);
    send(ws, { type: 'error', code: 'chat_error', message });
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
