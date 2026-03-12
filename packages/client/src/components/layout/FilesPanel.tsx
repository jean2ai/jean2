import { X } from 'lucide-react';
import { FileTree } from '@/components/files';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface FilesPanelProps {
  workspaceId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export function FilesPanel({ workspaceId, isOpen, onClose }: FilesPanelProps) {
  const isMobile = useIsMobile();

  if (!workspaceId) {
    return null;
  }

  // Mobile: Use Sheet overlay
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-72 p-0 bg-sidebar [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Files</SheetTitle>
          </SheetHeader>

          {/* Panel Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="font-semibold text-sm">Files</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Panel Content */}
          <ScrollArea className="h-[calc(100vh-52px)]">
            <FileTree 
              workspaceId={workspaceId} 
              showHidden={true}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Fixed positioned panel
  return (
    <>
      {/* Gap element for layout - takes up space when panel is open */}
      <div
        className={cn(
          'relative w-64 bg-transparent transition-[width] duration-200 ease-linear',
          !isOpen && 'w-0'
        )}
      />

      {/* Fixed positioned panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-10 w-64 bg-sidebar border-l border-border',
          'transform transition-transform duration-200 ease-linear',
          !isOpen && 'translate-x-full'
        )}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-semibold text-sm">Files</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Panel Content */}
        <ScrollArea className="h-[calc(100vh-52px)]">
          <FileTree 
            workspaceId={workspaceId} 
            showHidden={true}
          />
        </ScrollArea>
      </div>
    </>
  );
}
