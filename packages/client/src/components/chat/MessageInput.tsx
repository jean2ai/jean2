import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  placeholder?: string;
}

export function MessageInput({
  onSendMessage,
  disabled,
  isStreaming,
  onStopStreaming,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (isStreaming && onStopStreaming) {
    return (
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
            <div className="size-2 rounded-full bg-primary animate-bounce" />
            <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:0.1s]" />
            <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
            <span className="text-sm ml-2">Generating...</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onStopStreaming}
          >
            <Square className="size-4" data-icon="inline-start" />
            Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card">
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'min-h-[44px] max-h-[150px] resize-none pr-12',
              'focus-visible:ring-1'
            )}
            rows={1}
          />
        </div>
        <Button
          type="submit"
          disabled={!input.trim() || disabled}
          size="default"
          className="h-11"
        >
          <Send className="size-4" />
        </Button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
        <span>to send</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift + Enter</kbd>
        <span>for new line</span>
      </div>
    </form>
  );
}
