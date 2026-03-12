import { useState, useEffect } from 'react';
import type { Message as MessageType, Part, ToolPart } from '@jean2/shared';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import PermissionRequestBlock from '@/components/PermissionRequestBlock';
import type { PermissionType } from '@jean2/shared';

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
    <div className={`mb-4 max-w-[80%] ${roleClass === 'user' ? 'ml-auto' : 'mr-auto'}`}>
      <div className="text-[11px] text-[#888] mb-1 uppercase">{message.role}</div>
      <div className={`p-3 px-4 rounded-xl bg-[#2a2a2a] ${roleClass === 'user' ? 'bg-[#3a6ea5]' : ''}`}>
        {parts.length === 0 ? (
          <div className="break-words overflow-x-auto">
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
        <div className="break-words overflow-x-auto">
          <MarkdownRenderer>{part.text || '...'}</MarkdownRenderer>
        </div>
      );

    case 'reasoning':
      return (
        <div className="text-[#888]">
          <div className="text-xs font-medium mb-1 text-[#888]">Reasoning:</div>
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
        <div className="mt-2 text-sm">
          <div className="text-[11px] text-[#888] uppercase mb-1">File: {part.filename || 'unnamed'}</div>
          <div className="text-xs text-[#888] mb-1">{part.mimeType}</div>
          <pre className="text-xs text-[#aaa] bg-[#2a2a2a] p-2 rounded overflow-x-auto">{part.url}</pre>
        </div>
      );

    case 'image':
      return (
        <div className="mt-2">
          <img src={part.url} alt="" className="max-w-full rounded-lg" />
        </div>
      );

    case 'compaction':
      return (
        <div className="mt-2 text-[#888]">
          <div className="text-xs font-medium mb-1 text-[#888]">Compaction Summary:</div>
          <MarkdownRenderer>{part.summary}</MarkdownRenderer>
          <div className="text-xs mt-1 text-[#666]">{part.compactedMessageIds.length} messages compacted</div>
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

  let taskSessionId: string | null = null;

  if (part.name === 'task') {
    if ('childSessionId' in state && state.childSessionId) {
      taskSessionId = state.childSessionId;
    }
    else if (status === 'completed' && 'output' in state) {
      const output = typeof state.output === 'string' ? state.output : '';
      const match = output.match(/task_id:\s*([a-f0-9-]{36})/i);
      if (match) {
        taskSessionId = match[1];
      }
    }
  }

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
    <div className={`bg-[#333] p-3 rounded-lg mt-2 ${status === 'pending' ? 'border border-dashed border-[#666] animate-pulse-opacity' : ''}`}>
      <div
        className="flex items-center gap-2 pb-2 border-b border-[#444] mb-2 cursor-pointer select-none hover:bg-white/5 rounded"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-[10px] text-[#888]">{isExpanded ? '▼' : '▶'}</span>
        <span className="font-semibold text-[#4a9eff]">🔧 {part.name}</span>
        {!isExpanded && <span className="text-[10px] text-[#888] ml-2 font-mono">{truncatedArgs}</span>}
        {status === 'pending' && !pendingPermission && <span className="ml-2 text-xs text-[#ffa500] animate-blink-opacity">⏳ Pending...</span>}
        {status === 'pending' && pendingPermission && <span className="ml-2 text-xs text-[#ffa500] font-semibold">⏳ Awaiting Approval</span>}
        {status === 'running' && <span className="ml-2 text-xs text-[#ffa500] animate-blink-opacity">🔄 Running...</span>}
        {status === 'completed' && <span className="ml-2 text-xs text-[#ffa500]">✅ Done</span>}
        {status === 'error' && <span className="ml-2 text-xs text-[#ff6b6b]">❌ Error</span>}
        {!isExpanded && taskSessionId && onNavigateToSubagent && (
          <button
            className="bg-[#2a4a6a] border border-[#3a5a8a] rounded text-[#8ac4ff] cursor-pointer text-[11px] font-medium p-[2px_8px] ml-2 transition-all whitespace-nowrap hover:bg-[#3a5a8a] hover:border-[#4a6a9a] hover:text-[#a8d4ff]"
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
          <div className="mb-2">
            <div className="text-[11px] text-[#888] uppercase mb-1">Input:</div>
            <pre className="bg-[#2a2a2a] p-2 rounded text-xs m-0 overflow-x-auto">{JSON.stringify(state.input, null, 2)}</pre>
          </div>

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

          {(status === 'running' || status === 'completed') && taskSessionId && onNavigateToSubagent && (
            <div className="mt-3 pt-3 border-t border-[#444]">
              <button
                className="block w-full mt-3 p-2.5 px-4 bg-[#2a4a6a] border border-[#3a5a8a] rounded-md text-[#8ac4ff] text-sm font-medium cursor-pointer transition-all text-center hover:bg-[#3a5a8a] hover:border-[#4a6a9a] hover:text-[#a8d4ff]"
                onClick={() => onNavigateToSubagent(taskSessionId!)}
              >
                {status === 'running' ? 'Watch Subagent →' : 'View Session →'}
              </button>
            </div>
          )}

          {status === 'completed' && 'output' in state && (
            <div className="bg-[#2d4a2d] p-2 rounded mt-2">
              <div className="text-[11px] text-[#888] uppercase mb-1">Output:</div>
              <pre className="text-xs m-0 overflow-x-auto whitespace-pre-wrap break-words">
                {typeof state.output === 'string'
                  ? state.output
                  : JSON.stringify(state.output, null, 2)}
              </pre>
            </div>
          )}
          {status === 'error' && 'error' in state && (
            <div className="bg-[#4a2a2a] p-2 rounded mt-2">
              <div className="text-[11px] text-[#888] uppercase mb-1">Error:</div>
              <pre className="text-xs m-0 overflow-x-auto whitespace-pre-wrap break-words">{state.error}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}