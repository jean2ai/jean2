import { useState } from 'react';
import type { PermissionType } from '@jean2/shared';
import './PermissionRequestBlock.css';

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  onApprove: (alwaysAllow: boolean) => void;
  onDeny: () => void;
}

export default function PermissionRequestBlock({
  toolName,
  permissionType,
  permissionKey,
  message,
  dangerous,
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
    <div className="permission-request-block">
      <div className="permission-request-header">
        <span className="permission-type">{permissionType}</span>
        <span className="permission-key">{permissionKey}</span>
      </div>

      <div className="permission-request-message">{message}</div>

      <div className="permission-tool-name">Tool: {toolName}</div>

      {dangerous && (
        <div className="permission-danger-warning">
          ⚠️ This operation is marked as dangerous
        </div>
      )}

      <div className="permission-options">
        <label className="permission-checkbox-label">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="permission-checkbox"
          />
          <span>Always allow this operation</span>
        </label>
      </div>

      <div className="permission-request-buttons">
        <button className="permission-deny" onClick={handleDeny}>
          Deny
        </button>
        <button className="permission-approve" onClick={handleApprove}>
          Approve
        </button>
      </div>
    </div>
  );
}
