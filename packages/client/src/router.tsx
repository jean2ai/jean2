import { createRouter, RouterProvider, createHashHistory } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { serverRegistry } from '@/lib/serverRegistry';
import { isElectron } from '@/lib/platform';

const history = isElectron() ? createHashHistory() : undefined;

export const router = createRouter({
  routeTree,
  history,
  context: { serverRegistry },
  defaultPreload: 'intent',
  defaultPendingComponent: () => (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function RouterApp() {
  return <RouterProvider router={router} />;
}