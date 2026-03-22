import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Cpu } from 'lucide-react';

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModelId: string | null | undefined;
  onChangeModel: (modelId: string, providerId: string) => void;
  disabled?: boolean;
  iconOnly?: boolean;
  codexConnected?: boolean;
}

function getTierBadge(tier: string): string {
  switch (tier) {
    case 'budget': return '$';
    case 'standard': return '$$';
    case 'premium': return '$$$';
    default: return '';
  }
}

export function ModelSelector({
  models,
  selectedModelId,
  onChangeModel,
  disabled,
  iconOnly = false,
  codexConnected = false,
}: ModelSelectorProps) {
  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.providerName]) {
      acc[model.providerName] = [];
    }
    acc[model.providerName].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  const handleValueChange = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      onChangeModel(modelId, model.providerId);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!iconOnly && <Label className="text-xs text-muted-foreground">Model:</Label>}
      <Select
        value={selectedModelId || ''}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className={iconOnly ? 'w-9 h-9 px-0 justify-center gap-0 [&>svg:last-child]:hidden [&_[data-slot=select-value]]:hidden' : 'w-[180px] h-8 text-sm'}>
          {iconOnly ? (
            <>
              <Cpu className="size-4" />
              <SelectValue className="sr-only" />
            </>
          ) : (
            <SelectValue placeholder="Select model" />
          )}
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groupedModels).map(([providerName, providerModels]) => (
            <SelectGroup key={providerName}>
              <SelectLabel>{providerName}</SelectLabel>
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id} disabled={model.providerId === 'codex' && !codexConnected}>
                  <span className="flex items-center gap-2">
                    {model.name}
                    <span className="text-muted-foreground text-xs">
                      {getTierBadge(model.tier)}
                    </span>
                    {model.providerId === 'codex' && codexConnected && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        Sub
                      </Badge>
                    )}
                    {model.providerId === 'codex' && !codexConnected && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        OAuth
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
