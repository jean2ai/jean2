import { useState } from 'react';
import type { Session, Preconfig, Workspace, ToolPermission, SubagentStatus } from '@jean2/shared';
import WorkspaceSelector from './WorkspaceSelector';
import PermissionManager from './PermissionManager';

interface Props {
  sessions: Session[];
  preconfigs: Preconfig[];
  currentSession: Session | null;
  connected: boolean;
  onCreateSession: (preconfigId?: string, title?: string) => void;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onPermanentlyDeleteSession: (sessionId: string) => void;
  sessionFilter: 'active' | 'all';
  onSetSessionFilter: (filter: 'active' | 'all') => void;
  
  // Workspace props
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateVirtualWorkspace: () => void;
  onCreatePhysicalWorkspace: (path: string) => void;
  onDeleteWorkspace: (id: string) => void;
  
  // Settings modal props
  showSettings: boolean;
  onToggleSettings: () => void;
  permissions: ToolPermission[];
  onRefreshPermissions: () => void;
  ws: WebSocket | null;
}

export default function SessionList({
  sessions,
  preconfigs,
  currentSession,
  connected,
  onCreateSession,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onPermanentlyDeleteSession,
  sessionFilter,
  onSetSessionFilter,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  onDeleteWorkspace,
  showSettings,
  onToggleSettings,
  permissions,
  onRefreshPermissions,
  ws,
}: Props) {
  const defaultPreconfig = preconfigs.find(p => p.isDefault) || preconfigs[0];
  
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };
  
  // Filter sessions based on the current filter
  const filteredSessions = sessionFilter === 'active' 
    ? sessions.filter(s => s.status === 'active')
    : sessions.filter(s => s.status === 'closed');
  
  const getSubagentStatusIcon = (status: SubagentStatus | null | undefined): string => {
    if (!status) return '';
    switch (status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '';
    }
  };
  
  return (
    <div className="flex flex-col h-full p-3">
      {/* Workspace selector with settings button */}
      <div className="flex items-stretch gap-2 mb-4">
        <div className="flex-1">
          <WorkspaceSelector
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            onCreateVirtualWorkspace={onCreateVirtualWorkspace}
            onCreatePhysicalWorkspace={onCreatePhysicalWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
          />
        </div>
        <button 
          className="bg-[#2a2a2a] border border-[#444] rounded-md text-[#888] cursor-pointer text-base p-0 w-9 h-9 flex items-center justify-center transition-all flex-shrink-0 hover:bg-[#3a3a3a] hover:text-[#e0e0e0] hover:border-[#555]"
          onClick={onToggleSettings}
          title="Workspace Settings"
        >
          ⚙️
        </button>
      </div>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onToggleSettings}>
          <div className="bg-[#2a2a2a] border border-[#444] rounded-lg w-[90%] max-w-[600px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 px-5 border-b border-[#444]">
              <h2 className="text-lg font-semibold m-0 text-[#e0e0e0]">Workspace Settings</h2>
              <button className="bg-none border-none text-[#888] cursor-pointer text-2xl leading-none p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-[#3a3a3a] hover:text-[#f44336]" onClick={onToggleSettings}>×</button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <PermissionManager
                workspaceId={activeWorkspace?.id || ''}
                ws={ws}
                permissions={permissions}
                onRefresh={onRefreshPermissions}
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold">Sessions</h3>
        <span className={`text-xs ${connected ? 'text-[#4caf50]' : 'text-[#f44336]'}`}>
          {connected ? '●' : '○'}
        </span>
      </div>
      
      <button
        className="w-full p-[10px] bg-[#3a3a3a] border border-[#444] rounded-md text-[#e0e0e0] cursor-pointer mb-3 hover:bg-[#4a4a4a] disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => onCreateSession(defaultPreconfig?.id)}
        disabled={!connected}
      >
        + New Session
      </button>
      
      <div className="flex gap-1 mb-2">
        <button 
          className={`flex-1 p-1.5 px-3 bg-[#2a2a2a] border border-[#444] rounded text-[#888] cursor-pointer text-xs hover:bg-[#333] hover:text-[#ccc] ${sessionFilter === 'active' ? 'bg-[#3a3a3a] text-[#e0e0e0] border-[#666]' : ''}`}
          onClick={() => onSetSessionFilter('active')}
        >
          Active
        </button>
        <button 
          className={`flex-1 p-1.5 px-3 bg-[#2a2a2a] border border-[#444] rounded text-[#888] cursor-pointer text-xs hover:bg-[#333] hover:text-[#ccc] ${sessionFilter === 'all' ? 'bg-[#3a3a3a] text-[#e0e0e0] border-[#666]' : ''}`}
          onClick={() => onSetSessionFilter('all')}
        >
          Archived
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredSessions
          .filter(session => !session.parentId) // Only show root sessions
          .map(session => {
            const childSessions = sessions.filter(s => s.parentId === session.id);
            const hasChildren = childSessions.length > 0;
            const isExpanded = expandedSessions.has(session.id);
            const isCurrentSession = currentSession?.id === session.id;
            
            return (
              <div key={session.id} className="mb-1">
                <div
                  className={`flex items-center p-2.5 rounded-md cursor-pointer mb-1 hover:bg-[#333] ${isCurrentSession ? 'bg-[#3a3a3a]' : ''} ${session.status === 'closed' ? 'opacity-60' : ''}`}
                  onClick={() => onResumeSession(session.id)}
                >
                  {hasChildren && (
                    <span 
                      className="w-5 text-[10px] text-[#888] cursor-pointer p-1 mr-1 rounded transition-all flex items-center justify-center hover:bg-[#444] hover:text-[#e0e0e0]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(session.id);
                      }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                  {!hasChildren && <span className="w-5 mr-1 inline-block" />}
                  <span className="flex-1 text-sm truncate">{session.title || 'Untitled'}</span>
                  <span className="text-[11px] text-[#888] mr-2">{session.status}</span>
                  {session.status === 'closed' ? (
                    <>
                      <button
                        className="bg-none border-none text-[#4caf50] cursor-pointer text-sm p-0 hover:text-[#66bb6a]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReopenSession(session.id);
                        }}
                        title="Reopen session"
                      >
                        ↻
                      </button>
                      <button
                        className="bg-none border-none text-[#888] cursor-pointer text-xs p-0 ml-0.5 hover:text-[#f44336]"
                        onClick={(e) => {
                          e.stopPropagation();
                          const sessionTitle = session.title || 'Untitled';
                          if (confirm(`Are you sure you want to permanently delete "${sessionTitle}"?\n\nThis action cannot be undone.`)) {
                            onPermanentlyDeleteSession(session.id);
                          }
                        }}
                        title="Delete permanently"
                      >
                        🗑
                      </button>
                    </>
                  ) : (
                    <button
                      className="bg-none border-none text-[#888] cursor-pointer text-base p-0 hover:text-[#f44336]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseSession(session.id);
                      }}
                      title="Archive session"
                    >
                      ×
                    </button>
                  )}
                </div>
                
                {/* Child sessions (subagents) */}
                {isExpanded && hasChildren && (
                  <div className="ml-4 border-l-2 border-[#444] pl-2">
                    {childSessions.map(child => (
                      <div
                        key={child.id}
                        className={`flex items-center p-2 px-2.5 rounded-md cursor-pointer mb-1 text-sm hover:bg-[#2a2a2a] ${currentSession?.id === child.id ? 'bg-[#2a3a4a]' : ''}`}
                        onClick={() => onResumeSession(child.id)}
                      >
                        <span className="w-5 mr-1 inline-block" />
                        <span className="mr-1.5 text-xs">{getSubagentStatusIcon(child.subagentStatus)}</span>
                        <span className="flex-1 text-sm text-[#aaa] truncate">{child.title || 'Untitled'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
