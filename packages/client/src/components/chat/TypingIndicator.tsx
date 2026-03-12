import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-1 mb-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground ml-3">
          <Bot className="size-3" />
          assistant
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 ml-3">
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-muted-foreground animate-bounce" />
            <div className="size-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
            <div className="size-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
          </div>
        </div>
      </div>
    </div>
  );
}