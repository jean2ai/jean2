/**
 * Mock broadcast callback that captures all messages.
 * Use in tests that exercise code calling broadcastEvent().
 */
export function createMockBroadcast() {
  const messages: unknown[] = [];

  return {
    callback: (message: unknown) => {
      messages.push(message);
    },
    messages,
    clear() {
      messages.length = 0;
    },
    last() {
      return messages[messages.length - 1];
    },
  };
}
