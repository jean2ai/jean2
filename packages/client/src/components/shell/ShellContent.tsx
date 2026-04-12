import type { RefObject } from 'react';
import type { AttachmentKind, MessageWithParts } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import { AppMainContent, AppPanels, WorkspaceHeader } from '@/components/app';

export interface ShellContentProps {
  terminalPanelRef: RefObject<TerminalPanelHandle | null>;
  sdkClient: Jean2Client | null;
  inputRef: RefObject<MessageInputHandle | null>;
  messagesWithParts: MessageWithParts[];
  serverUrl: string | null;
  onRetry: () => void;
  onLogout: () => void;
  onSendMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  onRemoveFromQueue: (queueItemId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onRename: (sessionId: string, title: string) => void;
  onNavigateToSubagent: (sessionId: string) => void;
  onNavigateBack: () => void;
  onInterrupt: () => void;
  onRevert: (sessionId: string, messageId: string) => void;
  onFork: (sessionId: string, messageId: string) => void;
  onCompact: (sessionId: string) => void;
  onClearCompactionSuccess: () => void;
  scrollToBottomRef?: RefObject<(() => void) | null>;
  autoFollowToggleRef?: RefObject<{ toggle: () => void } | null>;
}

export function ShellContent(props: ShellContentProps) {
  const {
    terminalPanelRef,
    sdkClient,
    inputRef,
    messagesWithParts,
    serverUrl,
    onRetry,
    onLogout,
    onSendMessage,
    onRemoveFromQueue,
    onChangePreconfig,
    onChangeModel,
    onChangeVariant,
    onPermissionResponse,
    onRename,
    onNavigateToSubagent,
    onNavigateBack,
    onInterrupt,
    onRevert,
    onFork,
    onCompact,
    onClearCompactionSuccess,
    scrollToBottomRef,
    autoFollowToggleRef,
  } = props;

  return (
    <main className="flex-1 flex flex-col overflow-hidden min-h-0" style={{
      paddingTop: 'env(safe-area-inset-top, 0)',
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      <WorkspaceHeader />
      <AppMainContent
        sdkClient={sdkClient}
        inputRef={inputRef}
        messagesWithParts={messagesWithParts}
        serverUrl={serverUrl}
        onRetry={onRetry}
        onLogout={onLogout}
        onSendMessage={onSendMessage}
        onRemoveFromQueue={onRemoveFromQueue}
        onChangePreconfig={onChangePreconfig}
        onChangeModel={onChangeModel}
        onChangeVariant={onChangeVariant}
        onPermissionResponse={onPermissionResponse}
        onRename={onRename}
        onNavigateToSubagent={onNavigateToSubagent}
        onNavigateBack={onNavigateBack}
        onInterrupt={onInterrupt}
        onRevert={onRevert}
        onFork={onFork}
        onCompact={onCompact}
        onClearCompactionSuccess={onClearCompactionSuccess}
        scrollToBottomRef={scrollToBottomRef}
        autoFollowToggleRef={autoFollowToggleRef}
      />
      <AppPanels
        sdkClient={sdkClient}
        terminalPanelRef={terminalPanelRef}
      />
    </main>
  );
}
