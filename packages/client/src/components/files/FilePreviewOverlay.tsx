import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { Jean2Client } from '@jean2/sdk';
import type { FilePreviewTarget } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { FileCodeView } from './FileCodeView';
import FilePreviewContent from './FilePreviewContent';
import { useFilePreview } from '@/hooks/useFilePreview';
import { useFileGitDiffQuery } from '@/hooks/queries';
import { Button } from '@/components/ui/button';

interface FilePreviewOverlayProps {
  workspaceId: string | undefined;
  target: FilePreviewTarget | null;
  sdkClient: Jean2Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function hasContent(preview: { kind: string }): preview is { kind: 'code' | 'text' | 'markdown'; content: string } {
  return preview.kind === 'code' || preview.kind === 'text' || preview.kind === 'markdown';
}

export default function FilePreviewOverlay({
  workspaceId,
  target,
  sdkClient,
  open,
  onOpenChange,
}: FilePreviewOverlayProps) {
  const { data, loading, error, reload } = useFilePreview({
    workspaceId,
    path: target?.path,
    root: target?.root,
    sdkClient,
    enabled: open && !!target && !!workspaceId,
  });

  const diffQuery = useFileGitDiffQuery(
    sdkClient,
    workspaceId,
    target?.path,
    target?.root,
    open && !!target && !!workspaceId,
  );

  const diffData = diffQuery.data?.diffAvailable ? diffQuery.data : undefined;

  const handleRefresh = () => {
    reload();
    diffQuery.refetch();
  };

  if (!target) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <AlertCircle className="size-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="size-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }

    if (!data) return null;

    // Markdown: Source / Preview tabs
    if (data.kind === 'markdown') {
      return (
        <Tabs defaultValue="preview" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-3 shrink-0 w-fit">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-auto p-6 chat-transcript-scrollbar">
            <MarkdownRenderer>{data.content}</MarkdownRenderer>
          </TabsContent>
          <TabsContent value="source" className="flex-1 min-h-0 mt-0">
            <FileCodeView
              content={data.content}
              language={data.language}
              diff={diffData ? { hunks: diffData.hunks, additions: diffData.additions, deletions: diffData.deletions } : undefined}
            />
          </TabsContent>
        </Tabs>
      );
    }

    // Code / text: unified code view with diff highlights
    if (hasContent(data)) {
      return (
        <FileCodeView
          content={data.content}
          language={data.language}
          diff={diffData ? { hunks: diffData.hunks, additions: diffData.additions, deletions: diffData.deletions } : undefined}
        />
      );
    }

    // Binary, too large, unsupported — keep existing status panels
    return <FilePreviewContent preview={data} />;
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            className="absolute right-12 top-4"
          >
            <RefreshCw className="size-4" />
          </Button>
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
              {diffData && (
                <>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                    +{diffData.additions}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-600">
                    -{diffData.deletions}
                  </span>
                </>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
