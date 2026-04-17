import { Settings, SlidersHorizontal, Ellipsis, LayoutGrid, LayoutList, Check } from 'lucide-react';
import { useRouter, useParams, useLocation } from '@tanstack/react-router';
import { isElectron, isWindows } from '@/lib/platform';
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
import { useConnectionStore } from '@/stores/connectionStore';
import { useUIStore } from '@/stores/uiStore';

export function AppHeader() {
  const router = useRouter();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const connected = useConnectionStore((s) => s.connected);
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const setShowConfiguration = useUIStore((s) => s.setShowConfiguration);
  const setShowAddServer = useUIStore((s) => s.setShowAddServer);

  const location = useLocation();
  const isOverview = location.pathname.includes('/overview');

  return (
    <>
      <header className="md:hidden flex items-center justify-between p-3 border-b border-border bg-background sticky top-0 z-10 shrink-0" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">              <ServerSwitcher
                compact
                onOpenAddServer={() => setShowAddServer(true)}
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
                <DropdownMenuItem onClick={() => router.navigate({ to: '/server/$serverId/workspace', params: { serverId: params.serverId } })}>
                  <span className="flex-1">Single workspace</span>
                  {!isOverview && <Check className="size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: '/server/$serverId/overview', params: { serverId: params.serverId } })}>
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
                <DropdownMenuItem onClick={() => setShowConfiguration(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      </header>

      {/* Traffic light spacer for macOS - provides space for native window controls */}
      {isElectron() && (
        <div className="hidden md:block h-[30px] shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}

      <header className={`hidden md:flex items-center justify-between p-3 border-b border-border bg-sidebar h-11 shrink-0${isElectron() && isWindows() ? ' pr-36' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ServerSwitcher
              compact
              onOpenAddServer={() => setShowAddServer(true)}
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
          <div className="flex items-center gap-2" style={isElectron() ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => router.navigate({ to: '/server/$serverId/workspace', params: { serverId: params.serverId } })}
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
                    onClick={() => router.navigate({ to: '/server/$serverId/overview', params: { serverId: params.serverId } })}
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
                <DropdownMenuItem onClick={() => setShowConfiguration(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
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