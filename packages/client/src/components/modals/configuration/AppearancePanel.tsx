import { Sun, Moon, Monitor, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/components/providers/ThemeProvider';
import type { ThemeScheme } from '@/components/providers/ThemeProvider';
import { useUIStore } from '@/stores/uiStore';
import { NotificationSettings } from './NotificationSettings';

type ThemeMode = 'light' | 'dark' | 'system';

const schemeConfig: Record<ThemeScheme, { label: string; colors: string[] }> = {
  neutral: { label: 'Neutral', colors: ['bg-zinc-400', 'bg-zinc-600', 'bg-zinc-800'] },
  ocean: { label: 'Ocean', colors: ['bg-sky-300', 'bg-sky-500', 'bg-slate-700'] },
  forest: { label: 'Forest', colors: ['bg-emerald-300', 'bg-emerald-500', 'bg-green-800'] },
  sunset: { label: 'Sunset', colors: ['bg-orange-300', 'bg-amber-500', 'bg-orange-800'] },
  amethyst: { label: 'Amethyst', colors: ['bg-violet-300', 'bg-violet-500', 'bg-purple-800'] },
};

function SchemeButton({ scheme, currentScheme, onClick }: { scheme: ThemeScheme; currentScheme: ThemeScheme; onClick: (scheme: ThemeScheme) => void }) {
  const isSelected = scheme === currentScheme;
  const config = schemeConfig[scheme];

  return (
    <button
      type="button"
      onClick={() => onClick(scheme)}
      className={`
        flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all
        ${isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-transparent hover:bg-muted/50'
        }
      `}
      title={config.label}
    >
      <div className="flex gap-0.5">
        {config.colors.map((color, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full ${color}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground capitalize">{scheme}</span>
    </button>
  );
}

export function AppearancePanel() {
  const { mode, scheme, setMode, setScheme } = useTheme();
  const { chatFinishSoundEnabled, setChatFinishSoundEnabled, permissionSoundEnabled, setPermissionSoundEnabled } = useUIStore(
    useShallow((s) => ({
      chatFinishSoundEnabled: s.chatFinishSoundEnabled,
      setChatFinishSoundEnabled: s.setChatFinishSoundEnabled,
      permissionSoundEnabled: s.permissionSoundEnabled,
      setPermissionSoundEnabled: s.setPermissionSoundEnabled,
    })),
  );

  return (
    <div className="p-3 sm:p-4 flex flex-col gap-4">
      <div>
        <Label className="text-sm font-medium">Mode</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Choose light, dark, or system theme
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'light', icon: Sun, label: 'Light' },
            { value: 'dark', icon: Moon, label: 'Dark' },
            { value: 'system', icon: Monitor, label: 'System' },
          ] as const).map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              variant={mode === value ? 'default' : 'outline'}
              className="justify-start"
              onClick={() => setMode(value as ThemeMode)}
            >
              <Icon className="size-4" data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium mb-3 block">Notification Sounds</Label>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="size-4 text-muted-foreground" />
              <span className="text-sm">Chat completion</span>
            </div>
            <button
              type="button"
              onClick={() => setChatFinishSoundEnabled(!chatFinishSoundEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chatFinishSoundEnabled ? 'bg-[var(--switch-checked)]' : 'bg-muted'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${chatFinishSoundEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VolumeX className="size-4 text-muted-foreground" />
              <span className="text-sm">Permission requests</span>
            </div>
            <button
              type="button"
              onClick={() => setPermissionSoundEnabled(!permissionSoundEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${permissionSoundEnabled ? 'bg-[var(--switch-checked)]' : 'bg-muted'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${permissionSoundEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
      </div>

      <Separator />

      <NotificationSettings />

      <Separator />

      <div>
        <Label className="text-sm font-medium">Color Scheme</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Choose your preferred color palette
        </p>
        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(schemeConfig) as ThemeScheme[]).map((s) => (
            <SchemeButton
              key={s}
              scheme={s}
              currentScheme={scheme}
              onClick={setScheme}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
