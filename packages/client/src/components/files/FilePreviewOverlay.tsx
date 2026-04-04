import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { FilePreviewTarget } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import FilePreviewContent from './FilePreviewContent';
import { useFilePreview } from '@/hooks/useFilePreview';
import { Button } from '@/components/ui/button';

interface FilePreviewOverlayProps {
  workspaceId: string | undefined;
  target: FilePreviewTarget | null;
  serverUrl: string | undefined;
  apiToken: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FilePreviewOverlay({
  workspaceId,
  target,
  serverUrl,
  apiToken,
  open,
  onOpenChange,
}: FilePreviewOverlayProps) {
  const { data, loading, error, reload } = useFilePreview({
    workspaceId,
    path: target?.path,
    serverUrl,
    apiToken,
    enabled: open && !!target && !!workspaceId,
  });

  if (!target) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true}
        className="sm:max-w-5xl w-[min(92vw,1100px)] h-[85vh] flex flex-col p-0 gap-0"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold truncate">
            {target.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            {target.path}
          </DialogDescription>
          {data && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                {data.kind}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                read-only
              </span>
              <span className="text-xs text-muted-foreground">
                {formatSize(data.size)}
                {data.language && ` · ${data.language}`}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <AlertCircle className="size-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={reload}>
                <RefreshCw className="size-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          )}
          {data && !loading && !error && (
            <FilePreviewContent preview={data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
