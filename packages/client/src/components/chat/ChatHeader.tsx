import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Archive, Square, Minimize2 } from 'lucide-react';
import type { Session, Preconfig } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TokenMeter } from './TokenMeter';
import { ModelSelector } from './ModelSelector';
import { VariantSelector } from './VariantSelector';
import { PreconfigSelector } from './PreconfigSelector';
import { SessionControlButton } from './SessionControlButton';
import { useSessionControlStore } from '@/stores/sessionControlStore';
import { useClientIdentityStore } from '@/stores/clientIdentityStore';
import {useIsCompact, useIsMobile} from '@/hooks/use-mobile';

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
  onChangeVariant: (variant: string | null) => void;
  onRename: (sessionId: string, title: string) => void;
  onNavigateBack?: () => void;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  onCompact?: () => void;
  isCompacting?: boolean;
  canCompact?: boolean;
  selectedVariant: string | null;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  onClaimControl?: (sessionId: string) => void;
  onReleaseControl?: (sessionId: string) => void;
  onRequestTakeover?: (sessionId: string) => void;
  onRespondTakeover?: (sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => void;
}

type ControlUiState =
  | 'uncontrolled'
  | 'controller'
  | 'observer'
  | 'takeover_controller'
  | 'takeover_requester'
  | 'grace';

function deriveControlUiState(
  controlStatus: string | undefined,
  isController: boolean,
): ControlUiState {
  if (!controlStatus || controlStatus === 'uncontrolled') return 'uncontrolled';
  if (controlStatus === 'grace') return 'grace';
  if (controlStatus === 'takeover_requested') {
    return isController ? 'takeover_controller' : 'takeover_requester';
  }
  if (controlStatus === 'controlled') {
    return isController ? 'controller' : 'observer';
  }
  return 'uncontrolled';
}

export function ChatHeader({
  session,
  preconfigs,
  models,
  usage,
  modelName,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  onRename,
  onNavigateBack,
  isStreaming,
  onInterrupt,
  onCompact,
  isCompacting,
  canCompact,
  selectedVariant,
  variants,
  onClaimControl,
  onReleaseControl,
  onRequestTakeover,
  onRespondTakeover,
}: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const isCompact = useIsCompact();

  const controlState = useSessionControlStore((s) => s.controlBySessionId[session.id]);
  const myClientId = useClientIdentityStore((s) => s.clientId);

  const isActiveControlled = controlState?.status === 'controlled' || controlState?.status === 'takeover_requested';
  const isController = isActiveControlled && controlState.controllerClientId === myClientId;
  const isObserver = isActiveControlled && controlState.controllerClientId !== myClientId;

  const controlUiState = deriveControlUiState(controlState?.status, isController);

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
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-1 gap-1">
          <div className="flex items-center gap-3 min-w-0 flex-1">
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
                className="text-base font-semibold bg-background border border-primary rounded px-2 py-0.5 outline-none min-w-0 flex-1"
                autoFocus
              />
            ) : (
              <h2
                className="text-base font-semibold cursor-pointer px-2 py-0.5 -mx-2 rounded hover:bg-accent transition-colors truncate min-w-0"
                onDoubleClick={handleTitleDoubleClick}
              >
                {session.title || 'Untitled Session'}
              </h2>
            )}

            <TokenMeter
              promptTokens={usage.promptTokens}
              completionTokens={usage.completionTokens}
              totalTokens={usage.totalTokens}
              contextWindow={contextWindow}
              modelName={modelName}
              compact={isMobile}
            />

            {session.status === 'closed' && (
              <Badge variant="secondary">
                <Archive className="size-3" data-icon="inline-start" />
                Archived
              </Badge>
            )}
          </div>

          <Separator className="md:hidden" />

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap md:flex-nowrap shrink-0">
            <ModelSelector
              models={models}
              selectedModelId={selectedModel}
              onChangeModel={onChangeModel}
              disabled={session.status === 'closed' || !!session.parentId || isObserver}
              iconOnly={isMobile}
              compact={isCompact}
            />

            <VariantSelector
              variants={variants}
              selectedVariant={selectedVariant}
              onChangeVariant={onChangeVariant}
              disabled={session.status === 'closed' || !!session.parentId || isObserver}
              iconOnly={isMobile}
              compact={isCompact}
            />

            <PreconfigSelector
              preconfigs={preconfigs}
              selectedPreconfigId={session.preconfigId}
              onChangePreconfig={onChangePreconfig}
              disabled={session.status === 'closed' || !!session.parentId || isObserver}
              iconOnly={isMobile}
              compact={isCompact}
            />

            <Separator orientation="vertical" className="hidden md:block" />

            {myClientId && (
              <SessionControlButton
                uiState={controlUiState}
                sessionId={session.id}
                pendingRequesterClientId={controlState?.pendingTakeover?.requestedByClientId}
                onClaimControl={onClaimControl}
                onReleaseControl={onReleaseControl}
                onRequestTakeover={onRequestTakeover}
                onRespondTakeover={onRespondTakeover}
              />
            )}

            {onCompact && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent"
                      onClick={onCompact}
                      disabled={isStreaming || isCompacting || !canCompact}
                    >
                      <Minimize2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isCompacting ? 'Compacting...' : 'Compact older messages'}
                  </TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="hidden md:block" />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isStreaming ? 'destructive' : 'ghost'}
                  size="sm"
                  className={`h-8 w-8 p-0 hover:bg-accent${!isStreaming ? ' text-muted-foreground opacity-60 hover:opacity-100' : ''}`}
                  onClick={onInterrupt}
                  disabled={!onInterrupt || isObserver}
                >
                  <Square className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isStreaming ? 'Interrupt operation' : 'Interrupt'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </header>
  );
}
