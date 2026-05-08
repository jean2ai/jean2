import { Shield, Eye, Hand, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ControlUiState =
  | 'uncontrolled'
  | 'controller'
  | 'observer'
  | 'takeover_controller'
  | 'takeover_requester'
  | 'grace';

interface SessionControlButtonProps {
  uiState: ControlUiState;
  sessionId: string;
  pendingRequesterClientId?: string;
  onClaimControl?: (sessionId: string) => void;
  onReleaseControl?: (sessionId: string) => void;
  onRequestTakeover?: (sessionId: string) => void;
  onRespondTakeover?: (sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => void;
}

function getConfig(state: ControlUiState) {
  switch (state) {
    case 'uncontrolled':
      return {
        icon: Shield,
        tooltip: 'No active controller',
        label: 'No client currently controls this session.',
        ariaLabel: 'Session control: no active controller',
        variant: 'ghost' as const,
        iconClass: 'text-muted-foreground/60',
      };
    case 'controller':
      return {
        icon: Shield,
        tooltip: 'You control this session',
        label: 'You are controlling this session.',
        ariaLabel: 'Session control: you control this session',
        variant: 'ghost' as const,
        iconClass: 'text-muted-foreground',
      };
    case 'observer':
      return {
        icon: Eye,
        tooltip: 'Controlled on another device',
        label: 'Another client is controlling this session.',
        ariaLabel: 'Session control: controlled on another device',
        variant: 'ghost' as const,
        iconClass: 'text-muted-foreground',
      };
    case 'takeover_controller':
      return {
        icon: Hand,
        tooltip: 'Another client requested control',
        label: 'Another client wants to take control of this session.',
        ariaLabel: 'Session control: takeover requested',
        variant: 'ghost' as const,
        iconClass: 'text-orange-500',
      };
    case 'takeover_requester':
      return {
        icon: Hand,
        tooltip: 'Takeover request pending',
        label: 'Your control request is waiting for approval.',
        ariaLabel: 'Session control: takeover request pending',
        variant: 'ghost' as const,
        iconClass: 'text-orange-500',
      };
    case 'grace':
      return {
        icon: Wifi,
        tooltip: 'Waiting for previous controller to reconnect',
        label: 'The previous controller may still reconnect.',
        ariaLabel: 'Session control: waiting for reconnect',
        variant: 'ghost' as const,
        iconClass: 'text-yellow-500',
      };
  }
}

export function SessionControlButton({
  uiState,
  sessionId,
  pendingRequesterClientId,
  onClaimControl,
  onReleaseControl,
  onRequestTakeover,
  onRespondTakeover,
}: SessionControlButtonProps) {
  const config = getConfig(uiState);
  const Icon = config.icon;

  const hasActions =
    (uiState === 'uncontrolled' && !!onClaimControl) ||
    (uiState === 'controller' && !!onReleaseControl) ||
    (uiState === 'observer' && !!onRequestTakeover) ||
    (uiState === 'takeover_controller' && !!onRespondTakeover);

  if (!hasActions) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-accent"
            aria-label={config.ariaLabel}
          >
            <Icon className={`size-4 ${config.iconClass}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{config.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={config.variant}
              size="sm"
              className="h-8 w-8 p-0 hover:bg-accent"
              aria-label={config.ariaLabel}
            >
              <Icon className={`size-4 ${config.iconClass}`} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{config.tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={4} className="w-56">
        <DropdownMenuLabel>{config.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {uiState === 'uncontrolled' && onClaimControl && (
          <DropdownMenuItem onClick={() => onClaimControl(sessionId)}>
            <Shield className="size-4" />
            Claim control
          </DropdownMenuItem>
        )}

        {uiState === 'controller' && onReleaseControl && (
          <DropdownMenuItem onClick={() => onReleaseControl(sessionId)}>
            <Shield className="size-4" />
            Release control
          </DropdownMenuItem>
        )}

        {uiState === 'observer' && onRequestTakeover && (
          <DropdownMenuItem onClick={() => onRequestTakeover(sessionId)}>
            <Hand className="size-4" />
            Request control
          </DropdownMenuItem>
        )}

        {uiState === 'takeover_controller' && onRespondTakeover && pendingRequesterClientId && (
          <>
            <DropdownMenuItem
              onClick={() => onRespondTakeover(sessionId, pendingRequesterClientId, 'approve')}
            >
              <Shield className="size-4 text-green-600" />
              Approve
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onRespondTakeover(sessionId, pendingRequesterClientId, 'deny')}
            >
              <Shield className="size-4" />
              Deny
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
