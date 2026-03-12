import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FileEntry } from '@jean2/shared';
import { FileAutocomplete } from '@/components/files/FileAutocomplete';
import { useFileSearch } from '@/hooks/useFileSearch';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  placeholder?: string;
  workspaceId?: string;
}

export function MessageInput({
  onSendMessage,
  disabled,
  isStreaming,
  onStopStreaming,
  placeholder = 'Type a message...',
  workspaceId,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [autocompleteFiles, setAutocompleteFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    query,
    setQuery,
    showAutocomplete,
    setShowAutocomplete,
    handleFileSelect,
    insertMention,
  } = useFileSearch({ workspaceId: workspaceId || '' });

  // Reset selection when files change
  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteFiles]);

  // Auto-grow textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setInput(value);
    setCursorPosition(cursorPos);
    
    // Detect @ trigger
    const lastAtIndex = value.lastIndexOf('@', cursorPos);
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1, cursorPos);
      // Check if there's a space between @ and cursor (closes autocomplete)
      if (!textAfterAt.includes(' ')) {
        setQuery(textAfterAt);
        setShowAutocomplete(true);
        return;
      }
    }
    
    setShowAutocomplete(false);
  }, [setQuery, setShowAutocomplete]);

  const handleFileSelectWrapper = useCallback((file: FileEntry) => {
    const mention = handleFileSelect(file);
    const result = insertMention(input, cursorPosition, mention);
    setInput(result.text);
    setShowAutocomplete(false);
    setAutocompleteFiles([]);
    
    // Focus input and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.cursorPos, result.cursorPos);
      }
    }, 0);
  }, [input, cursorPosition, handleFileSelect, insertMention, setShowAutocomplete]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle autocomplete navigation when open
    if (showAutocomplete && autocompleteFiles.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, autocompleteFiles.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          return;
        case 'Enter':
          e.preventDefault();
          if (autocompleteFiles[selectedIndex]) {
            handleFileSelectWrapper(autocompleteFiles[selectedIndex]);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setShowAutocomplete(false);
          return;
        case 'Tab':
          e.preventDefault();
          if (autocompleteFiles[selectedIndex]) {
            handleFileSelectWrapper(autocompleteFiles[selectedIndex]);
          }
          return;
      }
    }

    // Normal submit on Enter (when autocomplete is not open)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFilesChange = useCallback((files: FileEntry[]) => {
    setAutocompleteFiles(files);
  }, []);

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
          <Popover open={showAutocomplete && !!workspaceId} onOpenChange={setShowAutocomplete}>
            <PopoverAnchor asChild>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                  'min-h-[44px] max-h-[150px] resize-none pr-12',
                  'focus-visible:ring-1'
                )}
                rows={1}
              />
            </PopoverAnchor>
            
            <PopoverContent
              className="w-72 p-0"
              align="start"
              side="top"
              sideOffset={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <FileAutocomplete
                workspaceId={workspaceId || ''}
                searchQuery={query}
                selectedIndex={selectedIndex}
                onSelect={handleFileSelectWrapper}
                onFilesChange={handleFilesChange}
              />
            </PopoverContent>
          </Popover>
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
