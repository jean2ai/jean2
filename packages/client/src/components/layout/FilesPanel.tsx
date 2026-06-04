import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type { FileEntry } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { X, RefreshCw } from 'lucide-react';
import { FileTree, type FileTreeHandle } from '@/components/files';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  PanelResizeHandle,
} from '@/components/ui/sidebar';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { platform } from '@/platform';

interface FilesPanelProps {
  sdkClient: Jean2Client | null;
}

export interface FilesPanelHandle {
  focus: () => void;
}

export const FilesPanel = forwardRef<FilesPanelHandle, FilesPanelProps>(
  ({ sdkClient }, ref) => {
    const isMobile = useIsMobile();
    const fileTreeRef = useRef<FileTreeHandle>(null);
    const filesPanelWidth = useChatLayoutStore((s) => s.filesPanelWidth);
    const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
    const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
    const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
    const workspaceId = activeWorkspace?.id;

    const focus = useCallback(() => {
      setShowFilesPanel(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fileTreeRef.current?.focus();
        });
      });
    }, [setShowFilesPanel]);

    useImperativeHandle(ref, () => ({ focus }), [focus]);

    const openFilePreview = useUIStore((s) => s.openFilePreview);

    const handleFileSelect = useCallback((file: FileEntry) => {
      if (file.type === 'file' && workspaceId) {
        if (platform.capabilities.fileOpen && platform.openFile) {
          const workspacePath = activeWorkspace?.path ?? '';
          const absPath = workspacePath ? `${workspacePath}/${file.path}` : file.path;
          void platform.openFile(absPath);
        } else {
          openFilePreview({
            workspaceId,
            path: file.path,
            name: file.name,
          });
        }
      }
    }, [workspaceId, openFilePreview, activeWorkspace?.path]);

    if (!workspaceId) {
      return null;
    }

    if (isMobile) {
      return (
        <Sheet open={showFilesPanel} onOpenChange={(open) => !open && setShowFilesPanel(false)}>
          <SheetContent side="right" className="w-72 p-0 bg-sidebar [&>button]:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Files</SheetTitle>
            </SheetHeader>
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="font-semibold text-sm text-sidebar-foreground">Files</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowFilesPanel(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
              <FileTree
                ref={fileTreeRef}
                key={workspaceId}
                workspaceId={workspaceId}
                sdkClient={sdkClient}
                showHidden={true}
                onFileSelect={handleFileSelect}
              />
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <SidebarProvider
        panelId="files"
        defaultOpen={true}
        className="w-0 shrink-0"
        style={{ '--sidebar-width': `${filesPanelWidth}px` } as React.CSSProperties}
      >
        <Sidebar side="right" isOpen={showFilesPanel} variant="floating">
          <PanelResizeHandle side="right" panelId="files" />
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="w-full justify-between" onClick={() => fileTreeRef.current?.refresh()}>
                  <span className="text-sm font-semibold">Files</span>
                  <RefreshCw className="size-4" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="overflow-hidden">
            <FileTree
              ref={fileTreeRef}
              key={workspaceId}
              workspaceId={workspaceId}
              sdkClient={sdkClient}
              showHidden={true}
              width={filesPanelWidth}
              onFileSelect={handleFileSelect}
            />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
  }
);

FilesPanel.displayName = 'FilesPanel';