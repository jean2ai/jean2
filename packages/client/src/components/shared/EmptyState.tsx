import { MessageSquare, Inbox, FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  _onSelect?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/50">{icon}</div>
      )}
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-[300px] mb-4">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          <Plus className="size-4" data-icon="inline-start" />
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function NoSessionsState({ onSelect }: { onSelect?: () => void }) {
  return (
    <EmptyState
      icon={<Inbox className="size-12" />}
      title="No sessions yet"
      description="Start a new chat to begin working with your AI agent."
      action={onSelect ? { label: 'Create Session', onClick: onSelect } : undefined}
    />
  );
}

export function NoWorkspaceState({ onSelect }: { onSelect?: () => void }) {
  return (
    <EmptyState
      icon={<FolderOpen className="size-12" />}
      title="No workspace selected"
      description="Select or create a workspace to get started."
      action={onSelect ? { label: 'Select Workspace', onClick: onSelect } : undefined}
    />
  );
}

export function NoMessagesState() {
  return (
    <EmptyState
      icon={<MessageSquare className="size-12" />}
      title="Start a conversation"
      description="Send a message below to begin."
    />
  );
}
