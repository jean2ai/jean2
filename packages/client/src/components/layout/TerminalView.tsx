import { useEffect, useRef } from 'react';
import type { CachedTerminal } from '@/hooks/useTerminal';

interface TerminalViewProps {
  cachedTerminal: CachedTerminal;
}

export function TerminalView({ cachedTerminal }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { terminal, fitAddon } = cachedTerminal;
    if (!cachedTerminal.isOpened) {
      terminal.open(container);
      // eslint-disable-next-line react-hooks/immutability
      cachedTerminal.isOpened = true;
    } else if (terminal.element) {
      container.appendChild(terminal.element);
    }

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container might not be visible yet
      }

      if (terminal.cols <= 1 || terminal.rows <= 1) {
        const waitForDimensions = () => {
          try {
            fitAddon.fit();
            if (terminal.cols > 1 && terminal.rows > 1) return;
          } catch {
            // Container might not be ready
          }
          requestAnimationFrame(waitForDimensions);
        };
        requestAnimationFrame(waitForDimensions);
      }
    });

    terminal.focus();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // Container might not be visible
        }
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [cachedTerminal]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onFocus={() => cachedTerminal.terminal.focus()}
    />
  );
}
