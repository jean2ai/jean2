import { serve } from 'bun';
import { getPort, getHost } from './env';
import app from './app';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export interface ServerInstance {
  server: ReturnType<typeof Bun.serve>;
  cleanup: () => void;
}

export async function startServer(options?: ServerOptions): Promise<ServerInstance> {
  const port = options?.port ?? getPort();
  const host = options?.host ?? getHost();

  console.log(`LSP Server starting on ${host}:${port}...`);

  const server = serve({
    port,
    hostname: host,
    fetch: app.fetch,
  });

  console.log(`LSP Server running on http://${host}:${port}`);

  const onShutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', () => onShutdown('SIGTERM'));
  process.on('SIGINT', () => onShutdown('SIGINT'));

  const cleanup = () => {
    server.stop();
    process.removeListener('SIGTERM', onShutdown);
    process.removeListener('SIGINT', onShutdown);
  };

  return { server, cleanup };
}

if (import.meta.main) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start LSP server:', err);
    process.exit(1);
  });
}
