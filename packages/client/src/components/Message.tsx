import { useState, useEffect } from 'react';
import type { Message as MessageType, Part, ToolPart } from '@jean2/shared';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import PermissionRequestBlock from '@/components/PermissionRequestBlock';
import type { PermissionType } from '@jean2/shared';
import './Message.css';

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
  message: MessageType;
  parts: Part[];
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
}

export default function Message({ message, parts, pendingPermissions, onPermissionResponse, onNavigateToSubagent }: Props) {
  const roleClass = message.role === 'user' ? 'user' : 'assistant';

  return (
    <div className={`message ${roleClass}`}>
      <div className="message-role">{message.role}</div>
      <div className="message-content">
        {parts.length === 0 ? (
          <div className="text-block">
            <MarkdownRenderer>{'...'}</MarkdownRenderer>
          </div>
        ) : (
          parts.map((part) => (
            <PartComponent
              key={part.id}
              part={part}
              pendingPermissions={pendingPermissions}
              onPermissionResponse={onPermissionResponse}
              onNavigateToSubagent={onNavigateToSubagent}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PartComponent({ part, pendingPermissions, onPermissionResponse, onNavigateToSubagent }: {
  part: Part;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
}) {
  switch (part.type) {
    case 'text':
      return (
        <div className="text-block">
          <MarkdownRenderer>{part.text || '...'}</MarkdownRenderer>
        </div>
      );

    case 'reasoning':
      return (
        <div className="reasoning-block">
          <div className="reasoning-label">Reasoning:</div>
          <MarkdownRenderer>{part.text}</MarkdownRenderer>
        </div>
      );

    case 'tool':
      return (
        <ToolPartComponent
          part={part}
          pendingPermissions={pendingPermissions}
          onPermissionResponse={onPermissionResponse}
          onNavigateToSubagent={onNavigateToSubagent}
        />
      );

    case 'file':
      return (
        <div className="file-block">
          <div className="file-label">File: {part.filename || 'unnamed'}</div>
          <div className="file-mime">{part.mimeType}</div>
          <pre className="file-content">{part.url}</pre>
        </div>
      );

    case 'image':
      return (
        <div className="image-block">
          <img src={part.url} alt="" />
        </div>
      );

    case 'compaction':
      return (
        <div className="compaction-block">
          <div className="compaction-label">Compaction Summary:</div>
          <MarkdownRenderer>{part.summary}</MarkdownRenderer>
          <div className="compacted-count">{part.compactedMessageIds.length} messages compacted</div>
        </div>
      );

    default:
      return null;
  }
}

function ToolPartComponent({
  part,
  pendingPermissions,
  onPermissionResponse,
  onNavigateToSubagent
}: {
  part: ToolPart;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const state = part.state;
  const status = state.status;

  // Get child session ID for task tool
  // Priority: 1) From tool state (set when subagent starts), 2) Parse from output (fallback)
  let taskSessionId: string | null = null;

  if (part.name === 'task') {
    // Check if childSessionId is in the state (running or completed)
    if ('childSessionId' in state && state.childSessionId) {
      taskSessionId = state.childSessionId;
    }
    // Fallback: parse from output when completed
    else if (status === 'completed' && 'output' in state) {
      const output = typeof state.output === 'string' ? state.output : '';
      const match = output.match(/task_id:\s*([a-f0-9-]{36})/i);
      if (match) {
        taskSessionId = match[1];
      }
    }
  }

  // Find matching pending permission request for this tool call
  const pendingPermission = status === 'pending'
    ? pendingPermissions.find(p => p.toolCallId === part.callId)
    : undefined;

  useEffect(() => {
    if (status === 'pending' || status === 'running') {
      setIsExpanded(true);
    }
  }, [status]);

  let argsPreview: string;
  try {
    argsPreview = JSON.stringify(state.input);
  } catch {
    argsPreview = String(state.input);
  }
  const truncatedArgs = argsPreview.length > 50 ? argsPreview.slice(0, 47) + '...' : argsPreview;

  const handleApprove = (alwaysAllow: boolean) => {
    onPermissionResponse(part.callId, true, alwaysAllow);
  };

  const handleDeny = () => {
    onPermissionResponse(part.callId, false, false);
  };

  return (
    <div className={`tool-group-block ${status === 'pending' ? 'pending' : ''} ${status === 'running' ? 'running' : ''} ${status === 'error' ? 'error' : ''}`}>
      <div
        className="tool-header clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="tool-chevron">{isExpanded ? '▼' : '▶'}</span>
        <span className="tool-name">🔧 {part.name}</span>
        {!isExpanded && <span className="tool-args-preview">{truncatedArgs}</span>}
        {status === 'pending' && !pendingPermission && <span className="tool-status">⏳ Pending...</span>}
        {status === 'pending' && pendingPermission && <span className="tool-status">⏳ Awaiting Approval</span>}
        {status === 'running' && <span className="tool-status">🔄 Running...</span>}
        {status === 'completed' && <span className="tool-status">✅ Done</span>}
        {status === 'error' && <span className="tool-status error">❌ Error</span>}
        {/* Quick navigation button for task tools with session ID */}
        {!isExpanded && taskSessionId && onNavigateToSubagent && (
          <button
            className="view-subagent-btn-header"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToSubagent(taskSessionId!);
            }}
          >
            View →
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="tool-args-section">
            <div className="tool-args-label">Input:</div>
            <pre className="tool-args">{JSON.stringify(state.input, null, 2)}</pre>
          </div>

          {/* Render inline permission request if pending */}
          {status === 'pending' && pendingPermission && (
            <PermissionRequestBlock
              toolName={pendingPermission.toolName}
              args={pendingPermission.args}
              permissionType={pendingPermission.permissionType as PermissionType}
              permissionKey={pendingPermission.permissionKey || ''}
              message={pendingPermission.message}
              details={pendingPermission.details}
              dangerous={pendingPermission.dangerous}
              subagentName={pendingPermission.subagentName}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          )}

          {/* View session button - available while running or completed */}
          {(status === 'running' || status === 'completed') && taskSessionId && onNavigateToSubagent && (
            <div className="tool-subagent-nav">
              <button
                className="view-subagent-btn"
                onClick={() => onNavigateToSubagent(taskSessionId!)}
              >
                {status === 'running' ? 'Watch Subagent →' : 'View Session →'}
              </button>
            </div>
          )}

          {status === 'completed' && 'output' in state && (
            <div className="tool-result-section">
              <div className="tool-result-label">Output:</div>
              <pre className="tool-result-content">
                {typeof state.output === 'string'
                  ? state.output
                  : JSON.stringify(state.output, null, 2)}
              </pre>
            </div>
          )}
          {status === 'error' && 'error' in state && (
            <div className="tool-result-section error">
              <div className="tool-result-label">Error:</div>
              <pre className="tool-result-content">{state.error}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
