import { useState } from 'react';
import { Brain, ChevronsUpDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
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

interface VariantOption {
  providerOptions: Record<string, unknown>;
}

interface VariantSelectorProps {
  variants: Record<string, VariantOption> | undefined;
  selectedVariant: string | null;
  onChangeVariant: (variant: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}

const VARIANT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  minimal: 'Minimal',
  max: 'Max',
};

function capitalize(key: string): string {
  return VARIANT_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

export function VariantSelector({
  variants,
  selectedVariant,
  onChangeVariant,
  disabled,
  compact = false,
  iconOnly = false,
}: VariantSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!variants || Object.keys(variants).length === 0) {
    return null;
  }

  const variantKeys = Object.keys(variants);

  const handleSelect = (value: string) => {
    onChangeVariant(value === '__none__' ? null : value);
    setOpen(false);
  };

  const selectedLabel = selectedVariant ? capitalize(selectedVariant) : 'Default';

  const commandList = (
    <Command>
      <CommandInput placeholder="Search..." />
      <CommandList className="max-h-[50vh] overflow-y-auto">
        <CommandItem
          key="__none__"
          value="__none__"
          onSelect={() => handleSelect('__none__')}
          className="justify-between"
        >
          <span>Default</span>
          <Check
            className={cn(
              'size-4',
              selectedVariant === null ? 'opacity-100' : 'opacity-0',
            )}
          />
        </CommandItem>
        {variantKeys.map((key) => (
          <CommandItem
            key={key}
            value={key}
            onSelect={() => handleSelect(key)}
            className="justify-between"
          >
            <span>{capitalize(key)}</span>
            <Check
              className={cn(
                'size-4',
                selectedVariant === key ? 'opacity-100' : 'opacity-0',
              )}
            />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );

  if (iconOnly) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select variant"
            disabled={disabled}
          >
            <Brain className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0">
          {commandList}
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
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:bg-accent"
            role="combobox"
            aria-expanded={open}
            aria-label="Select variant"
            disabled={disabled}
          >
            <Brain className="size-4 flex-shrink-0 text-muted-foreground" />
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0">
          {commandList}
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
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:bg-accent"
          role="combobox"
          aria-expanded={open}
          aria-label="Select variant"
          disabled={disabled}
        >
          <Brain className="size-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        {commandList}
      </PopoverContent>
    </Popover>
  );
}