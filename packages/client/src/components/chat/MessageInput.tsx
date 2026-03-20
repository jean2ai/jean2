import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FileEntry, PromptInfo } from '@jean2/shared';
import { FileAutocomplete } from '@/components/files/FileAutocomplete';
import { PromptAutocomplete } from '@/components/chat/PromptAutocomplete';
import { useFileSearch } from '@/hooks/useFileSearch';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';

type AutocompleteMode = 'none' | 'files' | 'prompts';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  placeholder?: string;
  workspaceId?: string;
  serverUrl?: string;
  apiToken?: string;
  prompts?: PromptInfo[];
}

function expandPromptContent(prompt: PromptInfo, userText: string): string {
  if (userText) {
    if (prompt.content.includes('ARG')) {
      return prompt.content.replace('ARG', userText);
    }
    return `${prompt.content}\n${userText}`;
  }
  return prompt.content;
}

function extractPromptCommand(input: string): { command: string; rest: string } | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return null;
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { command: trimmed.slice(1), rest: '' };
  }
  return { command: trimmed.slice(1, spaceIndex), rest: trimmed.slice(spaceIndex + 1).trim() };
}

export function MessageInput({
  onSendMessage,
  disabled,
  isStreaming,
  onStopStreaming,
  placeholder = 'Type a message...',
  workspaceId,
  serverUrl,
  apiToken,
  prompts = [],
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [autocompleteFiles, setAutocompleteFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [acMode, setAcMode] = useState<AutocompleteMode>('none');
  const [promptQuery, setPromptQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    query,
    setQuery,
    showAutocomplete,
    setShowAutocomplete,
    handleFileSelect,
    insertMention,
  } = useFileSearch({ workspaceId: workspaceId || '' });

  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteFiles, promptQuery, prompts]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const filteredPrompts = prompts.filter(p =>
    p.name.toLowerCase().includes(promptQuery.toLowerCase())
  );

  const showPromptAc = acMode === 'prompts' && prompts.length > 0;
  const showFileAc = acMode === 'files' && showAutocomplete && !!workspaceId;

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    setInput(value);
    setCursorPosition(cursorPos);

    const lastSlashIndex = value.lastIndexOf('/', cursorPos);
    if (lastSlashIndex !== -1) {
      const charBefore = lastSlashIndex > 0 ? value[lastSlashIndex - 1] : '\n';
      const textAfterSlash = value.slice(lastSlashIndex + 1, cursorPos);

      if ((charBefore === '\n' || charBefore === ' ' || charBefore === '') && !textAfterSlash.includes(' ')) {
        setPromptQuery(textAfterSlash);
        setAcMode('prompts');
        return;
      }
    }

    const lastAtIndex = value.lastIndexOf('@', cursorPos);
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1, cursorPos);
      if (!textAfterAt.includes(' ')) {
        setQuery(textAfterAt);
        setShowAutocomplete(true);
        setAcMode('files');
        return;
      }
    }

    setAcMode('none');
    setShowAutocomplete(false);
  }, [setQuery, setShowAutocomplete]);

  const handleFileSelectWrapper = useCallback((file: FileEntry) => {
    const mention = handleFileSelect(file);
    const result = insertMention(input, cursorPosition, mention);
    setInput(result.text);
    setAcMode('none');
    setShowAutocomplete(false);
    setAutocompleteFiles([]);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.cursorPos, result.cursorPos);
      }
    }, 0);
  }, [input, cursorPosition, handleFileSelect, insertMention, setShowAutocomplete]);

  const handlePromptSelect = useCallback((prompt: PromptInfo) => {
    const lastSlashIndex = input.lastIndexOf('/', cursorPosition);
    const beforeSlash = input.slice(0, lastSlashIndex);
    const afterSlash = input.slice(lastSlashIndex + 1);
    const spaceIndex = afterSlash.indexOf(' ');
    const existingUserText = spaceIndex !== -1 ? afterSlash.slice(spaceIndex) : '';

    const completed = `${beforeSlash}/${prompt.name}${existingUserText}`;
    const newCursorPos = lastSlashIndex + 1 + prompt.name.length + (existingUserText ? 0 : 0);

    setInput(completed);
    setAcMode('none');

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [input, cursorPosition]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;

    const parsed = extractPromptCommand(input);
    if (parsed) {
      const prompt = prompts.find(p => p.name === parsed.command);
      if (prompt) {
        const expanded = expandPromptContent(prompt, parsed.rest);
        onSendMessage(expanded);
        setInput('');
        return;
      }
    }

    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPromptAc && filteredPrompts.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredPrompts.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          return;
        case 'Enter':
          if (e.shiftKey) return;
          e.preventDefault();
          if (filteredPrompts[selectedIndex]) {
            handlePromptSelect(filteredPrompts[selectedIndex]);
          }
          return;
        case 'Tab':
          e.preventDefault();
          if (filteredPrompts[selectedIndex]) {
            handlePromptSelect(filteredPrompts[selectedIndex]);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setAcMode('none');
          return;
      }
    }

    if (showFileAc && autocompleteFiles.length > 0) {
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
          setAcMode('none');
          return;
        case 'Tab':
          e.preventDefault();
          if (autocompleteFiles[selectedIndex]) {
            handleFileSelectWrapper(autocompleteFiles[selectedIndex]);
          }
          return;
      }
    }

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
          <Popover open={showPromptAc || showFileAc} onOpenChange={(open) => {
            if (!open) {
              setAcMode('none');
              setShowAutocomplete(false);
            }
          }}>
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
              {showFileAc ? (
                <FileAutocomplete
                  workspaceId={workspaceId || ''}
                  searchQuery={query}
                  selectedIndex={selectedIndex}
                  onSelect={handleFileSelectWrapper}
                  onFilesChange={handleFilesChange}
                  serverUrl={serverUrl}
                  apiToken={apiToken}
                />
              ) : (
                <PromptAutocomplete
                  prompts={prompts}
                  query={promptQuery}
                  selectedIndex={selectedIndex}
                  onSelect={handlePromptSelect}
                />
              )}
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
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">/</kbd>
        <span>prompts</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
        <span>to send</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift + Enter</kbd>
        <span>for new line</span>
      </div>
    </form>
  );
}
