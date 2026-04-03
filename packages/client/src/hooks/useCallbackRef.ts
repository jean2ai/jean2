import { useRef, useCallback, useLayoutEffect } from 'react';

/**
 * Returns a stable callback ref that always points to the latest callback.
 * Useful for event handlers that need to access the latest callback without
 * causing re-renders or stale closures.
 *
 * Unlike useCallback which returns a stable function reference, this returns
 * a ref whose .current is always the latest callback. This is particularly
 * useful for:
 * - Scroll handlers that need to read latest state
 * - Event handlers passed to DOM elements
 * - Effects that need to call the latest version of a callback
 */
export function useCallbackRef<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef<T>(callback);

  // Update the ref after render to avoid lint warnings
  // This ensures the ref always points to the most recent version
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  // Create a stable wrapper that calls through to the ref
  // This function identity is stable even though its behavior changes
  const stableCallback = useCallback(
    (...args: Parameters<T>) => callbackRef.current(...args),
    [] // No dependencies - the ref always has the latest
  ) as T;

  return stableCallback;
}
