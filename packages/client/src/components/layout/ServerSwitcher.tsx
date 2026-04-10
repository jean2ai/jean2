import { useState } from 'react';
import { Check, ChevronsUpDown, Server, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useServerContext } from '@/contexts/ServerContext';

interface ServerSwitcherProps {
  compact?: boolean;
  onOpenAddServer: () => void;
  onServerSwitch?: () => void;
}

export function ServerSwitcher({ compact, onOpenAddServer, onServerSwitch }: ServerSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { servers, activeServer, switchServer } = useServerContext();

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select server"
            className="gap-1.5 px-2 h-8 font-semibold hover:bg-accent"
          >
            <Server className="size-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {activeServer?.name || 'Select server'}
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0 max-h-[80vh]">
          <Command>
            <CommandInput placeholder="Search server..." />
            <CommandList className="max-h-[50vh] overflow-y-auto">
              <CommandEmpty>No server found.</CommandEmpty>
              <CommandGroup heading="Servers">
                {servers.map((server) => (
                  <CommandItem
                    key={server.id}
                    onSelect={() => {
                      switchServer(server.id);
                      onServerSwitch?.();
                      setOpen(false);
                    }}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Server className="size-4 text-muted-foreground" />
                      <span>{server.name}</span>
                    </div>
                    <Check
                      className={cn(
                        'size-4',
                        activeServer?.id === server.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onOpenAddServer();
                    setOpen(false);
                  }}
                >
                  <Plus className="size-4" data-icon="inline-start" />
                  Add Server...
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select server"
          className="w-full justify-between h-9"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Server className="size-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {activeServer?.name || 'Select server'}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0 max-h-[80vh]">
        <Command>
          <CommandInput placeholder="Search server..." />
          <CommandList className="max-h-[50vh] overflow-y-auto">
            <CommandEmpty>No server found.</CommandEmpty>
            <CommandGroup heading="Servers">
              {servers.map((server) => (
                <CommandItem
                  key={server.id}
                  onSelect={() => {
                    switchServer(server.id);
                    onServerSwitch?.();
                    setOpen(false);
                  }}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Server className="size-4 text-muted-foreground" />
                    <span>{server.name}</span>
                  </div>
                  <Check
                    className={cn(
                      'size-4',
                      activeServer?.id === server.id
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onOpenAddServer();
                  setOpen(false);
                }}
              >
                <Plus className="size-4" data-icon="inline-start" />
                Add Server...
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
