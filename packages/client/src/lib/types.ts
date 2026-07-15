/**
 * Navigation function type compatible with TanStack Router's navigate.
 */
export interface NavigateFunction {
  (opts: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    replace?: boolean;
  }): void;
}
