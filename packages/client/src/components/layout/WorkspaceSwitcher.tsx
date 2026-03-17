import { useState } from 'react';
import { Check, ChevronsUpDown, Folder, Box, Plus, Star } from 'lucide-react';
import type { Workspace } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { FolderPickerDialog } from '@/components/modals/FolderPickerDialog';
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
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  isWorkspaceFavorited,
  onToggleFavorite,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

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
                  onSelect={() => {
                    onSelectWorkspace(workspace);
                    setOpen(false);
                  }}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    {workspace.isVirtual ? (
                      <Box className="size-4 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 text-muted-foreground" />
                    )}
                    <span>{workspace.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
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
    />
    </>
  );
}
