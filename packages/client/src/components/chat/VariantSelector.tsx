import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Brain } from 'lucide-react';

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
  const showCompactIcon = compact && !iconOnly;
  if (!variants || Object.keys(variants).length === 0) {
    return null;
  }

  const variantKeys = Object.keys(variants);

  const handleValueChange = (value: string) => {
    onChangeVariant(value === '__none__' ? null : value);
  };

  return (
    <div className="flex items-center gap-2">
      {!iconOnly && <Label className="text-xs text-muted-foreground">{showCompactIcon ? <Brain className="size-3.5" /> : 'Thinking:'}</Label>}
      <Select
        value={selectedVariant || '__none__'}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className={iconOnly ? 'w-9 h-9 px-0 justify-center gap-0 [&>svg:last-child]:hidden [&_[data-slot=select-value]]:hidden' : 'w-[120px] h-8 text-sm'}>
          {iconOnly && (
            <>
              <Brain className="size-4" />
              <SelectValue className="sr-only" />
            </>
          )}
          {!iconOnly && <SelectValue placeholder="Default" />}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Default</SelectItem>
          {variantKeys.map((key) => (
            <SelectItem key={key} value={key}>
              {capitalize(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
