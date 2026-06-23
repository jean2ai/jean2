import { Settings, Ellipsis, LayoutGrid, LayoutList, Check, Wrench, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { useRouter, useParams, useLocation } from '@tanstack/react-router';
import { isWindows } from '@/lib/platform';
import { platform, hasCapability } from '@/platform';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const setShowTools = useUIStore((s) => s.setShowTools);
  const expandedToolbar = useUIStore((s) => s.expandedToolbar);
  const setExpandedToolbar = useUIStore((s) => s.setExpandedToolbar);
  const location = useLocation();
  const isOverview = location.pathname.includes('/overview');

  return (
    <>
      {/* Traffic light spacer for macOS - provides space for native window controls */}
      {platform.id === 'electron' && (
          <div className="block md:hidden h-[30px] shrink-0 z-40" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}
      <header className={`md:hidden flex items-center justify-between pl-3 ${hasCapability('multiView') ? 'pr-5' : 'pr-3'} pt-2 sticky top-0 z-40 shrink-0`} style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {hasCapability('serverSwitching') && <ServerSwitcher compact />}
            <button className="flex items-center justify-center size-5 rounded-md hover:bg-accent transition-colors" title={connected ? 'Connected' : 'Disconnected'}>
                <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />
              </button>
            </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {hasCapability('multiView') && (
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
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48 min-w-48">
                <DropdownMenuItem onClick={() => setShowTools(true)}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Tools
                </DropdownMenuItem>
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
      {platform.id === 'electron' && (
        <div className="hidden md:block h-[30px] shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}

      <header className={`hidden md:flex items-center justify-between pl-3 ${hasCapability('multiView') ? 'pr-5' : 'pr-3'} pt-2 h-11 shrink-0`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {hasCapability('serverSwitching') && (
              <ServerSwitcher
                compact
              />
            )}
            <button
              className="flex items-center justify-center size-5 rounded-md hover:bg-accent transition-colors"
              title={connected ? 'Connected' : 'Disconnected'}
            >
              <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`} />
            </button>
          </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-2" style={platform.id === 'electron' ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            {hasCapability('multiView') && (
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
                <TooltipContent side={isWindows() ? 'bottom' : undefined}>Single workspace</TooltipContent>
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
                <TooltipContent side={isWindows() ? 'bottom' : undefined}>Overview</TooltipContent>
              </Tooltip>
            </>
            )}
            {expandedToolbar && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => setShowTools(true)}>
                      <Wrench className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side={isWindows() ? 'bottom' : undefined}>Tools</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(true)}>
                      <Settings className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side={isWindows() ? 'bottom' : undefined}>Settings</TooltipContent>
                </Tooltip>
              </>
            )}
            {!expandedToolbar && (
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
                <DropdownMenuContent align="end" className="w-48 min-w-48">
                  <DropdownMenuItem onClick={() => setShowTools(true)}>
                    <Wrench className="mr-2 h-4 w-4" />
                    Tools
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => setExpandedToolbar(!expandedToolbar)}>
                  {expandedToolbar ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isWindows() ? 'bottom' : undefined}>{expandedToolbar ? 'Collapse Toolbar' : 'Expand Toolbar'}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </header>
    </>
  );
}
