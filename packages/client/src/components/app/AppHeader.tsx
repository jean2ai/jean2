import { Settings, SlidersHorizontal, Ellipsis, LayoutGrid, LayoutList, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ServerSwitcher } from '@/components/layout/ServerSwitcher';
import { useUIStore } from '@/stores/uiStore';



interface AppHeaderProps {
  onSidebarViewModeChange: (mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')) => void;
  connected: boolean;
  onOpenSettings: () => void;
  onOpenConfiguration: () => void;
  onOpenAddServer: () => void;
}

export function AppHeader({
  onSidebarViewModeChange,
  connected,
  onOpenSettings,
  onOpenConfiguration,
  onOpenAddServer,
}: AppHeaderProps) {
  const sidebarViewMode = useUIStore((s) => s.sidebarViewMode);

  const isOverview = sidebarViewMode === 'overview';

  return (
    <>
      <header className="md:hidden flex items-center justify-between p-3 border-b border-border bg-background sticky top-0 z-10 shrink-0" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ServerSwitcher
              compact
              onOpenAddServer={onOpenAddServer}
            />              <button
                className="flex items-center justify-center size-5 rounded-md hover:bg-accent transition-colors"
                title={connected ? 'Connected' : 'Disconnected'}
              >
                <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />
              </button>
            </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      {isOverview ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48 min-w-48">
                <DropdownMenuItem onClick={() => onSidebarViewModeChange('default')}>
                  <span className="flex-1">Single workspace</span>
                  {!isOverview && <Check className="size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSidebarViewModeChange('overview')}>
                  <span className="flex-1">Overview</span>
                  {isOverview && <Check className="size-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <Ellipsis className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48 min-w-48">
                <DropdownMenuItem onClick={onOpenConfiguration}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      </header>

      <header className="hidden md:flex items-center justify-between p-3 border-b border-border bg-sidebar h-14 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ServerSwitcher
              compact
              onOpenAddServer={onOpenAddServer}
            />
            <button
              className="flex items-center justify-center size-5 rounded-md hover:bg-accent transition-colors"
              title={connected ? 'Connected' : 'Disconnected'}
            >
              <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />
            </button>
          </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onSidebarViewModeChange('default')}
                    className={isOverview ? '' : 'bg-sidebar-accent text-sidebar-accent-foreground'}
                  >
                    <LayoutList className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Single workspace</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onSidebarViewModeChange('overview')}
                    className={isOverview ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Overview</TooltipContent>
              </Tooltip>
            </>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <Ellipsis className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48 min-w-48">
                <DropdownMenuItem onClick={onOpenConfiguration}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      </header>
    </>
  );
}
