import { useState } from 'react';
import { Sun, Moon, Monitor, User, Palette, Keyboard, Volume2, VolumeX } from 'lucide-react';
import type { Jean2Client } from '@jean2/sdk';
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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/components/providers/ThemeProvider';
import type { ThemeScheme } from '@/components/providers/ThemeProvider';

import LogoutButton from '@/components/LogoutButton';
import { VersionInfo } from '@/components/VersionInfo';
import { useUIStore } from '@/stores/uiStore';

interface SchemeButtonProps {
  scheme: ThemeScheme;
  currentScheme: ThemeScheme;
  onClick: (scheme: ThemeScheme) => void;
}

const schemeConfig: Record<ThemeScheme, { label: string; colors: string[] }> = {
  neutral: { label: 'Neutral', colors: ['bg-zinc-400', 'bg-zinc-600', 'bg-zinc-800'] },
  ocean: { label: 'Ocean', colors: ['bg-sky-300', 'bg-sky-500', 'bg-slate-700'] },
  forest: { label: 'Forest', colors: ['bg-emerald-300', 'bg-emerald-500', 'bg-green-800'] },
  sunset: { label: 'Sunset', colors: ['bg-orange-300', 'bg-amber-500', 'bg-orange-800'] },
  amethyst: { label: 'Amethyst', colors: ['bg-violet-300', 'bg-violet-500', 'bg-purple-800'] },
};

function SchemeButton({ scheme, currentScheme, onClick }: SchemeButtonProps) {
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

type SettingsSection = 'account' | 'appearance' | 'keybinds';

const SECTIONS: { value: SettingsSection; label: string; icon: typeof User }[] = [
  { value: 'account', label: 'Account', icon: User },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'keybinds', label: 'Keybinds', icon: Keyboard },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiToken: string | null;
  isConnected: boolean;
  onLogout: () => void;
  sdkClient: Jean2Client | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  apiToken,
  isConnected,
  onLogout,
  sdkClient,
}: SettingsDialogProps) {
  const { mode, scheme, setMode, setScheme } = useTheme();
  const [section, setSection] = useState<SettingsSection>('account');

  const { chatFinishSoundEnabled, setChatFinishSoundEnabled, permissionSoundEnabled, setPermissionSoundEnabled } = useUIStore(
    useShallow((s) => ({
      chatFinishSoundEnabled: s.chatFinishSoundEnabled,
      setChatFinishSoundEnabled: s.setChatFinishSoundEnabled,
      permissionSoundEnabled: s.permissionSoundEnabled,
      setPermissionSoundEnabled: s.setPermissionSoundEnabled,
    })),
  );

  const isMac = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' || /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { keys: [mod, '1'], description: 'Open session list' },
    { keys: [mod, '2'], description: 'Open files panel' },
    { keys: [mod, 'T'], description: 'Open terminal' },
    { keys: [mod, 'O'], description: 'Toggle overview mode' },
    { keys: [mod, 'N'], description: 'New session' },
    { keys: [mod, 'Shift', 'N'], description: 'New window' },
    { keys: [mod, 'Shift', 'F'], description: 'Toggle follow/free mode' },
    { keys: ['Shift', 'Esc'], description: 'Close focused panel' },
    { keys: ['Shift', 'Enter'], description: 'New line in input' },
    { keys: ['Enter'], description: 'Send message' },
    { keys: ['↑', '↓', '←', '→'], description: 'Navigate sessions' },
    { keys: ['Esc'], description: 'Focus chat input' },
    { keys: ['Esc', 'Esc'], description: 'Stop streaming (chat input focused)' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 max-w-[calc(100vw-0.5rem)] sm:max-w-[700px] h-[85dvh] sm:h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your preferences
          </DialogDescription>
        </DialogHeader>

        {/* Mobile: Select dropdown */}
        <Select value={section} onValueChange={(v) => setSection(v as SettingsSection)}>
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
          onValueChange={(v) => setSection(v as SettingsSection)}
          orientation="vertical"
          className="mt-2 flex-1 min-h-0"
        >
          {/* Desktop sidebar */}
          <TabsList className="hidden sm:flex flex-col h-fit w-40 shrink-0 items-stretch gap-0.5 bg-transparent p-1 rounded-lg">
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

          {/* Shared content area */}
          <div className="dialog-scrollbar flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain rounded-lg border">
              <TabsContent value="account" className="mt-0">
                <div className="p-3 sm:p-4 flex flex-col gap-4">
                  <div>
                    <Label className="text-sm font-medium">Session</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Manage your current session
                    </p>
                    {isConnected ? (
                      <LogoutButton token={apiToken} onLogout={onLogout} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active session
                      </p>
                    )}
                  </div>

                  <Separator />

                  <VersionInfo sdkClient={sdkClient} enabled={open} />
                </div>
              </TabsContent>

              <TabsContent value="appearance" className="mt-0">
                <div className="p-3 sm:p-4 flex flex-col gap-4">
                  <div>
                    <Label className="text-sm font-medium">Mode</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Choose light, dark, or system theme
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={mode === 'light' ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => setMode('light')}
                      >
                        <Sun className="size-4" data-icon="inline-start" />
                        Light
                      </Button>
                      <Button
                        variant={mode === 'dark' ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => setMode('dark')}
                      >
                        <Moon className="size-4" data-icon="inline-start" />
                        Dark
                      </Button>
                      <Button
                        variant={mode === 'system' ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => setMode('system')}
                      >
                        <Monitor className="size-4" data-icon="inline-start" />
                        System
                      </Button>
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
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chatFinishSoundEnabled ? 'bg-primary' : 'bg-muted'}`}
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
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${permissionSoundEnabled ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${permissionSoundEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-sm font-medium">Color Scheme</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Choose your preferred color palette
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      <SchemeButton
                        scheme="neutral"
                        currentScheme={scheme}
                        onClick={setScheme}
                      />
                      <SchemeButton
                        scheme="ocean"
                        currentScheme={scheme}
                        onClick={setScheme}
                      />
                      <SchemeButton
                        scheme="forest"
                        currentScheme={scheme}
                        onClick={setScheme}
                      />
                      <SchemeButton
                        scheme="sunset"
                        currentScheme={scheme}
                        onClick={setScheme}
                      />
                      <SchemeButton
                        scheme="amethyst"
                        currentScheme={scheme}
                        onClick={setScheme}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="keybinds" className="mt-0">
                <div className="p-3 sm:p-4 flex flex-col gap-2">
                  {shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex}>
                            <kbd className="font-mono bg-muted rounded px-2 py-1 text-xs">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="mx-1 text-muted-foreground">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground text-right">
                        {shortcut.description}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
