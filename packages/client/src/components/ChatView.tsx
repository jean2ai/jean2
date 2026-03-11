import { useState, useRef, useEffect } from 'react';
import type { Session, Preconfig, MessageWithParts, PermissionType } from '@jean2/shared';
import MessageComponent from '@/components/Message';
import TokenUsage from '@/components/TokenUsage';
import ModelSelector from '@/components/ModelSelector';
import PermissionRequestBlock from '@/components/PermissionRequestBlock';
import './ChatView.css';

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

interface Props {
  session: Session;
  messagesWithParts: MessageWithParts[];
  preconfigs: Preconfig[];
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    tier: 'budget' | 'standard' | 'premium';
    providerId: string;
    providerName: string;
  }>;
  defaultModel: string;
  onSendMessage: (content: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onRename: (sessionId: string, title: string) => void;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  onNavigateToSubagent?: (sessionId: string) => void;
  onNavigateBack?: () => void;
}

export default function ChatView({ session, messagesWithParts, preconfigs, models, defaultModel, onSendMessage, onChangePreconfig, onChangeModel, pendingPermissions, onPermissionResponse, onRename, usage, modelName, onNavigateToSubagent, onNavigateBack }: Props) {
  const [input, setInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [titleInputRef, setTitleInputRef] = useState<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Determine which model to show as selected
  const selectedModel = session.selectedModel || 
    preconfigs.find(p => p.id === session.preconfigId)?.model || 
    defaultModel;
  
  // Find the current model's context window from the models array
  // Use selectedModel (derived from session/preconfig/defaultModel) for consistency
  const currentModelInfo = models.find(m => m.id === selectedModel);
  const contextWindow = currentModelInfo?.contextWindow;
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesWithParts]);
  
  // Auto-focus and select text when entering edit mode
  useEffect(() => {
    if (isEditing && titleInputRef) {
      titleInputRef.focus();
      titleInputRef.select();
    }
  }, [isEditing, titleInputRef]);
  
  const handleTitleDoubleClick = () => {
    setEditTitle(session.title || '');
    setIsEditing(true);
  };
  
  const handleTitleSubmit = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== session.title) {
      onRename(session.id, trimmedTitle);
    }
    setIsEditing(false);
  };
  
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };
  
  // Find permissions without matching tool parts (from subagents)
  const orphanedPermissions = pendingPermissions.filter(p => {
    const hasMatchingPart = messagesWithParts.some(mwp =>
      mwp.parts.some(part =>
        part.type === 'tool' &&
        'callId' in part &&
        part.callId === p.toolCallId
      )
    );
    return !hasMatchingPart;
  });
  
  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="chat-header-left">
          {session.parentId && onNavigateBack && (
            <button
              className="back-to-parent-btn"
              onClick={onNavigateBack}
              title="Back to parent session"
            >
              ← Back
            </button>
          )}
          {isEditing ? (
            <input
              ref={setTitleInputRef}
              type="text"
              className="chat-header-title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <h2 
              className="chat-header-title" 
              onDoubleClick={handleTitleDoubleClick}
            >
              {session.title || 'Untitled Session'}
            </h2>
          )}
          <span className="session-id">{session.id.slice(0, 8)}</span>
        </div>
        <div className="chat-header-right">
          <div className="header-control">
            <TokenUsage
              promptTokens={usage.promptTokens}
              completionTokens={usage.completionTokens}
              totalTokens={usage.totalTokens}
              modelName={modelName}
              contextWindow={contextWindow}
            />
          </div>
          <div className="header-control">
            <ModelSelector
              models={models}
              selectedModelId={selectedModel}
              onChangeModel={(modelId, providerId) => onChangeModel(modelId, providerId)}
            />
          </div>
          <div className="header-control">
            <label className="preconfig-selector">
              <span className="preconfig-label">Preconfig:</span>
              <select 
                value={session.preconfigId || ''} 
                onChange={(e) => onChangePreconfig(e.target.value)}
              >
                {preconfigs.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>
      
      <div className="messages">
        {session.status === 'closed' && (
          <div className="archived-banner">
            <span>This session is archived</span>
            <span className="archived-hint">You can reopen it from the sessions panel</span>
          </div>
        )}
        {messagesWithParts.length === 0 ? (
          <div className="no-messages">
            Start a conversation by sending a message below.
          </div>
        ) : (
          messagesWithParts.map(mwp => (
            <MessageComponent 
              key={mwp.message.id} 
              message={mwp.message}
              parts={mwp.parts}
              pendingPermissions={pendingPermissions}
              onPermissionResponse={onPermissionResponse}
              onNavigateToSubagent={onNavigateToSubagent}
            />
          ))
        )}
        {orphanedPermissions.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            {orphanedPermissions.map(p => (
              <div key={p.toolCallId}>
                <PermissionRequestBlock
                  toolName={p.toolName}
                  args={p.args}
                  permissionType={p.permissionType as PermissionType}
                  permissionKey={p.permissionKey || ''}
                  message={p.message}
                  details={p.details}
                  dangerous={p.dangerous}
                  subagentName={p.subagentName}
                  onApprove={() => onPermissionResponse(p.toolCallId, true, false)}
                  onDeny={() => onPermissionResponse(p.toolCallId, false, false)}
                />
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {session.status === 'active' && !session.parentId && (
        <form className="input-area" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            autoFocus
          />
          <button type="submit">Send</button>
        </form>
      )}

      {session.parentId && (
        <div className="subagent-read-only">
          <span className="read-only-icon">🔒</span>
          <span className="read-only-text">This is a subagent session (read-only)</span>
        </div>
      )}
    </div>
  );
}
