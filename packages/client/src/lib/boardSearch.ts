/**
 * Search params schema for multi-session board routes.
 * The `open` param is a comma-separated list of session IDs,
 * while `$sessionId` in the path is the focused session.
 */
export function validateBoardSearch(input: Record<string, unknown>): Record<string, unknown> {
  const open = input.open;
  return {
    ...(typeof open === 'string' ? { open } : {}),
  };
}
