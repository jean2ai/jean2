import { useState, useEffect, useCallback, useRef } from 'react';
import type { 
  Session, 
  Message, 
  Part,
  MessageWithParts,
  ServerMessage, 
  ClientMessage, 
  Preconfig, 
  Workspace, 
  ToolPermission 
} from '@jean2/shared';
import SessionList from '@/components/SessionList';
import ChatView from '@/components/ChatView';
import './App.css';

interface PendingPermissionRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: string;
  permissionKey?: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  childSessionId?: string;
  subagentName?: string;
}

const WS_URL = `ws://${window.location.hostname}:3000/ws`;
const API_URL = `http://${window.location.hostname}:3000/api`;

type ClientMessagePayload = 
  | { preconfigId?: string; title?: string; workspaceId?: string }
  | { sessionId: string }
  | { sessionId: string; content: string }
  | { toolCallId: string; approved: boolean }
  | { sessionId: string; preconfigId?: string }
  | { sessionId: string; modelId: string; providerId: string }
  | { toolCallId: string; allowed: boolean; alwaysAllow: boolean }
  | { workspaceId: string; includeRevoked?: boolean }
  | { permissionId: string }
  | { workspaceId: string };

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [preconfigs, setPreconfigs] = useState<Preconfig[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({});
  const [partsBySession, setPartsBySession] = useState<Record<string, Record<string, Part[]>>>({});
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionUsage, setSessionUsage] = useState<{ 
    promptTokens: number; 
    completionTokens: number; 
    totalTokens: number 
  }>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  const [currentModel, setCurrentModel] = useState<string>('gpt-4o');
  const [models, setModels] = useState<Array<{
    id: string;
    name: string;
    contextWindow: number;
    tier: 'budget' | 'standard' | 'premium';
    providerId: string;
    providerName: string;
  }>>([]);
  const [defaultModel, setDefaultModel] = useState<string>('gpt-4o');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [sessionFilter, setSessionFilter] = useState<'active' | 'all'>('active');
  const [showSettings, setShowSettings] = useState(false);

  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermissionRequest[]>([]);

  const handleServerMessageRef = useRef<((msg: ServerMessage) => void) | null>(null);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    const messages = messagesBySession[sessionId] || [];
    const partsMap = partsBySession[sessionId] || {};
    
    return messages.map(message => ({
      message,
      parts: (partsMap[message.id] || []).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [messagesBySession, partsBySession]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    
    socket.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };
    
    socket.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected');
    };
    
    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      handleServerMessageRef.current?.(msg);
    };
    
    setWs(socket);
    
    return () => socket.close();
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/sessions`)
      .then(res => res.json())
      .then(data => setSessions(data.sessions || []))
      .catch(console.error);
    
    fetch(`${API_URL}/preconfigs`)
      .then(res => res.json())
      .then(data => setPreconfigs(data.preconfigs || []))
      .catch(console.error);

    fetch(`${API_URL}/models`)
      .then(res => res.json())
      .then(data => {
        setModels(data.models || []);
        setDefaultModel(data.defaultModel || 'gpt-4o');
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/workspaces`)
      .then(res => res.json())
      .then(data => {
        setWorkspaces(data.workspaces);
        const savedId = localStorage.getItem('activeWorkspaceId');
        const saved = data.workspaces.find((w: Workspace) => w.id === savedId);
        setActiveWorkspace(saved || data.workspaces[0]);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspaceId', activeWorkspace.id);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    const saved = localStorage.getItem('sessionFilter');
    if (saved === 'active' || saved === 'all') {
      setSessionFilter(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sessionFilter', sessionFilter);
  }, [sessionFilter]);


  const createWorkspace = async (name: string, path: string, isVirtual: boolean) => {
    const res = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, isVirtual }),
    });
    const data = await res.json();
    setWorkspaces(prev => [...prev, data.workspace]);
    return data.workspace;
  };

  const selectWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setCurrentSession(null);
  };

  const deleteWorkspace = async (id: string) => {
    await fetch(`${API_URL}/workspaces/${id}`, { method: 'DELETE' });
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(workspaces[0] || null);
    }
  };

  const handleCreateVirtualWorkspace = async () => {
    const name = `Workspace ${workspaces.length + 1}`;
    const path = `~/.jean2/workspaces/${crypto.randomUUID()}`;
    await createWorkspace(name, path, true);
  };

  const handleCreatePhysicalWorkspace = async (path: string) => {
    const name = path.split('/').pop() || path.split('\\').pop() || 'Workspace';
    await createWorkspace(name, path, false);
  };

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'session.created':
        setSessions(prev => [msg.session, ...prev]);
        setCurrentSession(msg.session);
        setMessagesBySession(prev => ({
          ...prev,
          [msg.session.id]: []
        }));
        setPartsBySession(prev => ({
          ...prev,
          [msg.session.id]: {}
        }));
        setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        setCurrentModel(defaultModel);
        break;
      
      case 'session.resumed':
        setCurrentSession(msg.session);
        
        if (msg.messages) {
          setMessagesBySession(prev => ({
            ...prev,
            [msg.session.id]: msg.messages.map(mwp => mwp.message)
          }));
          setPartsBySession(prev => {
            const newParts: Record<string, Record<string, Part[]>> = { ...prev };
            newParts[msg.session.id] = {};
            for (const mwp of msg.messages) {
              newParts[msg.session.id][mwp.message.id] = mwp.parts;
            }
            return newParts;
          });
        }
        
        setSessionUsage(msg.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        setCurrentModel(msg.session.selectedModel || defaultModel);
        break;
      
      case 'message.created':
        setMessagesBySession(prev => ({
          ...prev,
          [msg.message.sessionId]: [...(prev[msg.message.sessionId] || []), msg.message]
        }));
        setPartsBySession(prev => ({
          ...prev,
          [msg.message.sessionId]: {
            ...prev[msg.message.sessionId],
            [msg.message.id]: []
          }
        }));
        break;

      case 'message.updated':
        setMessagesBySession(prev => ({
          ...prev,
          [msg.message.sessionId]: (prev[msg.message.sessionId] || []).map(m => 
            m.id === msg.message.id ? msg.message : m
          )
        }));
        break;

      case 'part.created':
        setPartsBySession(prev => {
          const sessionParts = prev[msg.sessionId] || {};
          const messageParts = sessionParts[msg.part.messageId] || [];
          return {
            ...prev,
            [msg.sessionId]: {
              ...sessionParts,
              [msg.part.messageId]: [...messageParts, msg.part]
            }
          };
        });
        break;

      case 'part.updated':
        setPartsBySession(prev => {
          const sessionParts = prev[msg.sessionId] || {};
          const messageParts = sessionParts[msg.part.messageId] || [];
          return {
            ...prev,
            [msg.sessionId]: {
              ...sessionParts,
              [msg.part.messageId]: messageParts.map(p => p.id === msg.part.id ? msg.part : p)
            }
          };
        });
        break;

      case 'part.append':
        setPartsBySession(prev => {
          const sessionParts = prev[msg.sessionId] || {};
          
          for (const messageId of Object.keys(sessionParts)) {
            const parts = sessionParts[messageId];
            const partIndex = parts.findIndex(p => p.id === msg.partId);
            if (partIndex !== -1) {
              const existingPart = parts[partIndex];
              if (existingPart.type === 'text' || existingPart.type === 'reasoning') {
                const updatedParts = [...parts];
                updatedParts[partIndex] = {
                  ...existingPart,
                  text: existingPart.text + msg.delta
                };
                return {
                  ...prev,
                  [msg.sessionId]: {
                    ...sessionParts,
                    [messageId]: updatedParts
                  }
                };
              }
            }
          }
          return prev;
        });
        break;
      
      case 'chat.usage':
        if (msg.sessionId !== currentSession?.id) return;
        setSessionUsage({
          promptTokens: msg.usage.promptTokens,
          completionTokens: msg.usage.completionTokens,
          totalTokens: msg.usage.totalTokens,
        });
        setCurrentModel(msg.model);
        break;
      
      case 'error':
        console.error('Server error:', msg.code, msg.message);
        break;
      
      case 'session.closed':
        setSessions(prev => prev.map(s => 
          s.id === msg.sessionId ? { ...s, status: 'closed' } : s
        ));
        setMessagesBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        setPartsBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        if (currentSession?.id === msg.sessionId) {
          setCurrentSession(null);
        }
        break;

      case 'session.reopened':
        setSessions(prev => prev.map(s => 
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
        }
        setSessionFilter('active');
        break;

      case 'session.deleted':
        setSessions(prev => prev.filter(s => s.id !== msg.sessionId));
        setMessagesBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        setPartsBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        if (currentSession?.id === msg.sessionId) {
          setCurrentSession(null);
        }
        break;

      case 'session.updated':
        setSessions(prev => prev.map(s => 
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
        }
        break;

      case 'session.renamed':
        setSessions(prev => prev.map(s => 
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
        }
        break;

      case 'permission.list':
        setPermissions(msg.permissions);
        break;

      case 'permission.revoked':
        setPermissions(prev => prev.map(p => 
          p.id === msg.permissionId ? { ...p, revokedAt: new Date().toISOString() } : p
        ));
        break;

      case 'permission.all_revoked':
        setPermissions(prev => {
          const now = new Date().toISOString();
          return prev.map(p => ({ ...p, revokedAt: now }));
        });
        break;

      case 'permission.request': {
        const request: PendingPermissionRequest = {
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          args: msg.args,
          permissionType: msg.permissionType,
          permissionKey: msg.permissionKey,
          message: msg.message,
          details: msg.details,
          dangerous: msg.dangerous,
          childSessionId: msg.childSessionId,
          subagentName: msg.subagentName,
        };
        setPendingPermissions(prev => [...prev, request]);
        break;
      }

      case 'permission.granted':
        setPendingPermissions(prev => prev.filter(p => p.toolCallId !== msg.toolCallId));
        break;
    }
  }, [currentSession, defaultModel]);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  const sendMessage = useCallback((type: ClientMessage['type'], payload: ClientMessagePayload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }, [ws]);

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    sendMessage('session.create', { preconfigId, title, workspaceId: activeWorkspace?.id });
  }, [sendMessage, activeWorkspace]);

  const resumeSession = useCallback((sessionId: string) => {
    // Clear pending permissions from previous session
    setPendingPermissions([]);
    sendMessage('session.resume', { sessionId });
  }, [sendMessage]);

  const closeSession = useCallback((sessionId: string) => {
    sendMessage('session.close', { sessionId });
  }, [sendMessage]);

  const reopenSession = useCallback((sessionId: string) => {
    sendMessage('session.reopen', { sessionId });
  }, [sendMessage]);

  const permanentlyDeleteSession = useCallback((sessionId: string) => {
    sendMessage('session.delete', { sessionId });
  }, [sendMessage]);

  const updateSessionPreconfig = useCallback((preconfigId: string) => {
    if (currentSession) {
      sendMessage('session.update', { sessionId: currentSession.id, preconfigId });
    }
  }, [currentSession, sendMessage]);

  const updateSessionModel = useCallback((modelId: string, providerId: string) => {
    if (currentSession) {
      sendMessage('session.update_model', { sessionId: currentSession.id, modelId, providerId });
    }
  }, [currentSession, sendMessage]);

  const handleRenameSession = useCallback((sessionId: string, title: string) => {
    sendMessage('session.rename', { sessionId, title });
  }, [sendMessage]);

  const sendChatMessage = useCallback((content: string) => {
    if (currentSession) {
      sendMessage('chat.message', { sessionId: currentSession.id, content });
    }
  }, [currentSession, sendMessage]);

  const handlePermissionResponse = useCallback((toolCallId: string, allowed: boolean, alwaysAllow: boolean) => {
    // Remove from pending list
    setPendingPermissions(prev => prev.filter(p => p.toolCallId !== toolCallId));
    
    sendMessage('permission.response', {
      toolCallId,
      allowed,
      alwaysAllow,
    });
  }, [sendMessage]);

  const refreshPermissions = useCallback(() => {
    if (activeWorkspace) {
      sendMessage('permission.list', { workspaceId: activeWorkspace.id });
    }
  }, [activeWorkspace, sendMessage]);

  const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const messagesWithParts = currentSession ? getMessagesWithParts(currentSession.id) : [];

  return (
    <div className="app">
      <aside className="sidebar">
        <SessionList
          sessions={workspaceSessions}
          preconfigs={preconfigs}
          currentSession={currentSession}
          connected={connected}
          onCreateSession={createSession}
          onResumeSession={resumeSession}
          onCloseSession={closeSession}
          
          sessionFilter={sessionFilter}
          onSetSessionFilter={setSessionFilter}
          onReopenSession={reopenSession}
          onPermanentlyDeleteSession={permanentlyDeleteSession}
          
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={selectWorkspace}
          onCreateVirtualWorkspace={handleCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={handleCreatePhysicalWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(!showSettings)}
          permissions={permissions}
          onRefreshPermissions={refreshPermissions}
          ws={ws}
        />
      </aside>
      <main className="main">
        {currentSession ? (
          <>
            <ChatView
              session={currentSession}
              messagesWithParts={messagesWithParts}
              preconfigs={preconfigs}
              models={models}
              defaultModel={defaultModel}
              onSendMessage={sendChatMessage}
              onChangePreconfig={updateSessionPreconfig}
              onChangeModel={updateSessionModel}
              pendingPermissions={pendingPermissions}
              onPermissionResponse={handlePermissionResponse}
              onRename={handleRenameSession}
              usage={sessionUsage}
              modelName={currentModel}
            />
          </>
        ) : (
          <div className="empty-state">
            <h2>Select or create a session</h2>
            <p>Choose a session from the sidebar or create a new one to start chatting.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
