import { useState } from 'react';
import type { PermissionType } from '@jean2/shared';
import './ApprovalDialog.css';

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
  onClose: () => void;
}

export default function PermissionDialog({
  toolName,
  args,
  permissionType,
  permissionKey,
  message,
  details,
  dangerous,
  onApprove,
  onDeny,
  onClose,
}: Props) {
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="approval-overlay" onClick={handleOverlayClick}>
      <div className="approval-dialog">
        <button className="approval-close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Permission Required</h3>
        {dangerous && (
          <div className="warning">⚠️ This operation is marked as dangerous</div>
        )}
        <div className="tool-info">
          <p><strong>Tool:</strong> {toolName}</p>
          <p><strong>Permission:</strong> {permissionKey}</p>
          <p className="message">{message}</p>
          <details>
            <summary>View Details</summary>
            <div className="details-content">
              <p><strong>Type:</strong> {permissionType}</p>
              <p><strong>Arguments:</strong></p>
              <pre>{JSON.stringify(args, null, 2)}</pre>
              {details && (
                <>
                  <p><strong>Additional Info:</strong></p>
                  <pre>{JSON.stringify(details, null, 2)}</pre>
                </>
              )}
            </div>
          </details>
        </div>
        <label className="always-allow">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
          />
          Always allow this operation
        </label>
        <div className="actions">
          <button className="deny" onClick={onDeny}>Deny</button>
          <button className="approve" onClick={() => onApprove(alwaysAllow)}>
            {alwaysAllow ? 'Always Allow' : 'Allow Once'}
          </button>
        </div>
      </div>
    </div>
  );
}
