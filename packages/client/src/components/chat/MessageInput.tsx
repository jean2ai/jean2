import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { Jean2Client } from '@jean2/sdk';
import { Send, Square, Paperclip, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FileEntry, PromptInfo, AttachmentKind } from '@jean2/sdk';
import { FileAutocomplete } from '@/components/files/FileAutocomplete';
import { PromptAutocomplete } from '@/components/chat/PromptAutocomplete';
import { PendingAttachment } from './PendingAttachment';
import { useFileSearch } from '@/hooks/useFileSearch';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';

type AutocompleteMode = 'none' | 'files' | 'prompts';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  placeholder?: string;
  workspaceId?: string;
  sdkClient?: Jean2Client | null;
  prompts?: PromptInfo[];
  sessionId?: string;
  modelSupportsImage?: boolean;
}

interface PendingAttachmentData {
  id: string;
  kind: AttachmentKind;
  filename: string;
  size: number;
  previewUrl?: string;
  uploadedId?: string;
  uploadedKind?: AttachmentKind;
  isUploading?: boolean;
}

export interface MessageInputHandle {
  focus: () => void;
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

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput({
  onSendMessage,
  disabled,
  isStreaming,
  onStopStreaming,
  placeholder = 'Type a message...',
  workspaceId,
  sdkClient,
  prompts = [],
  sessionId,
  modelSupportsImage,
}: MessageInputProps, ref) {
  const { input, setInput, clearInput } = useSessionDraft(sessionId);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [autocompleteFiles, setAutocompleteFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [acMode, setAcMode] = useState<AutocompleteMode>('none');
  const [promptQuery, setPromptQuery] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentData[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }), []);

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
  }, [setQuery, setShowAutocomplete, setInput]);

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
  }, [input, cursorPosition, handleFileSelect, insertMention, setShowAutocomplete, setInput]);

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
  }, [input, cursorPosition, setInput]);

  const cleanupPending = useCallback(() => {
    for (const a of pendingAttachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
    setPendingAttachments([]);
    clearInput();
  }, [pendingAttachments, clearInput]);

  const uploadAttachment = useCallback(async (file: File): Promise<PendingAttachmentData | null> => {
    if (!sdkClient || !sessionId) return null;

    try {
      const attachment = await sdkClient?.http.attachments.upload(sessionId, file);

      return {
        id: crypto.randomUUID(),
        kind: attachment.kind as AttachmentKind,
        filename: attachment.filename,
        size: attachment.size,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        uploadedId: attachment.id,
        uploadedKind: attachment.kind as AttachmentKind,
      };
    } catch (err) {
      console.error('Upload error:', err);
      return null;
    }
  }, [sdkClient, sessionId]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => {
      const item = prev.find(a => a.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (file.size > 20 * 1024 * 1024) continue;

      const localKind = file.type.startsWith('image/') ? 'image' as const
        : file.type.startsWith('video/') ? 'video' as const
        : 'file' as const;

      const previewItem: PendingAttachmentData = {
        id: crypto.randomUUID(),
        kind: localKind,
        filename: file.name,
        size: file.size,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        isUploading: true,
      };
      setPendingAttachments(prev => [...prev, previewItem]);

      const result = await uploadAttachment(file);
      if (result) {
        setPendingAttachments(prev => prev.map(a => {
          if (a.id === previewItem.id) {
            if (a.previewUrl && a.previewUrl !== result.previewUrl) {
              URL.revokeObjectURL(a.previewUrl);
            }
            return { ...result, isUploading: false };
          }
          return a;
        }));
      } else {
        setPendingAttachments(prev => prev.filter(a => a.id !== previewItem.id));
      }
    }
  }, [uploadAttachment]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || disabled) return;

    const parsed = extractPromptCommand(input);
    if (parsed) {
      const prompt = prompts.find(p => p.name === parsed.command);
      if (prompt) {
        const expanded = expandPromptContent(prompt, parsed.rest);
        const uploadedAttachments = pendingAttachments
          .filter(a => a.uploadedId)
          .map(a => ({ id: a.uploadedId!, kind: a.uploadedKind! }));
        onSendMessage(expanded, uploadedAttachments.length > 0 ? uploadedAttachments : undefined);
        cleanupPending();
        return;
      }
    }

    const uploadedAttachments = pendingAttachments
      .filter(a => a.uploadedId)
      .map(a => ({ id: a.uploadedId!, kind: a.uploadedKind! }));
    onSendMessage(trimmed || '', uploadedAttachments.length > 0 ? uploadedAttachments : undefined);
    cleanupPending();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

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
  const trimmed = input.trim();
  const hasUploadingAttachment = pendingAttachments.some(a => a.isUploading);
  const canSend = trimmed || pendingAttachments.length > 0;
  const isDisabled = !canSend || disabled || hasUploadingAttachment;

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'p-4 border-t border-border bg-card',
        isDragOver && 'ring-2 ring-primary'
      )}
    >
      {(pendingAttachments.length > 0 || !isStreaming) && (
        <div className="flex gap-2 flex-wrap mb-2">
          {pendingAttachments.map(a => (
            <PendingAttachment
              key={a.id}
              id={a.id}
              kind={a.kind}
              filename={a.filename}
              size={a.size}
              previewUrl={a.previewUrl}
              isUploading={a.isUploading}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}
      {pendingAttachments.length > 0 && modelSupportsImage === false && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3 shrink-0" />
          <span>This model will not inspect images directly. They will be sent as file paths instead.</span>
        </div>
      )}
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
                onPaste={handlePaste}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                  'min-h-[44px] max-h-[150px] resize-none pr-12 chat-input-scrollbar',
                  'focus-visible:ring-1'
                )}
                rows={1}
                data-chat-input="true"
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
                  sdkClient={sdkClient}
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
        <button
          type="button"
          className="flex items-center justify-center size-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="size-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.json,.xml,.md"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          type="submit"
          disabled={isDisabled}
          size="default"
          className="h-11"
        >
          <Send className="size-4" />
        </Button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground text-center hidden sm:flex items-center justify-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">/</kbd>
        <span>prompts</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">@</kbd>
        <span>files</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
        <span>to send</span>
        <span className="mx-2">•</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift + Enter</kbd>
        <span>for new line</span>
      </div>
    </form>
  );
});
