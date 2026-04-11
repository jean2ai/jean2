import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { ServerProvider } from '@/contexts/ServerContext';
import { useServerContext } from '@/contexts/ServerContext';
import App from './App';
import { LandingPage } from './components/router/LandingPage';

const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ServerProvider>
      <Outlet />
    </ServerProvider>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});

function ServerRouteGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const params = useParams({ from: '/server/$serverId' });
  const { servers, isHydrated } = useServerContext();
  const serverId = params.serverId;

  useEffect(() => {
    if (!isHydrated || !serverId) return;

    const serverExists = servers.some(s => s.id === serverId);
    if (!serverExists) {
      if (servers.length > 0) {
        navigate({ to: '/server/$serverId', params: { serverId: servers[0].id }, replace: true });
      } else {
        navigate({ to: '/', replace: true });
      }
    }
  }, [serverId, servers, isHydrated, navigate]);

  if (!isHydrated) {
    return null;
  }

  return <>{children}</>;
}

const serverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/server/$serverId',
  component: () => (
    <ServerRouteGuard>
      <App />
    </ServerRouteGuard>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, serverRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function RouterApp() {
  return <RouterProvider router={router} />;
}
