import { useMemo, useState, useCallback, useEffect } from 'react';
import { Lock, ChevronRight, Eye, ArrowDown } from 'lucide-react';
import type { Jean2Client } from '@jean2/sdk';
import type { Session, Preconfig, MessageWithParts, ToolPart, QueuedMessage, AttachmentKind } from '@jean2/shared';
import { ChatHeader } from './ChatHeader';
import { MessageInput } from './MessageInput';
import type { MessageInputHandle } from './MessageInput';
import { VirtualizedTranscript } from './VirtualizedTranscript';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

interface PendingPermissionRequest {
  toolCallId: string;
  sessionId: string;
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
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: boolean;
    };
  };
}

interface DisplayItem {
  message: import('@jean2/shared').Message;
  parts: import('@jean2/shared').Part[];
  isQueued?: boolean;
  queueId?: string;
}

interface ChatViewProps {
  session: Session;
  messagesWithParts: MessageWithParts[];
  queuedMessages: QueuedMessage[];
  preconfigs: Preconfig[];
  prompts?: import('@jean2/shared').PromptInfo[];
  models: Model[];
  defaultModel: string;
  onSendMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onRename: (sessionId: string, title: string) => void;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  modelSupportsImage?: boolean;
  onNavigateToSubagent?: (sessionId: string) => void;
  onNavigateBack?: () => void;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  onRevert?: (sessionId: string, stepPartId: string) => void;
  onFork?: (sessionId: string, messageId: string) => void;
  onCompact?: () => void;
  isCompacting?: boolean;
  compactionSuccess?: boolean;
  onClearCompactionSuccess?: () => void;
  serverUrl?: string;
  sdkClient?: Jean2Client | null;
  selectedVariant: string | null;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  inputRef?: React.RefObject<MessageInputHandle | null>;
  scrollToBottomRef?: React.RefObject<(() => void) | null>;
  autoFollowToggleRef?: React.RefObject<{ toggle: () => void } | null>;
}

function mergeMessagesWithQueue(
  messagesWithParts: MessageWithParts[],
  queuedMessages: QueuedMessage[],
  getUrl: (sessionId: string, attachmentId: string, key: string) => string
): DisplayItem[] {
  const regularItems: DisplayItem[] = messagesWithParts.map(mwp => ({
    message: mwp.message,
    parts: mwp.parts,
    isQueued: false,
  }));

  const queuedItems: DisplayItem[] = queuedMessages.map(qm => {
    const attachmentParts = (qm.attachments || []).map(att => {
      const url = getUrl(qm.sessionId, att.id, att.accessKey ?? '');
      if (att.kind === 'image') {
        return {
          id: `${qm.id}-att-${att.id}`,
          messageId: qm.id,
          createdAt: qm.createdAt,
          type: 'image' as const,
          url,
          mimeType: att.mimeType,
        };
      }
      return {
        id: `${qm.id}-att-${att.id}`,
        messageId: qm.id,
        createdAt: qm.createdAt,
        type: 'file' as const,
        url,
        mimeType: att.mimeType || '',
        filename: att.filename,
      };
    });

    return {
      message: {
        id: qm.id,
        role: 'user' as const,
        sessionId: qm.sessionId,
        createdAt: qm.createdAt,
      },
      parts: [
        ...attachmentParts,
        ...(qm.content.trim() ? [{
          id: `${qm.id}-part`,
          messageId: qm.id,
          createdAt: qm.createdAt,
          type: 'text' as const,
          text: qm.content,
        }] : []),
      ],
      isQueued: true,
      queueId: qm.id,
    };
  });

  // Sort regular messages by createdAt, then append queued messages at the end
  const sortedRegularItems = [...regularItems].sort((a, b) =>
    a.message.createdAt - b.message.createdAt
  );

  // Sort queued items by position (or createdAt as fallback) to maintain order
  const sortedQueuedItems = [...queuedItems].sort((a, b) =>
    a.message.createdAt - b.message.createdAt
  );

  return [...sortedRegularItems, ...sortedQueuedItems];
}

// Permission requests panel - rendered at the bottom outside the virtualized scroll container
// This ensures permissions are always reachable and visible near the input area
function PermissionRequestsPanel({
  permissions,
  onPermissionResponse,
}: {
  permissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
}) {
  if (permissions.length === 0) return null;

  return (
    <div className="border-t border-border bg-muted/30 flex flex-col gap-2 p-4" style={{overflow: "overlay"}}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
        Pending Requests
      </div>
      {permissions.map((p) => {
        const commandText = typeof p.args?.command === 'string'
          ? p.args.command
          : JSON.stringify(p.args, null, 2);

        return (
          <div
            key={p.toolCallId}
            className="p-3 bg-warning/10 border border-warning/30 rounded-lg flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.toolName}</span>
            </div>
            <p className="text-sm">{p.message}</p>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
                  <ChevronRight className="size-3" />
                  <span className="uppercase tracking-wide">Command</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="text-xs bg-background border rounded-md p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                  {commandText}
                </pre>
              </CollapsibleContent>
            </Collapsible>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPermissionResponse(p.toolCallId, false, false)}
              >
                Deny
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPermissionResponse(p.toolCallId, true, false)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                onClick={() => onPermissionResponse(p.toolCallId, true, true)}
              >
                Always Allow
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChatView({
  session,
  messagesWithParts,
  queuedMessages,
  preconfigs,
  prompts,
  models,
  defaultModel,
  onSendMessage,
  onRemoveFromQueue,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  pendingPermissions,
  onPermissionResponse,
  onRename,
  usage,
  modelName,
  modelSupportsImage,
  onNavigateToSubagent,
  onNavigateBack,
  isStreaming,
  onInterrupt,
  onRevert: _onRevert,
  onFork: _onFork,
  onCompact,
  isCompacting,
  compactionSuccess,
  onClearCompactionSuccess,
  serverUrl,
  sdkClient,
  selectedVariant,
  variants,
  inputRef,
  scrollToBottomRef,
  autoFollowToggleRef,
}: ChatViewProps) {
  const isPrimarySession = !session.parentId;
  const isMainActiveSession = isPrimarySession && session.status === 'active';

  const [autoFollow, setAutoFollow] = useState(true);

  const handleToggleAutoFollow = useCallback(() => {
    setAutoFollow((prev) => {
      const newValue = !prev;
      if (newValue) {
        scrollToBottomRef?.current?.();
      }
      return newValue;
    });
  }, [scrollToBottomRef]);

  // Expose toggle function via ref for keyboard shortcuts
  useEffect(() => {
    if (autoFollowToggleRef) {
      autoFollowToggleRef.current = {
        toggle: () => {
          handleToggleAutoFollow();
        },
      };
    }
  }, [autoFollowToggleRef, handleToggleAutoFollow]);

  const displayItems = useMemo(
    () => mergeMessagesWithQueue(
      messagesWithParts,
      queuedMessages,
      sdkClient?.http.attachments.getUrl ?? ((sessionId, attachmentId, key) =>
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}/content?key=${encodeURIComponent(key)}`
      )
    ),
    [messagesWithParts, queuedMessages, sdkClient]
  );

  // Permission requests that don't have matching tool parts in the transcript
  // These are shown in the PermissionRequestsPanel at the bottom
  const orphanedPermissions = useMemo(() =>
    pendingPermissions.filter((p) => {
      if (p.sessionId !== session.id) return false;
      return !messagesWithParts.some((mwp) =>
        mwp.parts.some(
          (part) => part.type === 'tool' && (part as ToolPart).callId === p.toolCallId
        )
      );
    }),
    [pendingPermissions, session.id, messagesWithParts]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <ChatHeader
        session={session}
        preconfigs={preconfigs}
        models={models}
        defaultModel={defaultModel}
        usage={usage}
        modelName={modelName}
        onChangePreconfig={onChangePreconfig}
        onChangeModel={onChangeModel}
        onChangeVariant={onChangeVariant}
        onRename={onRename}
        onNavigateBack={onNavigateBack}
        isStreaming={isStreaming}
        onInterrupt={onInterrupt}
        onCompact={onCompact}
        isCompacting={isCompacting}
        canCompact={messagesWithParts.length >= 4}
        selectedVariant={selectedVariant}
        variants={variants}
      />

      {/* Transcript area with floating auto-follow button */}
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* Virtualized transcript - handles scrolling for messages only */}
        <VirtualizedTranscript
          displayItems={displayItems}
          messagesWithParts={messagesWithParts}
          sessionId={session.id}
          sessionStatus={session.status}
          pendingPermissions={pendingPermissions}
          isCompacting={isCompacting}
          compactionSuccess={compactionSuccess}
          onClearCompactionSuccess={onClearCompactionSuccess}
          onPermissionResponse={onPermissionResponse}
          onNavigateToSubagent={onNavigateToSubagent}
          onRemoveFromQueue={onRemoveFromQueue}
          onRevert={_onRevert}
          onFork={_onFork}
          onCompact={onCompact}
          isMainActiveSession={isMainActiveSession}
          autoFollow={autoFollow}
          onAutoScrollChange={setAutoFollow}
          scrollToBottomRef={scrollToBottomRef}
          serverUrl={serverUrl}
        />

        {/* Floating auto-follow toggle button - positioned within transcript area */}
        <button
          onClick={handleToggleAutoFollow}
          className="absolute bottom-4 right-4 z-50 flex items-center p-1.5 text-xs rounded-full transition-colors cursor-pointer bg-background/80 backdrop-blur-sm hover:bg-background border border-border/50 shadow-sm pointer-events-auto"
          title={autoFollow ? 'Auto-follow enabled (Cmd+Shift+F)' : 'Auto-follow disabled (Cmd+Shift+F)'}
        >
          {autoFollow ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>

      {/* Permission requests panel rendered at the bottom - visible near input area */}
      {orphanedPermissions.length > 0 && (
        <PermissionRequestsPanel
          permissions={orphanedPermissions}
          onPermissionResponse={onPermissionResponse}
        />
      )}

      {session.status === 'active' && !session.parentId && (          <MessageInput
          ref={inputRef}
          onSendMessage={onSendMessage}
          disabled={isCompacting}
          workspaceId={session.workspaceId}
          sdkClient={sdkClient}
          prompts={prompts}
          sessionId={session.id}
          modelSupportsImage={modelSupportsImage}
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
