import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Preconfig } from '@jean2/shared';

interface PreconfigSelectorProps {
  preconfigs: Preconfig[];
  selectedPreconfigId: string | null | undefined;
  onChangePreconfig: (preconfigId: string) => void;
  disabled?: boolean;
}

export function PreconfigSelector({
  preconfigs,
  selectedPreconfigId,
  onChangePreconfig,
  disabled,
}: PreconfigSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Config:</Label>
      <Select
        value={selectedPreconfigId || ''}
        onValueChange={onChangePreconfig}
        disabled={disabled}
      >
        <SelectTrigger className="w-[140px] h-8 text-sm">
          <SelectValue placeholder="Select config" />
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
