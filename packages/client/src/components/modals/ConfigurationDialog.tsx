import type { Jean2Client } from '@jean2/sdk';
import { Key, Boxes, FileText, Layers, Link2, Braces } from 'lucide-react';
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
import { OAuthProvidersPanel } from './configuration/OAuthProvidersPanel';
import { ModelsPanel } from './configuration/ModelsPanel';
import { PromptsPanel } from './configuration/PromptsPanel';
import { PreconfigsPanel } from './configuration/PreconfigsPanel';
import { ResponseFormatsPanel } from './configuration/ResponseFormatsPanel';

interface ConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sdkClient: Jean2Client | null;
}

export function ConfigurationDialog({
  open,
  onOpenChange,
  sdkClient,
}: ConfigurationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[800px] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
          <DialogDescription>
            Manage credentials, OAuth providers, models, prompts, preconfigs, and response formats
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="providers" className="mt-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="providers">
              <Key className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Credentials</span>
            </TabsTrigger>
            <TabsTrigger value="oauth">
              <Link2 className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">OAuth</span>
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
            <TabsTrigger value="response-formats">
              <Braces className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Formats</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ProviderCredentialsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="oauth" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <OAuthProvidersPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="models" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ModelsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="prompts" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <PromptsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preconfigs" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <PreconfigsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="response-formats" className="mt-4">
            <ScrollArea className="h-[calc(100dvh-14rem)] sm:h-[500px]">
              <ResponseFormatsPanel sdkClient={sdkClient} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
