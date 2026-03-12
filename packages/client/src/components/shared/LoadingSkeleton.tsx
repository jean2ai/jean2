import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

export function SessionListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Skeleton className="h-9 w-full" />
      <div className="flex flex-col gap-1 mt-4">
        <Skeleton className="h-4 w-16" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-20 w-[70%] rounded-2xl" />
    </div>
  );
}

export function ChatLoadingState() {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 text-muted-foreground">
      <Loader2 className="size-8 animate-spin" />
      <p className="text-sm">Loading conversation...</p>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="p-3">
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function ConnectingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <Loader2 className="size-8 animate-spin" />
      <p className="text-sm">Connecting to server...</p>
    </div>
  );
}
