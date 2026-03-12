import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SessionGroupProps {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function SessionGroup({
  title,
  count,
  defaultExpanded = true,
  children,
}: SessionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        className="justify-between px-2 py-1.5 h-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="flex items-center gap-1.5">
          {isExpanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          {title}
        </span>
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {count}
        </span>
      </Button>
      
      {isExpanded && (
        <div className="flex flex-col gap-0.5 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
