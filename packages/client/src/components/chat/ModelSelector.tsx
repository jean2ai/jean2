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
      <Label className="text-xs text-muted-foreground">Model:</Label>
      <Select
        value={selectedModelId || ''}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-[180px] h-8 text-sm">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groupedModels).map(([providerName, providerModels]) => (
            <SelectGroup key={providerName}>
              <SelectLabel>{providerName}</SelectLabel>
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <span className="flex items-center gap-2">
                    {model.name}
                    <span className="text-muted-foreground text-xs">
                      {getTierBadge(model.tier)}
                    </span>
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
