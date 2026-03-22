import { useCallback, useEffect, useRef } from 'react';
import { useTerminal, type TerminalStatus, type SessionInitData } from '@/hooks/useTerminal';

interface TerminalViewProps {
  serverUrl: string;
  apiToken: string;
  cwd: string;
  serverSessionId?: string | null;
  onStatusChange?: (status: TerminalStatus) => void;
  onExit?: (exitCode: number) => void;
  onSessionInit?: (init: SessionInitData) => void;
  onTitleChange?: (title: string) => void;
}

export function TerminalView({
  serverUrl,
  apiToken,
  cwd,
  serverSessionId,
  onStatusChange,
  onExit,
  onSessionInit,
  onTitleChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getContainer = useCallback(() => containerRef.current, []);
  const { fit, focus, destroy: _destroy } = useTerminal(
    getContainer,
    {
      serverUrl,
      apiToken,
      cwd,
      serverSessionId,
      onStatusChange,
      onExit,
      onSessionInit,
      onTitleChange,
    }
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => fit());
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [fit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        return;
      }
      if (container.offsetParent !== null) {
        clearInterval(interval);
        requestAnimationFrame(() => fit());
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [fit]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onFocus={focus}
    />
  );
}
