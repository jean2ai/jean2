import { useState, useEffect } from 'react';

/**
 * Returns a timestamp that updates at the given interval.
 * Useful for components that need to show relative time labels.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
