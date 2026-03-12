import { Copy, Check, User, Bot } from 'lucide-react';
import { useState } from 'react';
import type { Message } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  textContent?: string;
  children?: React.ReactNode;
}

export function MessageBubble({ message, textContent, children }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    const text = textContent || '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1 mb-4 animate-slide-up',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground',
          isUser ? 'mr-3' : 'ml-3'
        )}
      >
        {isUser ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-5 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
            <User className="size-3" />
            {message.role}
          </>
        ) : (
          <>
            <Bot className="size-3" />
            {message.role}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-5 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </>
        )}
      </div>
      
      <div
        className={cn(
          'rounded-2xl px-4 py-3 max-w-[95%] sm:max-w-[85%]',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-card text-card-foreground border border-border rounded-bl-md'
        )}
      >
        <div className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
