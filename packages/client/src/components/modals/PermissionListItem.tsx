import { Trash2, Shield } from 'lucide-react';
import type { PermissionGrant } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PermissionListItemProps {
  permission: PermissionGrant;
  onRevoke: (permissionId: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatScope(scope: string): string {
  switch (scope) {
    case 'once': return 'Once';
    case 'session': return 'Session';
    case 'workspace': return 'Workspace';
    case 'always': return 'Always';
    default: return scope;
  }
}

export function PermissionListItem({
  permission,
  onRevoke,
}: PermissionListItemProps) {
  const isRevoked = !!permission.revokedAt;
  const patternDisplay = permission.patterns.length > 0
    ? permission.patterns.join(', ')
    : 'All';

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant={isRevoked ? 'outline' : 'secondary'}>
            <Shield className="size-3" data-icon="inline-start" />
            {permission.resource}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {permission.toolName}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {formatScope(permission.scope)}
          </Badge>
          {permission.matcher !== 'exact' && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {permission.matcher}
            </Badge>
          )}
          {isRevoked && (
            <Badge variant="outline" className="text-muted-foreground">
              Revoked
            </Badge>
          )}
        </div>
        <p className="text-sm font-mono truncate text-muted-foreground">
          {patternDisplay}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Saved {formatDate(permission.grantedAt)}
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
