import { useState, useEffect } from 'react';
import type { ToolPermission, ClientMessage } from '@jean2/shared';
import './PermissionManager.css';

interface Props {
  workspaceId: string;
  ws: WebSocket | null;
  permissions: ToolPermission[];
  onRefresh: () => void;
}

export default function PermissionManager({ workspaceId, ws, permissions, onRefresh }: Props) {
  const [showRevoked, setShowRevoked] = useState(false);

  useEffect(() => {
    onRefresh();
  }, [workspaceId, onRefresh]);

  const sendMessage = (type: ClientMessage['type'], payload: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  };

  const handleRevoke = (permissionId: string) => {
    sendMessage('permission.revoke', { permissionId });
  };

  const handleRevokeAll = () => {
    if (confirm('Are you sure you want to revoke all permissions for this workspace?')) {
      sendMessage('permission.revoke_all', { workspaceId });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const activePermissions = permissions.filter(p => !p.revokedAt);
  const _revokedPermissions = permissions.filter(p => p.revokedAt);

  if (permissions.length === 0) {
    return (
      <div className="permission-manager">
        <h3>Permissions</h3>
        <p className="no-permissions">No cached permissions for this workspace.</p>
      </div>
    );
  }

  return (
    <div className="permission-manager">
      <div className="permission-header">
        <h3>Permissions ({activePermissions.length} active)</h3>
        <div className="permission-actions">
          <label className="show-revoked">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)}
            />
            Show revoked
          </label>
          {activePermissions.length > 0 && (
            <button className="revoke-all" onClick={handleRevokeAll}>
              Revoke All
            </button>
          )}
        </div>
      </div>

      <div className="permission-list">
        {(showRevoked ? permissions : activePermissions).map((permission) => (
          <div 
            key={permission.id} 
            className={`permission-item ${permission.revokedAt ? 'revoked' : ''}`}
          >
            <div className="permission-info">
              <div className="permission-main">
                <span className="permission-tool">{permission.toolName}</span>
                <span className="permission-key">{permission.permissionKey}</span>
              </div>
              <div className="permission-meta">
                <span className="permission-type">{permission.permissionType}</span>
                <span className="permission-date">
                  Granted: {formatDate(permission.grantedAt)}
                </span>
                {permission.revokedAt && (
                  <span className="permission-revoked">
                    Revoked: {formatDate(permission.revokedAt)}
                  </span>
                )}
              </div>
            </div>
            {!permission.revokedAt && (
              <button 
                className="revoke-btn" 
                onClick={() => handleRevoke(permission.id)}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
