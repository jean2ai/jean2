import { useState } from 'react';
import { Check, ChevronsUpDown, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  compact?: boolean;
  iconOnly?: boolean;
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
  compact = false,
  iconOnly = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.providerName]) {
      acc[model.providerName] = [];
    }
    acc[model.providerName].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  const handleSelect = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      onChangeModel(modelId, model.providerId);
      setOpen(false);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  if (iconOnly) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select model"
            disabled={disabled}
          >
            <Cpu className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0">
          <Command>
            <CommandInput placeholder="Search model..." />
            <CommandList className="max-h-[50vh] overflow-y-auto">
              <CommandEmpty>No model found.</CommandEmpty>
              {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                <CommandGroup key={providerName} heading={providerName}>
                  {providerModels.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => handleSelect(model.id)}
                      className="justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span>{model.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {getTierBadge(model.tier)}
                        </span>
                      </div>
                      <Check
                        className={cn(
                          'size-4',
                          selectedModelId === model.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select model"
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:bg-accent"
            disabled={disabled}
          >
            <Cpu className="size-4 flex-shrink-0 text-muted-foreground" />
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0">
          <Command>
            <CommandInput placeholder="Search model..." />
            <CommandList className="max-h-[50vh] overflow-y-auto">
              <CommandEmpty>No model found.</CommandEmpty>
              {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                <CommandGroup key={providerName} heading={providerName}>
                  {providerModels.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => handleSelect(model.id)}
                      className="justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span>{model.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {getTierBadge(model.tier)}
                        </span>
                      </div>
                      <Check
                        className={cn(
                          'size-4',
                          selectedModelId === model.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Select model"
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:bg-accent"
          disabled={disabled}
        >
          <Cpu className="size-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selectedModel?.name || 'Select model'}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        <Command>
          <CommandInput placeholder="Search model..." />
          <CommandList className="max-h-[50vh] overflow-y-auto">
            <CommandEmpty>No model found.</CommandEmpty>
            {Object.entries(groupedModels).map(([providerName, providerModels]) => (
              <CommandGroup key={providerName} heading={providerName}>
                {providerModels.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => handleSelect(model.id)}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span>{model.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {getTierBadge(model.tier)}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'size-4',
                        selectedModelId === model.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
