import { useMemo } from 'react';
import { FolderOpen, PanelLeft } from 'lucide-react';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useSidebar } from '@/components/ui/sidebar';
import { platform } from '@/platform';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { getWorkspacePreconfigs } from '@/lib/workspacePreconfigs';

export function WorkspaceHeader() {
  const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
  const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const allPreconfigs = useServerDataStore((s) => s.preconfigs);
  const models = useServerDataStore((s) => s.models);
  const defaultModel = useServerDataStore((s) => s.defaultModel);
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const sessionManager = useSessionManager();

  const preconfigs = getWorkspacePreconfigs(activeWorkspace, allPreconfigs);

  // Chat data for the merged ChatHeader
  const currentSession = useSessionStore((s) => s.currentSession);
  const sessionUsage = useSessionStore((s) => s.sessionUsage);
  const currentSessionMessages = useSessionStore((s) =>
    currentSession ? s.messagesBySession[currentSession.id] : undefined,
  );
  const streamingSessionIds = useConnectionStore((s) => s.streamingSessionIds);
  const compactableMessageCount = useMemo(
    () => currentSessionMessages?.filter((message) => message.role !== 'system').length ?? 0,
    [currentSessionMessages],
  );

  const currentModel = sessionManager.currentModel;
  const selectedVariant = sessionManager.selectedVariant;
  const isCompacting = sessionManager.isCompacting;

  const hasSession = !!currentSession;
  const currentModelInfo = models.find((m) => m.id === currentModel);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-10 flex items-stretch shrink-0 border-b border-border bg-card">
        {/* Left: Sidebar toggle section */}
        <div className={`flex items-center px-1 shrink-0 ${sidebarState === 'expanded' ? 'bg-muted' : ''}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarState === 'expanded' ? 'Hide Sessions' : 'Show Sessions'}</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px bg-border shrink-0" />

        {/* Center: Merged ChatHeader content — fills space even when empty */}
        <div className="flex-1 flex items-center min-w-0 px-2">
          {hasSession && currentSession && (
            <ChatHeader
              session={currentSession}
              preconfigs={preconfigs}
              models={models}
              defaultModel={defaultModel}
              usage={sessionUsage}
              modelName={currentModel}
              onChangePreconfig={sessionManager.updateSessionPreconfig}
              onChangeModel={sessionManager.updateSessionModel}
              onChangeVariant={sessionManager.updateSessionVariant}
              onRename={sessionManager.handleRenameSession}
              onNavigateBack={sessionManager.handleNavigateBack}
              isStreaming={streamingSessionIds.has(currentSession.id) || !!currentSession.runningAt}
              onCompact={compactableMessageCount >= 2 ? () => sessionManager.compactSession(currentSession.id) : undefined}
              isCompacting={isCompacting}
              canCompact={compactableMessageCount >= 2}
              selectedVariant={selectedVariant}
              variants={currentModelInfo?.variants}
              onClaimControl={sessionManager.claimControl}
              onReleaseControl={sessionManager.releaseControl}
              onRequestTakeover={sessionManager.requestTakeover}
              onRespondTakeover={sessionManager.respondTakeover}
            />
          )}
        </div>

        {/* Right: Files / Explorer toggle section */}
        {activeWorkspace && (
          <>
            <div className="w-px bg-border shrink-0" />
            <div className={`flex items-center px-1 shrink-0 ${showFilesPanel ? 'bg-muted' : ''}`}>
              {platform.capabilities.explorer ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => platform.showExplorer?.()}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Show Explorer</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowFilesPanel(!showFilesPanel)}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showFilesPanel ? 'Hide Files' : 'Show Files'}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
