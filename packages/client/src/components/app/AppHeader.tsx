import { FolderOpen, TerminalSquare } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { QuickSwitcher } from '@/components/layout/QuickSwitcher';
import { SidebarLayoutToggle } from '@/components/layout/SidebarLayoutToggle';
import { useUIStore } from '@/stores/uiStore';
import type { Workspace } from '@jean2/shared';

interface AppHeaderProps {
  headerTitle: string;
  isLoggedIn: boolean;
  activeWorkspace: Workspace | null;
  onServerSwitch: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSidebarViewModeChange: (mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')) => void;
}

export function AppHeader({
  headerTitle,
  isLoggedIn,
  activeWorkspace,
  onServerSwitch,
  onSelectWorkspace,
  onSidebarViewModeChange,
}: AppHeaderProps) {
  const sidebarViewMode = useUIStore((s) => s.sidebarViewMode);
  const showFilesPanel = useUIStore((s) => s.showFilesPanel);
  const showTerminalPanel = useUIStore((s) => s.showTerminalPanel);
  const setShowFilesPanel = useUIStore((s) => s.setShowFilesPanel);
  const setShowTerminalPanel = useUIStore((s) => s.setShowTerminalPanel);

  return (
    <>
      <header className="md:hidden flex items-center justify-between p-3 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {isLoggedIn && <SidebarTrigger />}
          <span className="font-semibold">{headerTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          {isLoggedIn && (
            <QuickSwitcher
              onServerSwitch={onServerSwitch}
              onSelectWorkspace={onSelectWorkspace}
            />
          )}
          {isLoggedIn && (
            <SidebarLayoutToggle
              viewMode={sidebarViewMode}
              onViewModeChange={onSidebarViewModeChange}
            />
          )}
          {isLoggedIn && activeWorkspace && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowFilesPanel(!showFilesPanel)}
              title={showFilesPanel ? 'Hide Files' : 'Show Files'}
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          )}
          {isLoggedIn && activeWorkspace && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowTerminalPanel(!showTerminalPanel)}
              title={showTerminalPanel ? 'Hide Terminal' : 'Show Terminal'}
            >
              <TerminalSquare className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      <header className="hidden md:flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          {isLoggedIn && <SidebarTrigger />}
          <span className="font-semibold">{headerTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <QuickSwitcher 
              onServerSwitch={onServerSwitch}
              onSelectWorkspace={onSelectWorkspace}
            />
          )}
          {isLoggedIn && (
            <SidebarLayoutToggle
              viewMode={sidebarViewMode}
              onViewModeChange={onSidebarViewModeChange}
            />
          )}
          {isLoggedIn && activeWorkspace && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowFilesPanel(!showFilesPanel)}
              title={showFilesPanel ? 'Hide Files' : 'Show Files'}
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          )}
          {isLoggedIn && activeWorkspace && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowTerminalPanel(!showTerminalPanel)}
              title={showTerminalPanel ? 'Hide Terminal' : 'Show Terminal'}
            >
              <TerminalSquare className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>
    </>
  );
}
