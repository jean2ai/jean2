import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import type { Preconfig } from '@jean2/shared';

interface PreconfigSelectorProps {
  preconfigs: Preconfig[];
  selectedPreconfigId: string | null | undefined;
  onChangePreconfig: (preconfigId: string) => void;
  disabled?: boolean;
  iconOnly?: boolean;
}

export function PreconfigSelector({
  preconfigs,
  selectedPreconfigId,
  onChangePreconfig,
  disabled,
  iconOnly = false,
}: PreconfigSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {!iconOnly && <Label className="text-xs text-muted-foreground">Config:</Label>}
      <Select
        value={selectedPreconfigId || ''}
        onValueChange={onChangePreconfig}
        disabled={disabled}
      >
        <SelectTrigger className={iconOnly ? 'w-9 h-9 px-0 justify-center gap-0 [&>svg:last-child]:hidden [&_[data-slot=select-value]]:hidden' : 'w-[140px] h-8 text-sm'}>
          {iconOnly ? (
            <>
              <Settings className="size-4" />
              <SelectValue className="sr-only" />
            </>
          ) : (
            <SelectValue placeholder="Select config" />
          )}
        </SelectTrigger>
        <SelectContent>
          {preconfigs.map((preconfig) => (
            <SelectItem key={preconfig.id} value={preconfig.id}>
              {preconfig.name}
              {preconfig.isDefault && (
                <span className="ml-2 text-muted-foreground text-xs">
                  (default)
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
