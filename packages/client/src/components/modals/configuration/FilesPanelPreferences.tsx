import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/stores/uiStore';
import type { DefaultFileOpenMode } from '@/stores/uiStore';

export function FilesPanelPreferences() {
  const defaultFileOpenMode = useUIStore((s) => s.defaultFileOpenMode);
  const setDefaultFileOpenMode = useUIStore((s) => s.setDefaultFileOpenMode);

  return (
    <div className="p-3 sm:p-4 flex flex-col gap-4">
      <div>
        <Label className="text-sm font-medium">Default Open Mode</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Choose what happens when you click a file. Right-click always offers both actions.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'preview' as const, icon: Eye, label: 'Preview files' },
            { value: 'edit' as const, icon: Pencil, label: 'Edit files' },
          ]).map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              variant={defaultFileOpenMode === value ? 'default' : 'outline'}
              className="justify-start"
              onClick={() => setDefaultFileOpenMode(value as DefaultFileOpenMode)}
            >
              <Icon className="size-4" data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FilesPanelPreferences;
