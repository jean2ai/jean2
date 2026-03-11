import { useState, useEffect } from 'react';
import type { ToolPermission, ClientMessage } from '@jean2/shared';

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
      <div className="p-4 bg-[#2a2a2a] rounded-lg mt-4">
        <h3 className="text-base text-[#e0e0e0] m-0 mb-4">Permissions</h3>
        <p className="text-[#888] text-sm">No cached permissions for this workspace.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#2a2a2a] rounded-lg mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="m-0 text-base text-[#e0e0e0]">Permissions ({activePermissions.length} active)</h3>
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-1.5 text-xs text-[#888] cursor-pointer">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Show revoked
          </label>
          {activePermissions.length > 0 && (
            <button 
              onClick={handleRevokeAll}
              className="px-3 py-1.5 bg-[#4a2d2d] text-[#ff6b6b] border-none rounded cursor-pointer text-xs hover:bg-[#5a3d3d]"
            >
              Revoke All
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {(showRevoked ? permissions : activePermissions).map((permission) => (
          <div 
            key={permission.id} 
            className={`flex justify-between items-center p-3 bg-[#333] rounded-md ${permission.revokedAt ? 'opacity-50 bg-[#2d2d2d]' : ''}`}
          >
            <div className="flex-1">
              <div className="flex gap-3 mb-1.5">
                <span className="font-semibold text-[#4a9eff]">{permission.toolName}</span>
                <span className="text-[#aaa] font-mono text-xs">{permission.permissionKey}</span>
              </div>
              <div className="flex gap-4 text-xs text-[#888]">
                <span className="uppercase text-[0.275rem] bg-[#444] px-1.5 py-0.5 rounded">
                  {permission.permissionType}
                </span>
                <span>
                  Granted: {formatDate(permission.grantedAt)}
                </span>
                {permission.revokedAt && (
                  <span className="text-[#ff6b6b]">
                    Revoked: {formatDate(permission.revokedAt)}
                  </span>
                )}
              </div>
            </div>
            {!permission.revokedAt && (
              <button 
                onClick={() => handleRevoke(permission.id)}
                className="px-3 py-1.5 bg-transparent text-[#ff6b6b] border border-[#ff6b6b] rounded cursor-pointer text-xs hover:bg-[#4a2d2d]"
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
