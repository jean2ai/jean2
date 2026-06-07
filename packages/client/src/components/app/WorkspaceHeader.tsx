import { TerminalSquare, FolderOpen, PanelLeft, Shield, Server, Ellipsis, FolderSymlink, Brain } from 'lucide-react';
import { useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useSidebar } from '@/components/ui/sidebar';
import { platform } from '@/platform';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkspaceAdditionalPathsDialog } from '@/components/modals/WorkspaceAdditionalPathsDialog';
import { WorkspaceMemoryDialog } from '@/components/modals/WorkspaceMemoryDialog';
import { isWindows } from '@/lib/platform';

interface WorkspaceHeaderProps {
  onUpdateWorkspacePaths?: (workspaceId: string, additionalPaths: string[]) => void;
  onUpdateWorkspaceSettings?: (workspaceId: string, settings: import('@jean2/sdk').WorkspaceSettings) => void;
  sdkClient?: import('@jean2/sdk').Jean2Client | null;
}

export function WorkspaceHeader({ onUpdateWorkspacePaths, onUpdateWorkspaceSettings, sdkClient }: WorkspaceHeaderProps) {
  const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
  const showTerminalPanel = useChatLayoutStore((s) => s.showTerminalPanel);
  const showWorkspacePermissions = useUIStore((s) => s.showWorkspacePermissions);
  const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
  const setShowTerminalPanel = useChatLayoutStore((s) => s.setShowTerminalPanel);
  const setShowMCPDialog = useUIStore((s) => s.setShowMCPDialog);
  const setShowWorkspacePermissions = useUIStore((s) => s.setShowWorkspacePermissions);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const [editingPaths, setEditingPaths] = useState(false);
  const [showMemoryDialog, setShowMemoryDialog] = useState(false);

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
                  <DropdownMenuItem onClick={() => setShowMCPDialog(true)}>
                    <Server className="w-4 h-4" />
                    MCP Servers
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onUpdateWorkspacePaths && (
                    <DropdownMenuItem onClick={() => setEditingPaths(true)}>
                      <FolderSymlink className="w-4 h-4" />
                      Additional paths
                    </DropdownMenuItem>
                  )}
                  {onUpdateWorkspaceSettings && (
                    <DropdownMenuItem onClick={() => setShowMemoryDialog(true)}>
                      <Brain className="w-4 h-4" />
                      Memory
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuCheckboxItem
                    checked={showWorkspacePermissions}
                    onCheckedChange={setShowWorkspacePermissions}
                  >
                    <Shield className="w-4 h-4" />
                    Permissions
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </TooltipProvider>
      {onUpdateWorkspacePaths && activeWorkspace && (
        <WorkspaceAdditionalPathsDialog
          open={editingPaths}
          onOpenChange={setEditingPaths}
          workspace={activeWorkspace}
          onSave={onUpdateWorkspacePaths}
          sdkClient={sdkClient ?? null}
        />
      )}
      {onUpdateWorkspaceSettings && activeWorkspace && (
        <WorkspaceMemoryDialog
          open={showMemoryDialog}
          onOpenChange={setShowMemoryDialog}
          workspace={activeWorkspace}
          onSave={onUpdateWorkspaceSettings}
        />
      )}
    </div>
  );
}