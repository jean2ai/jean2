import { useState, useRef, useEffect } from 'react';
import type { Session, Preconfig, MessageWithParts, PermissionType } from '@jean2/shared';
import MessageComponent from '@/components/Message';
import TokenUsage from '@/components/TokenUsage';
import ModelSelector from '@/components/ModelSelector';
import PermissionRequestBlock from '@/components/PermissionRequestBlock';

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
    <div className="flex flex-col h-full">
      <header className="flex justify-between items-center px-5 py-4 border-b border-surface-600">
        <div className="flex items-center gap-3">
          {session.parentId && onNavigateBack && (
            <button
              className="bg-surface-700 border border-surface-500 rounded-md text-accent cursor-pointer text-sm px-3 py-1.5 mr-2 transition-all duration-200 whitespace-nowrap hover:bg-surface-600 hover:border-accent"
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
              className="text-lg font-semibold px-2 py-1 -m-1 bg-surface-700 border border-accent rounded text-text-primary outline-none min-w-[200px]"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <h2 
              className="cursor-pointer px-2 py-1 -m-1 rounded transition-colors duration-150 hover:bg-white/5"
              onDoubleClick={handleTitleDoubleClick}
            >
              {session.title || 'Untitled Session'}
            </h2>
          )}
          <span className="text-xs text-text-disabled font-mono">{session.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#252525] border border-[#383838] rounded-lg px-3 py-1.5 gap-2">
            <TokenUsage
              promptTokens={usage.promptTokens}
              completionTokens={usage.completionTokens}
              totalTokens={usage.totalTokens}
              modelName={modelName}
              contextWindow={contextWindow}
            />
          </div>
          <div className="flex items-center bg-[#252525] border border-[#383838] rounded-lg px-3 py-1.5 gap-2">
            <ModelSelector
              models={models}
              selectedModelId={selectedModel}
              onChangeModel={(modelId, providerId) => onChangeModel(modelId, providerId)}
            />
          </div>
          <div className="flex items-center bg-[#252525] border border-[#383838] rounded-lg px-3 py-1.5 gap-2">
            <label className="flex items-center gap-2">
              <span className="text-sm text-text-dim">Preconfig:</span>
              <select 
                value={session.preconfigId || ''} 
                onChange={(e) => onChangePreconfig(e.target.value)}
                className="px-2.5 py-1.5 bg-surface-700 border border-surface-500 rounded-md text-text-primary text-sm cursor-pointer focus:outline-none focus:border-accent"
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
      
      <div className="flex-1 overflow-y-auto p-5">
        {session.status === 'closed' && (
          <div className="flex flex-col items-center p-3 bg-[#3d3520] border-b border-[#5a4d2e] text-[#d4a84b] text-sm">
            <span>This session is archived</span>
            <span className="text-[11px] text-[#9a8a4b] mt-1">You can reopen it from the sessions panel</span>
          </div>
        )}
        {messagesWithParts.length === 0 ? (
          <div className="text-text-disabled text-center p-10">
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
          <div className="mt-4">
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
        <form className="flex p-5 border-t border-surface-600 gap-3" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            autoFocus
            className="flex-1 px-4 py-3 bg-surface-700 border border-surface-500 rounded-lg text-text-primary text-sm focus:outline-none focus:border-text-disabled"
          />
          <button 
            type="submit"
            className="px-6 py-3 bg-accent border-none rounded-lg text-white text-sm cursor-pointer hover:bg-accent-hover"
          >
            Send
          </button>
        </form>
      )}

      {session.parentId && (
        <div className="flex items-center justify-center gap-2 p-5 border-t border-surface-600 bg-[#252525]">
          <span className="text-base opacity-70">🔒</span>
          <span className="text-sm text-text-dim italic">This is a subagent session (read-only)</span>
        </div>
      )}
    </div>
  );
}
