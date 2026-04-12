import { TerminalSquare, FolderOpen, PanelLeft, Shield, Server, Ellipsis } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useSidebar } from '@/components/ui/sidebar';
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

export function WorkspaceHeader() {
  const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
  const showTerminalPanel = useChatLayoutStore((s) => s.showTerminalPanel);
  const showWorkspacePermissions = useUIStore((s) => s.showWorkspacePermissions);
  const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
  const setShowTerminalPanel = useChatLayoutStore((s) => s.setShowTerminalPanel);
  const setShowMCPDialog = useUIStore((s) => s.setShowMCPDialog);
  const setShowWorkspacePermissions = useUIStore((s) => s.setShowWorkspacePermissions);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const { toggleSidebar, state: sidebarState } = useSidebar();

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
                className={sidebarState === 'expanded' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarState === 'expanded' ? 'Hide Sessions' : 'Show Sessions'}</TooltipContent>
          </Tooltip>
          {activeWorkspace && (
            <div className="flex items-center gap-1 md:gap-2">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <Ellipsis className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowMCPDialog(true)}>
                    <Server className="w-4 h-4" />
                    MCP Servers
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
    </div>
  );
}