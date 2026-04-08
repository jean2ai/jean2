import type { HttpClient } from '@jean2/sdk';
import { useState } from 'react';
import { Check, ChevronsUpDown, Folder, Box, Plus, Star, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Workspace } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { FolderPickerDialog } from '@/components/modals/FolderPickerDialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateVirtualWorkspace: () => void;
  onCreatePhysicalWorkspace: (path: string) => void;
  isWorkspaceFavorited: (workspaceId: string) => boolean;
  onToggleFavorite: (workspaceId: string, workspaceName: string) => void;
  onDeleteWorkspace: (id: string) => void;
  httpClient: HttpClient | null;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  isWorkspaceFavorited,
  onToggleFavorite,
  onDeleteWorkspace,
  httpClient,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select workspace"
          className="w-full justify-between h-9"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {activeWorkspace?.isVirtual ? (
              <Box className="size-4 flex-shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="size-4 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">
              {activeWorkspace?.name || 'Select workspace'}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0 max-h-[80vh]">
        <Command>
          <CommandInput placeholder="Search workspace..." />
          <CommandList className="max-h-[50vh] overflow-y-auto">
            <CommandEmpty>No workspace found.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  showCheck={false}
                  onSelect={() => {
                    onSelectWorkspace(workspace);
                    setOpen(false);
                  }}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {workspace.isVirtual ? (
                      <Box className="size-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{workspace.name}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      className="p-1 rounded hover:bg-secondary transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(workspace.id, workspace.name);
                      }}
                      title={isWorkspaceFavorited(workspace.id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isWorkspaceFavorited(workspace.id) ? (
                        <Star className="size-4 fill-primary text-primary" />
                      ) : (
                        <Star className="size-4 text-muted-foreground" />
                      )}
                    </button>
                    <Check
                      className={cn(
                        'size-4',
                        activeWorkspace?.id === workspace.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-secondary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Workspace actions</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkspaceToDelete(workspace);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Delete workspace
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onCreateVirtualWorkspace();
                  setOpen(false);
                }}
              >
                <Plus className="size-4" data-icon="inline-start" />
                Create virtual workspace
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setShowFolderPicker(true);
                }}
              >
                <Folder className="size-4" data-icon="inline-start" />
                Add existing folder
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <FolderPickerDialog
      open={showFolderPicker}
      onOpenChange={setShowFolderPicker}
      onSelect={(path) => {
        onCreatePhysicalWorkspace(path);
        setShowFolderPicker(false);
      }}
      title="Select Workspace Folder"
      httpClient={httpClient}
    />
    <ConfirmationDialog
      open={workspaceToDelete !== null}
      onOpenChange={(open) => !open && setWorkspaceToDelete(null)}
      title="Delete Workspace"
      description={
        workspaceToDelete
          ? `Are you sure you want to delete "${workspaceToDelete.name}"? This will permanently remove the workspace and all associated Jean data, including sessions, messages, and temporary files. The actual files in "${workspaceToDelete.name}" on disk will not be deleted.`
          : ''
      }
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={() => {
        if (workspaceToDelete) {
          onDeleteWorkspace(workspaceToDelete.id);
          setWorkspaceToDelete(null);
        }
      }}
    />
    </>
  );
}
