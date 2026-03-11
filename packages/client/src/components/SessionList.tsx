import { useState } from 'react';
import type { Session, Preconfig, Workspace, ToolPermission, SubagentStatus } from '@jean2/shared';
import WorkspaceSelector from './WorkspaceSelector';
import PermissionManager from './PermissionManager';
import './SessionList.css';

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
    <div className="session-list">
      {/* Workspace selector with settings button */}
      <div className="workspace-header">
        <WorkspaceSelector
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onCreateVirtualWorkspace={onCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={onCreatePhysicalWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
        />
        <button 
          className="settings-btn"
          onClick={onToggleSettings}
          title="Workspace Settings"
        >
          ⚙️
        </button>
      </div>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-backdrop" onClick={onToggleSettings}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Workspace Settings</h2>
              <button className="modal-close" onClick={onToggleSettings}>×</button>
            </div>
            <div className="modal-body">
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
      
      <div className="session-list-header">
        <h3>Sessions</h3>
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '●' : '○'}
        </span>
      </div>
      
      <button
        className="new-session-btn"
        onClick={() => onCreateSession(defaultPreconfig?.id)}
        disabled={!connected}
      >
        + New Session
      </button>
      
      <div className="session-tabs">
        <button 
          className={`session-tab ${sessionFilter === 'active' ? 'active' : ''}`}
          onClick={() => onSetSessionFilter('active')}
        >
          Active
        </button>
        <button 
          className={`session-tab ${sessionFilter === 'all' ? 'active' : ''}`}
          onClick={() => onSetSessionFilter('all')}
        >
          Archived
        </button>
      </div>
      
      <div className="sessions">
        {filteredSessions
          .filter(session => !session.parentId) // Only show root sessions
          .map(session => {
            const childSessions = sessions.filter(s => s.parentId === session.id);
            const hasChildren = childSessions.length > 0;
            const isExpanded = expandedSessions.has(session.id);
            const isCurrentSession = currentSession?.id === session.id;
            
            return (
              <div key={session.id} className="session-item-group">
                <div
                  className={`session-item ${isCurrentSession ? 'active' : ''} ${session.status === 'closed' ? 'archived' : ''}`}
                  onClick={() => onResumeSession(session.id)}
                >
                  {hasChildren && (
                    <span 
                      className="session-expand"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(session.id);
                      }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                  {!hasChildren && <span className="session-expand-spacer" />}
                  <span className="session-title">{session.title || 'Untitled'}</span>
                  <span className="session-status">{session.status}</span>
                  {session.status === 'closed' ? (
                    <>
                      <button
                        className="reopen-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReopenSession(session.id);
                        }}
                        title="Reopen session"
                      >
                        ↻
                      </button>
                      <button
                        className="delete-btn"
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
                      className="close-btn"
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
                  <div className="session-children">
                    {childSessions.map(child => (
                      <div
                        key={child.id}
                        className={`session-item session-child ${currentSession?.id === child.id ? 'active' : ''}`}
                        onClick={() => onResumeSession(child.id)}
                      >
                        <span className="session-expand-spacer" />
                        <span className="session-status-icon">{getSubagentStatusIcon(child.subagentStatus)}</span>
                        <span className="session-title">{child.title || 'Untitled'}</span>
                        {/* Children are read-only, no close/reopen buttons */}
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
