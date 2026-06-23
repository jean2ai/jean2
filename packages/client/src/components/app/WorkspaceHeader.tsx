import { TerminalSquare, FolderOpen, PanelLeft, Settings2, ChevronsRight, ChevronsLeft, Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useSidebar } from '@/components/ui/sidebar';
import { platform } from '@/platform';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkspaceSettingsDialog } from '@/components/modals/WorkspaceSettingsDialog';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { isWindows } from '@/lib/platform';
import { useIsMobile } from '@/hooks/use-mobile';

interface WorkspaceHeaderProps {
  onUpdateWorkspacePaths?: (workspaceId: string, additionalPaths: string[]) => void;
  onUpdateWorkspaceSettings?: (workspaceId: string, settings: import('@jean2/sdk').WorkspaceSettings) => void;
  sdkClient?: import('@jean2/sdk').Jean2Client | null;
}

export function WorkspaceHeader({ onUpdateWorkspacePaths, onUpdateWorkspaceSettings, sdkClient }: WorkspaceHeaderProps) {
  const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
  const showTerminalPanel = useChatLayoutStore((s) => s.showTerminalPanel);
  const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
  const setShowTerminalPanel = useChatLayoutStore((s) => s.setShowTerminalPanel);
  const expandedToolbar = useUIStore((s) => s.expandedToolbar);
  const setExpandedToolbar = useUIStore((s) => s.setExpandedToolbar);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const sessionManager = useSessionManager();
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  const isMobile = useIsMobile();
  const showExpanded = expandedToolbar && !isMobile;

  return (
    <div className="h-9 px-3 flex items-center shrink-0">
      <TooltipProvider>
        <div className="flex items-center gap-1 md:gap-2 w-full justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
                className={sidebarState === 'expanded' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarState === 'expanded' ? 'Hide Sessions' : 'Show Sessions'}</TooltipContent>
          </Tooltip>
          {activeWorkspace && (
            <div className="flex items-center gap-1 md:gap-2">
              {platform.capabilities.terminal ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => platform.openTerminal?.(activeWorkspace?.path)}
                    >
                      <TerminalSquare className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open Terminal</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowTerminalPanel(!showTerminalPanel)}
                      className={showTerminalPanel ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                    >
                      <TerminalSquare className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showTerminalPanel ? 'Hide Terminal' : 'Show Terminal'}</TooltipContent>
                </Tooltip>
              )}
              {platform.capabilities.explorer ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
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
                      size="icon-sm"
                      onClick={() => setShowFilesPanel(!showFilesPanel)}
                      className={showFilesPanel ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showFilesPanel ? 'Hide Files' : 'Show Files'}</TooltipContent>
                </Tooltip>
              )}

              {showExpanded && onUpdateWorkspaceSettings && (
                <>
                  <div className="w-px h-5 bg-border mx-1" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" onClick={() => setShowWorkspaceSettings(true)}>
                        <Settings2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side={isWindows() ? 'bottom' : undefined}>Workspace Settings</TooltipContent>
                  </Tooltip>
                </>
              )}
              {!showExpanded && (
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <Ellipsis className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side={isWindows() ? 'bottom' : undefined}>More</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {onUpdateWorkspaceSettings && (
                      <DropdownMenuItem onClick={() => setShowWorkspaceSettings(true)}>
                        <Settings2 className="w-4 h-4" />
                        Workspace Settings
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!isMobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => setExpandedToolbar(!expandedToolbar)}>
                      {expandedToolbar ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{expandedToolbar ? 'Collapse Toolbar' : 'Expand Toolbar'}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
      {onUpdateWorkspaceSettings && activeWorkspace && (
        <WorkspaceSettingsDialog
          open={showWorkspaceSettings}
          onOpenChange={setShowWorkspaceSettings}
          workspace={activeWorkspace}
          onSave={onUpdateWorkspaceSettings}
          sdkClient={sdkClient ?? null}
          permissions={sessionManager.permissions}
          onRefreshPermissions={sessionManager.refreshPermissions}
          onRevokePermission={sessionManager.revokePermission}
          onRevokeAllPermissions={() => {
            if (activeWorkspace.id) {
              sessionManager.revokeAllPermissions(activeWorkspace.id);
            }
          }}
          onUpdateWorkspacePaths={onUpdateWorkspacePaths ?? (() => {})}
        />
      )}
    </div>
  );
}
