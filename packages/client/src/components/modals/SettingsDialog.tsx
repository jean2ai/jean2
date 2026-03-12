import { useState } from 'react';
import { Sun, Moon, Monitor, RefreshCw, Trash2, Shield } from 'lucide-react';
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
import { PermissionListItem } from './PermissionListItem';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: ToolPermission[];
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  permissions,
  onRefreshPermissions,
  onRevokePermission,
  onRevokeAllPermissions,
}: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);
  
  const activePermissions = permissions.filter((p) => !p.revokedAt);
  const revokedPermissions = permissions.filter((p) => p.revokedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your preferences and permissions
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="permissions">
              <Shield className="size-3" data-icon="inline-start" />
              Permissions
              {activePermissions.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                  {activePermissions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="mt-4">
            <div className="flex flex-col gap-4">
              <div>
                <Label className="text-sm font-medium">Theme</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose your preferred color scheme
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="size-4" data-icon="inline-start" />
                    Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="size-4" data-icon="inline-start" />
                    Dark
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setTheme('system')}
                  >
                    <Monitor className="size-4" data-icon="inline-start" />
                    System
                  </Button>
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
