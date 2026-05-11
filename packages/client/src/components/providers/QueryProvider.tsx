import { QueryClient, QueryClientProvider as RQQueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <RQQueryClientProvider client={queryClient}>
      {children}
    </RQQueryClientProvider>
  );
}

export { queryClient };
