import { Copy, Check, User, Bot, X, Clock, Undo2, GitBranch } from 'lucide-react';
import { useState } from 'react';
import type { Message } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  textContent?: string;
  children?: React.ReactNode;
  isQueued?: boolean;
  onRemove?: () => void;
  onRevert?: () => void;
  canRevert?: boolean;
  onFork?: () => void;
  canFork?: boolean;
  isClearAll?: boolean;
}

export function MessageBubble({ 
  message, 
  textContent, 
  children, 
  isQueued = false,
  onRemove,
  onRevert,
  canRevert = false,
  onFork,
  canFork = false,
  isClearAll = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [showForkConfirm, setShowForkConfirm] = useState(false);
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
        'flex flex-col gap-1 animate-slide-up min-w-0',
        isUser ? 'items-end' : 'items-stretch'
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
            {!isQueued && (
              <>
                {canRevert && onRevert && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowRevertConfirm(true)}
                    className="size-5 text-muted-foreground hover:text-foreground"
                    title="Revert to this point"
                  >
                    <Undo2 className="size-3" />
                  </Button>
                )}
                {canFork && onFork && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowForkConfirm(true)}
                    className="size-5 text-muted-foreground hover:text-foreground"
                    title="Fork from this point"
                  >
                    <GitBranch className="size-3" />
                  </Button>
                )}
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
          'relative group min-w-0 overflow-hidden',
          isUser
            ? isQueued
              ? 'rounded-2xl px-4 py-3 max-w-[90%] bg-muted text-foreground border-2 border-dashed border-muted-foreground/30 opacity-80 rounded-br-md'
              : 'rounded-2xl px-4 py-3 max-w-[90%] bg-primary text-primary-foreground rounded-br-md'
            : 'w-full overflow-visible'
        )}
      >
        {isQueued && (
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-muted-foreground/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3 animate-pulse" />
              <span>Pending</span>
            </div>
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Remove from queue"
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        )}
        <div className="min-w-0">
          {children}
        </div>
      </div>

      <ConfirmationDialog
        open={showRevertConfirm}
        onOpenChange={setShowRevertConfirm}
        title={isClearAll ? 'Clear Conversation' : 'Revert Conversation'}
        description={
          isClearAll
            ? 'This will delete all messages in this session, leaving it completely empty. Are you sure you want to continue?'
            : 'This will delete this message and all messages after it. Are you sure you want to continue?'
        }
        confirmLabel={isClearAll ? 'Clear All' : 'Revert'}
        cancelLabel="Cancel"
        onConfirm={() => {
          onRevert?.();
        }}
        variant="destructive"
      />

      <ConfirmationDialog
        open={showForkConfirm}
        onOpenChange={setShowForkConfirm}
        title="Fork Conversation"
        description="This will create a new session with messages up to and including this point. The original session will be unchanged."
        confirmLabel="Fork"
        cancelLabel="Cancel"
        onConfirm={() => {
          onFork?.();
        }}
      />
    </div>
  );
}
