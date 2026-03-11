import { useState, useRef, useEffect } from 'react';
import type { Workspace } from '@jean2/shared';

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateVirtualWorkspace: () => void;
  onCreatePhysicalWorkspace: (path: string) => void;
  onDeleteWorkspace: (id: string) => void;
}

export default function WorkspaceSelector({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  onDeleteWorkspace,
}: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleDirectoryPicker = async () => {
    setIsOpen(false);
    // We can't get full path from File System Access API for security reasons
    // Always use prompt to get the actual path
    const path = prompt('Enter directory path (e.g., /Users/name/projects/myapp):');
    if (path) onCreatePhysicalWorkspace(path);
  };

  const handleSelectWorkspace = (workspace: Workspace) => {
    onSelectWorkspace(workspace);
    setIsOpen(false);
  };

  const handleDeleteWorkspace = (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this workspace?')) {
      onDeleteWorkspace(workspaceId);
    }
    setIsOpen(false);
  };

  const truncatePath = (path: string, maxLength: number = 30): string => {
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-maxLength + 3);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        className="flex items-center gap-2 p-[10px_12px] bg-surface-700 border border-surface-500 rounded-md text-text-primary text-sm cursor-pointer w-full box-border hover:bg-surface-600 hover:border-[#555]"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {activeWorkspace?.name || 'Select Workspace'}
        </span>
        <span className="text-[10px] text-text-dim">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 w-full mt-1 bg-surface-700 border border-surface-500 rounded-md shadow-lg z-[100] max-h-[300px] overflow-y-auto box-border">
          {workspaces.length > 0 ? (
            workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className={`flex items-center gap-2 p-[10px_12px] cursor-pointer text-sm text-text-primary ${
                  workspace.id === activeWorkspace?.id ? 'bg-surface-600' : 'hover:bg-surface-600'
                }`}
                onClick={() => handleSelectWorkspace(workspace)}
              >
                <span className="w-4 text-[12px] text-success">
                  {workspace.id === activeWorkspace?.id && '✓'}
                </span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{workspace.name}</span>
                <span className="text-[11px] text-text-dim max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {workspace.isVirtual ? (
                    <span className="px-1.5 py-0.5 bg-[#1e3a5f] rounded text-accent-light">virtual</span>
                  ) : (
                    <span className="font-mono text-[10px]" title={workspace.path}>
                      {truncatePath(workspace.path)}
                    </span>
                  )}
                </span>
                {workspace.id === activeWorkspace?.id && (
                  <button
                    className="bg-transparent border-none text-text-disabled cursor-pointer text-base p-[0_4px] ml-1 rounded hover:text-error hover:bg-error/10"
                    onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                    title="Delete workspace"
                    type="button"
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 p-[10px_12px] cursor-default text-sm text-text-disabled">No workspaces</div>
          )}

          <div className="h-px bg-surface-500 my-1" />

          <div
            className="flex items-center gap-2 p-[10px_12px] cursor-pointer text-sm text-accent-light hover:bg-[#1e3a5f]"
            onClick={() => {
              setIsOpen(false);
              onCreateVirtualWorkspace();
            }}
          >
            + Create Virtual Workspace
          </div>

          <div
            className="flex items-center gap-2 p-[10px_12px] cursor-pointer text-sm text-accent-light hover:bg-[#1e3a5f]"
            onClick={handleDirectoryPicker}
          >
            + Create from Directory...
          </div>
        </div>
      )}
    </div>
  );
}
