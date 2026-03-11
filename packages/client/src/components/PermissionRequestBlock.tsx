import { useState } from 'react';
import type { PermissionType } from '@jean2/shared';

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  subagentName?: string;
  onApprove: (alwaysAllow: boolean) => void;
  onDeny: () => void;
}

export default function PermissionRequestBlock({
  toolName,
  permissionType,
  permissionKey,
  message,
  dangerous,
  subagentName,
  onApprove,
  onDeny,
}: Props) {
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const handleApprove = () => {
    onApprove(alwaysAllow);
  };

  const handleDeny = () => {
    setAlwaysAllow(false);
    onDeny();
  };

  return (
    <div className="mt-3 p-4 bg-surface-700 rounded-lg border border-surface-500">
      <div className="flex gap-3 mb-3 text-sm items-center">
        {subagentName && (
          <span className="bg-[#5a4a2a] text-[#ffb86b] px-2 py-1 rounded font-semibold">
            Subagent ({subagentName}) requests:
          </span>
        )}
        <span className="bg-[#3a3a5a] text-[#a0a0ff] px-2 py-1 rounded font-semibold uppercase">
          {permissionType}
        </span>
        <span className="bg-[#3a3a3a] text-text-secondary px-2 py-1 rounded font-mono">
          {permissionKey}
        </span>
      </div>

      <div className="text-text-primary text-sm mb-2 leading-relaxed">{message}</div>

      <div className="text-text-muted text-sm mb-3 font-mono">Tool: {toolName}</div>

      {dangerous && (
        <div className="bg-[#5a2a2a] text-[#ff6b6b] px-3 py-2 rounded-md mb-3 text-sm font-semibold">
          ⚠️ This operation is marked as dangerous
        </div>
      )}

      <div className="mb-3">
        <label className="flex items-center gap-2 text-text-muted text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="w-4 h-4 cursor-pointer accent-gray-500"
          />
          <span>Always allow this operation</span>
        </label>
      </div>

      <div className="flex gap-2 justify-end items-center">
        <button
          className="px-5 py-2 rounded-md text-sm font-semibold cursor-pointer transition-all bg-deny text-[#ff6b6b] hover:bg-deny-hover"
          onClick={handleDeny}
        >
          Deny
        </button>
        <button
          className="px-5 py-2 rounded-md text-sm font-semibold cursor-pointer transition-all bg-approve text-[#6bff6b] hover:bg-approve-hover"
          onClick={handleApprove}
        >
          Approve
        </button>
      </div>
    </div>
  );
}
