import { TerminalSquare, FolderOpen, Server, PanelLeft, Shield } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Workspace } from '@jean2/sdk';

export interface WorkspaceHeaderProps {
  activeWorkspace: Workspace | null;
  onOpenMCP: () => void;
  onOpenPermissions: () => void;
}

export function WorkspaceHeader({ activeWorkspace, onOpenMCP, onOpenPermissions }: WorkspaceHeaderProps) {
  const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
  const showTerminalPanel = useChatLayoutStore((s) => s.showTerminalPanel);
  const showWorkspacePermissions = useUIStore((s) => s.showWorkspacePermissions);
  const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
  const setShowTerminalPanel = useChatLayoutStore((s) => s.setShowTerminalPanel);
  const { toggleSidebar } = useSidebar();

  return (
    <div className="h-9 border-b border-border bg-background px-3 flex items-center shrink-0">
      <TooltipProvider>
        <div className="flex items-center gap-1 md:gap-2 w-full justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Sidebar</TooltipContent>
          </Tooltip>
          {activeWorkspace && (
            <div className="flex items-center gap-1 md:gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onOpenMCP}
                  >
                    <Server className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>MCP Servers</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onOpenPermissions}
                    className={showWorkspacePermissions ? 'bg-accent text-accent-foreground' : ''}
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Workspace Permissions</TooltipContent>
              </Tooltip>
              <div className="h-4 w-px bg-border mx-1 hidden md:block" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowTerminalPanel(!showTerminalPanel)}
                    className={showTerminalPanel ? 'bg-accent text-accent-foreground' : ''}
                  >
                    <TerminalSquare className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showTerminalPanel ? 'Hide Terminal' : 'Show Terminal'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowFilesPanel(!showFilesPanel)}
                    className={showFilesPanel ? 'bg-accent text-accent-foreground' : ''}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showFilesPanel ? 'Hide Files' : 'Show Files'}</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}