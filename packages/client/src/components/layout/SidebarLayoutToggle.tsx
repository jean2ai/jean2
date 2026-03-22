import { useCallback } from 'react';
import { LayoutGrid, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarLayoutToggleProps {
  viewMode: 'default' | 'overview';
  onViewModeChange: (mode: 'default' | 'overview') => void;
}

export function SidebarLayoutToggle({ viewMode, onViewModeChange }: SidebarLayoutToggleProps) {
  const toggle = useCallback(() => {
    onViewModeChange(viewMode === 'overview' ? 'default' : 'overview');
  }, [viewMode, onViewModeChange]);

  const isOverview = viewMode === 'overview';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={toggle}>
            {isOverview ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isOverview ? 'Single workspace' : 'Overview'}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
