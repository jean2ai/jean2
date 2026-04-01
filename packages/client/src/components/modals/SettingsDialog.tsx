import { useState } from 'react';
import { Sun, Moon, Monitor, RefreshCw, Trash2, Shield, Link2, User, Palette, Keyboard, Volume2, VolumeX } from 'lucide-react';
import type { ToolPermission } from '@jean2/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme } from '@/components/providers/ThemeProvider';
import type { ThemeScheme } from '@/components/providers/ThemeProvider';
import { PermissionListItem } from './PermissionListItem';
import { ConfirmDialog } from './ConfirmDialog';
import { ProviderCard } from '@/components/providers/ProviderCard';
import type { ProviderStatus } from '@jean2/shared';
import LogoutButton from '@/components/LogoutButton';
import { VersionInfo } from '@/components/VersionInfo';

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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: ToolPermission[];
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: () => void;
  apiToken: string | null;
  onLogout: () => void;
  providerStatuses: ProviderStatus[];
  onConnectProvider: (provider: string) => void;
  onDisconnectProvider: (provider: string) => void;
  chatFinishSoundEnabled: boolean;
  onChatFinishSoundEnabledChange: (enabled: boolean) => void;
  permissionSoundEnabled: boolean;
  onPermissionSoundEnabledChange: (enabled: boolean) => void;
  serverUrl: string | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  permissions,
  onRefreshPermissions,
  onRevokePermission,
  onRevokeAllPermissions,
  apiToken,
  onLogout,
  providerStatuses,
  onConnectProvider,
  onDisconnectProvider,
  chatFinishSoundEnabled,
  onChatFinishSoundEnabledChange,
  permissionSoundEnabled,
  onPermissionSoundEnabledChange,
  serverUrl,
}: SettingsDialogProps) {
  const { mode, scheme, setMode, setScheme } = useTheme();
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  const isMac = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' || /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { keys: [mod, '1'], description: 'Open session list' },
    { keys: [mod, 'T'], description: 'Open terminal' },
    { keys: [mod, 'O'], description: 'Toggle overview mode' },
    { keys: [mod, 'N'], description: 'New session' },
    { keys: [mod, 'Shift', 'N'], description: 'New window' },
    { keys: ['Shift', 'Esc'], description: 'Close focused panel' },

    { keys: ['Shift', 'Enter'], description: 'New line in input' },
    { keys: ['Enter'], description: 'Send message' },
    { keys: ['↑', '↓', '←', '→'], description: 'Navigate sessions' },
    { keys: ['Esc'], description: 'Focus chat input' },
    { keys: ['Esc', 'Esc'], description: 'Stop streaming (chat input focused)' },
  ];

  const activePermissions = permissions.filter((p) => !p.revokedAt);
  const revokedPermissions = permissions.filter((p) => p.revokedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your preferences and permissions
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="account" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="account">
              <User className="size-4 sm:size-3" data-icon="inline-start" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="size-4 sm:size-3" data-icon="inline-start" />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Shield className="size-4 sm:size-3" data-icon="inline-start" />
              <span className="hidden sm:inline">Permissions</span>
              {activePermissions.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold leading-none text-primary-foreground sm:static sm:flex sm:size-auto sm:ml-1.5 sm:px-1.5 sm:py-0.5 sm:text-xs sm:font-medium sm:leading-normal">
                  {activePermissions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Link2 className="size-4 sm:size-3" data-icon="inline-start" />
              <span className="hidden sm:inline">Providers</span>
            </TabsTrigger>
            <TabsTrigger value="keybinds">
              <Keyboard className="size-4 sm:size-3" data-icon="inline-start" />
              <span className="hidden sm:inline">Keybinds</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-4">
            <div className="flex flex-col gap-4">
              <div>
                <Label className="text-sm font-medium">Session</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Manage your current session
                </p>
                {apiToken ? (
                  <LogoutButton token={apiToken} onLogout={onLogout} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active session
                  </p>
                )}
              </div>

              <Separator />

              <VersionInfo serverUrl={serverUrl} enabled={open} />
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="mt-4">
            <div className="flex flex-col gap-4">
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
                      onClick={() => onChatFinishSoundEnabledChange(!chatFinishSoundEnabled)}
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
                      onClick={() => onPermissionSoundEnabledChange(!permissionSoundEnabled)}
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

          <TabsContent value="permissions" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Always-allowed Operations
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Tools you've approved to run without asking
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onRefreshPermissions}
                    className="size-8"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  {activePermissions.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowRevokeAllConfirm(true)}
                    >
                      <Trash2 className="size-4" data-icon="inline-start" />
                      Revoke All
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <ScrollArea className="h-[300px]">
                {activePermissions.length === 0 && revokedPermissions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No permissions granted yet.
                    <br />
                    Approve tool requests with "Always allow" to add them here.
                  </div>
                )}

                {activePermissions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs uppercase text-muted-foreground mb-2 font-medium">
                      Active ({activePermissions.length})
                    </h4>
                    {activePermissions.map((permission) => (
                      <PermissionListItem
                        key={permission.id}
                        permission={permission}
                        onRevoke={onRevokePermission}
                      />
                    ))}
                  </div>
                )}

                {revokedPermissions.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase text-muted-foreground mb-2 font-medium">
                      Revoked ({revokedPermissions.length})
                    </h4>
                    {revokedPermissions.map((permission) => (
                      <PermissionListItem
                        key={permission.id}
                        permission={permission}
                        onRevoke={onRevokePermission}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="providers" className="mt-4">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect subscription-based providers to use models without API keys.
                </p>
                <div className="flex flex-col gap-3">
                  {providerStatuses.map((status) => (
                    <ProviderCard
                      key={status.provider}
                      provider={status}
                      onConnect={() => onConnectProvider(status.provider)}
                      onDisconnect={() => onDisconnectProvider(status.provider)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="keybinds" className="mt-4">
            <div className="flex flex-col gap-2">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-1">
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
                  <span className="text-sm text-muted-foreground">
                    {shortcut.description}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      <ConfirmDialog
        open={showRevokeAllConfirm}
        onOpenChange={setShowRevokeAllConfirm}
        title="Revoke All Permissions"
        description="This will revoke all always-allowed permissions for this workspace. You'll need to approve these tools again when they're used."
        confirmLabel="Revoke All"
        variant="destructive"
        onConfirm={() => {
          onRevokeAllPermissions();
          setShowRevokeAllConfirm(false);
        }}
      />
    </Dialog>
  );
}
