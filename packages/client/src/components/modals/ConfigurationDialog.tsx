import type { Jean2Client } from '@jean2/sdk';
import { Key, Boxes, FileText, Layers, Link2, Braces, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore } from '@/stores/uiStore';
import type { ConfigurationSection } from '@/stores/uiStore';
import { ProviderCredentialsPanel } from './configuration/ProviderCredentialsPanel';
import { OAuthProvidersPanel } from './configuration/OAuthProvidersPanel';
import { ModelsPanel } from './configuration/ModelsPanel';
import { PromptsPanel } from './configuration/PromptsPanel';
import { PreconfigsPanel } from './configuration/PreconfigsPanel';
import { ResponseFormatsPanel } from './configuration/ResponseFormatsPanel';
import { EnvPanel } from './configuration/EnvPanel';

interface ConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sdkClient: Jean2Client | null;
}

interface SectionDef {
  value: ConfigurationSection;
  label: string;
  icon: typeof Key;
}

const SECTIONS: SectionDef[] = [
  { value: 'providers', label: 'Credentials', icon: Key },
  { value: 'oauth', label: 'OAuth', icon: Link2 },
  { value: 'models', label: 'Models', icon: Boxes },
  { value: 'prompts', label: 'Prompts', icon: FileText },
  { value: 'preconfigs', label: 'Preconfigs', icon: Layers },
  { value: 'response-formats', label: 'Formats', icon: Braces },
  { value: 'env', label: 'Environment', icon: Terminal },
];

function renderPanel(value: ConfigurationSection, sdkClient: Jean2Client | null) {
  switch (value) {
    case 'providers':
      return <ProviderCredentialsPanel sdkClient={sdkClient} />;
    case 'oauth':
      return <OAuthProvidersPanel sdkClient={sdkClient} />;
    case 'models':
      return <ModelsPanel sdkClient={sdkClient} />;
    case 'prompts':
      return <PromptsPanel sdkClient={sdkClient} />;
    case 'preconfigs':
      return <PreconfigsPanel sdkClient={sdkClient} />;
    case 'response-formats':
      return <ResponseFormatsPanel sdkClient={sdkClient} />;
    case 'env':
      return <EnvPanel sdkClient={sdkClient} />;
  }
}

export function ConfigurationDialog({
  open,
  onOpenChange,
  sdkClient,
}: ConfigurationDialogProps) {
  const section = useUIStore((s) => s.configurationSection);
  const setSection = useUIStore((s) => s.setConfigurationSection);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 max-w-[calc(100vw-0.5rem)] sm:max-w-[860px] h-[85dvh] sm:h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Configuration</DialogTitle>
          <DialogDescription>
            Manage credentials, OAuth providers, models, prompts, preconfigs, response formats, and environment variables
          </DialogDescription>
        </DialogHeader>

        {/* Mobile: Select dropdown */}
        <Select
          value={section}
          onValueChange={(v) => setSection(v as ConfigurationSection)}
        >
          <SelectTrigger className="sm:hidden w-full shrink-0" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <s.icon className="size-4" />
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as ConfigurationSection)}
          orientation="vertical"
          className="mt-2 flex-1 min-h-0"
        >
          {/* Desktop sidebar */}
          <TabsList className="hidden sm:flex flex-col h-fit w-44 lg:w-48 shrink-0 items-stretch gap-0.5 bg-transparent p-1 rounded-lg">
            {SECTIONS.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="justify-start px-3 py-1.5 text-sm"
              >
                <s.icon className="size-4" data-icon="inline-start" />
                <span>{s.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Shared content area — flex-grows to fill; min-h-0 + overflow-y-auto
              makes it scroll instead of pushing the dialog taller. */}
          <div className="dialog-scrollbar flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain rounded-lg border">
            {SECTIONS.map((s) => (
              <TabsContent key={s.value} value={s.value} className="mt-0">
                {renderPanel(s.value, sdkClient)}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
