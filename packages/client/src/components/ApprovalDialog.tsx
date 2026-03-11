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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={handleOverlayClick}>
      <div className="bg-surface-700 p-6 rounded-xl max-w-[500px] w-[90%] relative">
        <button className="absolute top-3 right-3 bg-surface-500 border-0 rounded-full w-8 h-8 text-text-primary text-xl cursor-pointer flex items-center justify-center leading-none hover:bg-[#555] hover:text-white" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="text-text-primary text-lg mb-4">Permission Required</h3>
        {dangerous && (
          <div className="bg-[#4a2d2d] p-3 rounded-lg mb-4 text-[#ff6b6b]">⚠️ This operation is marked as dangerous</div>
        )}
        <div className="bg-surface-600 p-3 rounded-lg mb-4">
          <p className="mb-2 text-text-primary"><strong>Tool:</strong> {toolName}</p>
          <p className="mb-2 text-text-primary"><strong>Permission:</strong> {permissionKey}</p>
          <p className="mt-3 p-2 bg-[#3a3a3a] rounded text-sm text-text-primary">{message}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-text-dim text-xs hover:text-text-muted">View Details</summary>
            <div className="mt-2 pt-2 border-t border-surface-500">
              <p className="mb-1 text-text-primary"><strong>Type:</strong> {permissionType}</p>
              <p className="mb-1 text-text-primary"><strong>Arguments:</strong></p>
              <pre className="text-xs m-0 overflow-x-auto text-text-primary">{JSON.stringify(args, null, 2)}</pre>
              {details && (
                <>
                  <p className="mb-1 text-text-primary"><strong>Additional Info:</strong></p>
                  <pre className="text-xs bg-surface-700 p-2 rounded text-text-primary">{JSON.stringify(details, null, 2)}</pre>
                </>
              )}
            </div>
          </details>
        </div>
        <label className="flex items-center gap-2 mb-4 p-2 bg-surface-600 rounded-md cursor-pointer text-sm text-text-primary hover:bg-[#3a3a3a]">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          Always allow this operation
        </label>
        <div className="flex gap-3 justify-end">
          <button className="py-2.5 px-5 rounded-md border-0 cursor-pointer text-sm bg-surface-500 text-text-primary hover:bg-[#555]" onClick={onDeny}>Deny</button>
          <button className="py-2.5 px-5 rounded-md border-0 cursor-pointer text-sm bg-accent text-white hover:bg-[#3d8ae6]" onClick={() => onApprove(alwaysAllow)}>
            {alwaysAllow ? 'Always Allow' : 'Allow Once'}
          </button>
        </div>
      </div>
    </div>
  );
}
