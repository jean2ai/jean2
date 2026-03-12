import { Trash2, Shield } from 'lucide-react';
import type { ToolPermission } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PermissionListItemProps {
  permission: ToolPermission;
  onRevoke: (permissionId: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PermissionListItem({
  permission,
  onRevoke,
}: PermissionListItemProps) {
  const isRevoked = !!permission.revokedAt;

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={isRevoked ? 'outline' : 'secondary'}>
            <Shield className="size-3" data-icon="inline-start" />
            {permission.permissionType}
          </Badge>
          {isRevoked && (
            <Badge variant="outline" className="text-muted-foreground">
              Revoked
            </Badge>
          )}
        </div>
        <p className="text-sm font-mono truncate text-muted-foreground">
          {permission.permissionKey}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Granted {formatDate(permission.grantedAt)}
          {permission.revokedAt && ` • Revoked ${formatDate(permission.revokedAt)}`}
        </p>
      </div>
      {!isRevoked && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRevoke(permission.id)}
          className="size-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
