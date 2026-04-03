import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { FileTree } from '@/components/files';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
} from '@jean2/shared';
import { useUIStore } from '@/stores/uiStore';

interface FilesPanelProps {
  workspaceId: string | undefined;
  serverUrl: string | undefined;
  apiToken: string | undefined;
  isOpen: boolean;
  width?: number;
  onClose: () => void;
}

const DEFAULT_WIDTH = PANEL_DEFAULT_WIDTH;

export function FilesPanel({ workspaceId, serverUrl, apiToken, isOpen, width, onClose }: FilesPanelProps) {
  const isMobile = useIsMobile();
  const setFilesPanelWidth = useUIStore((s) => s.setFilesPanelWidth);
  const storeWidth = width ?? DEFAULT_WIDTH;

  // Local state for smooth drag updates and UI feedback
  const [localWidth, setLocalWidth] = useState(storeWidth);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const liveWidthRef = useRef(0);

  // Sync local width with store width when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalWidth(storeWidth);
    }
  }, [storeWidth]);

  // Clamp width to bounds
  const clampWidth = useCallback((w: number) => {
    return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, w));
  }, []);

  // Handle resize start (mouse and touch)
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
    startWidthRef.current = localWidth;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const delta = startXRef.current - clientX;
      const newWidth = clampWidth(startWidthRef.current + delta);
      liveWidthRef.current = newWidth;
      setLocalWidth(newWidth);
    };

    const handleUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      setFilesPanelWidth(liveWidthRef.current);

      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  }, [localWidth, clampWidth, setFilesPanelWidth]);

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
          <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
            <FileTree
              key={workspaceId}
              workspaceId={workspaceId}
              serverUrl={serverUrl}
              apiToken={apiToken}
              showHidden={true}
            />
          </div>
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
          'relative bg-transparent transition-[width] duration-200 ease-linear',
          !isOpen && 'w-0'
        )}
        style={{ width: isOpen ? localWidth : 0 }}
      />

      {/* Fixed positioned panel */}
      <div
        className={cn(
          'fixed right-0 z-10 bg-sidebar border-l border-border flex flex-col overflow-hidden',
          'transform transition-transform duration-200 ease-linear',
          !isOpen && 'translate-x-full',
          isDragging && 'select-none'
        )}
        style={{
          width: localWidth,
          top: 'env(safe-area-inset-top, 0)',
          bottom: 'env(safe-area-inset-bottom, 0)',
          height: 'calc(100vh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0))',
        }}
      >
        {/* Resize handle on LEFT edge - desktop only */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize group flex items-center justify-center"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
        >
          <div className="w-0.5 h-8 bg-transparent group-hover:bg-border group-active:bg-primary transition-colors rounded-full" />
        </div>

        {/* Panel Header */}
        <div className="flex items-center justify-between p-3 border-b border-border pl-4">
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
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden pl-1">
          <FileTree
            key={workspaceId}
            workspaceId={workspaceId}
            serverUrl={serverUrl}
            apiToken={apiToken}
            showHidden={true}
          />
        </div>
      </div>
    </>
  );
}
