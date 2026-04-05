import { Key, Boxes, FileText, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProviderCredentialsPanel } from './configuration/ProviderCredentialsPanel';
import { ModelsPanel } from './configuration/ModelsPanel';
import { PromptsPanel } from './configuration/PromptsPanel';
import { PreconfigsPanel } from './configuration/PreconfigsPanel';

interface ConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverUrl: string | null;
  apiToken: string | null;
}

export function ConfigurationDialog({
  open,
  onOpenChange,
  serverUrl,
  apiToken,
}: ConfigurationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[800px] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
          <DialogDescription>
            Manage providers, models, prompts, and preconfigs
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="providers" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="providers">
              <Key className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Providers</span>
            </TabsTrigger>
            <TabsTrigger value="models">
              <Boxes className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Models</span>
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <FileText className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Prompts</span>
            </TabsTrigger>
            <TabsTrigger value="preconfigs">
              <Layers className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Preconfigs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ProviderCredentialsPanel
                serverUrl={serverUrl}
                apiToken={apiToken}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="models" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ModelsPanel
                serverUrl={serverUrl}
                apiToken={apiToken}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="prompts" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <PromptsPanel
                serverUrl={serverUrl}
                apiToken={apiToken}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preconfigs" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <PreconfigsPanel
                serverUrl={serverUrl}
                apiToken={apiToken}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
