import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Archive, Square, Minimize2 } from 'lucide-react';
import type { Session, Preconfig } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TokenMeter } from './TokenMeter';
import { ModelSelector } from './ModelSelector';
import { PreconfigSelector } from './PreconfigSelector';
import { useIsMobile } from '@/hooks/use-mobile';

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
}

interface ChatHeaderProps {
  session: Session;
  preconfigs: Preconfig[];
  models: Model[];
  defaultModel: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onNavigateBack?: () => void;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  onCompact?: () => void;
  isCompacting?: boolean;
  canCompact?: boolean;
}

export function ChatHeader({
  session,
  preconfigs,
  models,
  usage,
  modelName,
  onChangePreconfig,
  onChangeModel,
  onRename,
  onNavigateBack,
  isStreaming,
  onInterrupt,
  onCompact,
  isCompacting,
  canCompact,
}: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleDoubleClick = () => {
    setEditTitle(session.title || '');
    setIsEditing(true);
  };

  const handleTitleSubmit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(session.title || '');
      setIsEditing(false);
    }
  };

  const selectedModel = session.selectedModel ||
    preconfigs.find((p) => p.id === session.preconfigId)?.model ||
    modelName;

  const currentModelInfo = models.find((m) => m.id === selectedModel);
  const contextWindow = currentModelInfo?.contextWindow;

  return (
    <header className="flex flex-col border-b border-border bg-card">
      {/* Top row: Navigation and Title */}
      <div className="flex items-center justify-start px-4 py-2">
        <div className="flex items-center gap-3">
          {session.parentId && onNavigateBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateBack}
              className="h-7"
            >
              <ArrowLeft className="size-4" data-icon="inline-start" />
              Back
            </Button>
          )}

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleKeyDown}
              className="text-lg font-semibold bg-background border border-primary rounded px-2 py-0.5 outline-none min-w-[200px]"
              autoFocus
            />
          ) : (
            <h2
              className="text-lg font-semibold cursor-pointer px-2 py-0.5 -mx-2 rounded hover:bg-accent transition-colors"
              onDoubleClick={handleTitleDoubleClick}
            >
              {session.title || 'Untitled Session'}
            </h2>
          )}

          <Badge variant="outline" className="font-mono text-xs">
            {session.id.slice(0, 8)}
          </Badge>

          {session.status === 'closed' && (
            <Badge variant="secondary">
              <Archive className="size-3" data-icon="inline-start" />
              Archived
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Bottom row: Controls */}
      <div className="inline-flex align-middle items-center gap-3 sm:gap-4 px-4 py-2 flex-wrap">
        <TokenMeter
          promptTokens={usage.promptTokens}
          completionTokens={usage.completionTokens}
          totalTokens={usage.totalTokens}
          contextWindow={contextWindow}
          modelName={modelName}
          compact={isMobile}
        />

        <Separator orientation="vertical" className="hidden sm:block" />

        <ModelSelector
          models={models}
          selectedModelId={selectedModel}
          onChangeModel={onChangeModel}
          disabled={session.status === 'closed' || !!session.parentId}
          iconOnly={isMobile}
        />

        <PreconfigSelector
          preconfigs={preconfigs}
          selectedPreconfigId={session.preconfigId}
          onChangePreconfig={onChangePreconfig}
          disabled={session.status === 'closed' || !!session.parentId}
          iconOnly={isMobile}
        />

        <Separator orientation="vertical" className="hidden sm:block" />

        {onCompact && (
          <Button
            variant="outline"
            size={isMobile ? 'icon' : 'sm'}
            onClick={onCompact}
            disabled={isStreaming || isCompacting || !canCompact}
            title={isCompacting ? 'Compacting...' : 'Compact older messages'}
          >
            <Minimize2 className="size-4" />
            {!isMobile && <span className="ml-1">{isCompacting ? 'Compacting...' : 'Compact'}</span>}
          </Button>
        )}

        <Separator orientation="vertical" className="hidden sm:block" />

        <Button
          variant={isStreaming ? 'destructive' : 'outline'}
          size={isMobile ? 'icon' : 'sm'}
          onClick={onInterrupt}
          disabled={!onInterrupt}
          className={!isStreaming ? 'opacity-60 hover:opacity-100' : ''}
          title={isStreaming ? 'Interrupt operation' : 'Interrupt (no active operation)'}
        >
          <Square className="size-4" />
          {!isMobile && <span className="ml-1">Stop</span>}
        </Button>
      </div>
    </header>
  );
}
