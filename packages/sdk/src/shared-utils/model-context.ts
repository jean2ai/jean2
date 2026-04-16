/**
 * Get the context window size for a model
 * This is a fallback function - prefer using contextWindow from the server's models config
 * @param modelId - The model identifier (unused, kept for API compatibility)
 * @returns Always returns 0 to indicate unknown context window
 */
export function getModelContextWindow(_modelId: string): number {
  // Context window should come from the server's models.json config
  // This fallback returns 0 to indicate the context window is unknown
  return 0;
}

/**
 * Calculate the percentage of context window used
 * @param tokensUsed - Number of tokens used
 * @param modelId - The model identifier (unused, kept for API compatibility)
 * @returns Percentage (0-100) of context window used, or 0 if context window is unknown
 */
export function getContextWindowPercentage(_tokensUsed: number, _modelId: string): number {
  // With no context window info, we can't calculate percentage
  return 0;
}
