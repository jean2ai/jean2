import { useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';
import type { Session, Preconfig, MessageWithParts, Part, TextPart, ToolPart } from '@jean2/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { ToolCall } from './ToolCall';
import { MessageInput } from './MessageInput';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

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

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
}

interface ChatViewProps {
  session: Session;
  messagesWithParts: MessageWithParts[];
  preconfigs: Preconfig[];
  models: Model[];
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

function getTextContent(parts: Part[]): string {
  return parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

/**
 * Renders message parts in CHRONOLOGICAL ORDER (by createdAt).
 * Text blocks and tool calls are interleaved as they were created.
 */
function MessageParts({
  parts,
  pendingPermissions,
  onPermissionResponse,
  onNavigateToSubagent,
}: {
  parts: Part[];
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
}) {
  // Sort parts by createdAt to ensure chronological order
  const sortedParts = [...parts].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      {sortedParts.map((part) => {
        switch (part.type) {
          case 'text':
            return (
              <div key={part.id} className="min-w-0">
                <MarkdownRenderer>{part.text || '...'}</MarkdownRenderer>
              </div>
            );
          
          case 'reasoning':
            return (
              <div 
                key={part.id} 
                className="text-muted-foreground text-sm italic border-l-2 border-muted-foreground/30 pl-3 my-2"
              >
                {part.text}
              </div>
            );
          
          case 'tool':
            return (
              <ToolCall
                key={part.id}
                part={part}
                pendingPermissions={pendingPermissions}
                onPermissionResponse={onPermissionResponse}
                onNavigateToSubagent={onNavigateToSubagent}
              />
            );
          
          case 'image':
            return (
              <img 
                key={part.id} 
                src={part.url} 
                alt="" 
                className="max-w-full rounded-lg mt-2" 
              />
            );
          
          case 'file':
            return (
              <div key={part.id} className="mt-2 p-2 bg-muted rounded text-sm">
                {part.filename || 'unnamed'}
              </div>
            );
          
          case 'compaction':
            return (
              <div 
                key={part.id} 
                className="mt-2 p-2 bg-muted rounded text-sm text-muted-foreground"
              >
                {part.compactedMessageIds.length} messages compacted
              </div>
            );
          
          default:
            return null;
        }
      })}
    </>
  );
}

export function ChatView({
  session,
  messagesWithParts,
  preconfigs,
  models,
  defaultModel,
  onSendMessage,
  onChangePreconfig,
  onChangeModel,
  pendingPermissions,
  onPermissionResponse,
  onRename,
  usage,
  modelName,
  onNavigateToSubagent,
  onNavigateBack,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on initial session load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesWithParts]);

  // Find orphaned permissions (not tied to a visible tool part)
  const orphanedPermissions = pendingPermissions.filter((p) => {
    return !messagesWithParts.some((mwp) =>
      mwp.parts.some(
        (part) => part.type === 'tool' && (part as ToolPart).callId === p.toolCallId
      )
    );
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ChatHeader
        session={session}
        preconfigs={preconfigs}
        models={models}
        defaultModel={defaultModel}
        usage={usage}
        modelName={modelName}
        onChangePreconfig={onChangePreconfig}
        onChangeModel={onChangeModel}
        onRename={onRename}
        onNavigateBack={onNavigateBack}
      />

      {session.status === 'closed' && (
        <Alert className="mx-4 mt-4">
          <AlertDescription>
            This session is archived. You can reopen it from the sidebar.
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4">
          {messagesWithParts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Send a message below to begin.</p>
            </div>
          ) : (
            messagesWithParts.map((mwp) => (
              <MessageBubble 
                key={mwp.message.id} 
                message={mwp.message}
                textContent={getTextContent(mwp.parts)}
              >
                {mwp.parts.length === 0 ? (
                  <span className="opacity-50">...</span>
                ) : (
                  <MessageParts
                    parts={mwp.parts}
                    pendingPermissions={pendingPermissions}
                    onPermissionResponse={onPermissionResponse}
                    onNavigateToSubagent={onNavigateToSubagent}
                  />
                )}
              </MessageBubble>
            ))
          )}

          {orphanedPermissions.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {orphanedPermissions.map((p) => (
                <div
                  key={p.toolCallId}
                  className="p-3 bg-warning/10 border border-warning/30 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">{p.toolName}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.permissionType}
                    </span>
                  </div>
                  <p className="text-sm mb-3">{p.message}</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPermissionResponse(p.toolCallId, false, false)}
                    >
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onPermissionResponse(p.toolCallId, true, false)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {session.status === 'active' && !session.parentId && (
        <MessageInput
          onSendMessage={onSendMessage}
          disabled={false}
        />
      )}

      {session.parentId && (
        <div className="p-4 border-t border-border bg-muted/50 text-center flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" />
          This is a subagent session (read-only)
        </div>
      )}
    </div>
  );
}
