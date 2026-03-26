import { useEffect, useRef, useState } from 'react';

export function useCompletionFlash(
  sessionId: string | null,
  isRunning: boolean
): { isFlashing: boolean } {
  const [flashingSessionId, setFlashingSessionId] = useState<string | null>(null);
  const prevIsRunningRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevIsRunningRef.current && !isRunning && sessionId) {
      setFlashingSessionId(sessionId);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setFlashingSessionId(null);
        timeoutRef.current = null;
      }, 5000);
    }

    prevIsRunningRef.current = isRunning;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isRunning, sessionId]);

  return {
    isFlashing: sessionId !== null && flashingSessionId === sessionId,
  };
}
