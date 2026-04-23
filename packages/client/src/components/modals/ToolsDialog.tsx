import type { Jean2Client } from '@jean2/sdk';
import { Wrench } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolsPanel } from './tools/ToolsPanel';

interface ToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sdkClient: Jean2Client | null;
}

export function ToolsDialog({
  open,
  onOpenChange,
  sdkClient,
}: ToolsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[800px] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Tools</DialogTitle>
          <DialogDescription>
            View loaded tools and manage their environment variables
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="tools" className="mt-4">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="tools">
              <Wrench className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Tools &amp; Env</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ToolsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}