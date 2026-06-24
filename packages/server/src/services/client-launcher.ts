import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { getClientDir } from '@/paths';
import {
  createArborist,
  fetchPackageMetadata,
  extractIntegrity,
} from '@/services/npm-utils';

const CLIENT_PACKAGE = '@jean2/client';
const MANIFEST_FILE = '.client-manifest.json';

interface ClientManifest {
  version: string;
  installedAt: string;
  lastUpdateCheck?: string;
  integrity?: string;
}

function getClientManifestPath(): string {
  return join(getClientDir(), MANIFEST_FILE);
}

function readClientManifest(): ClientManifest | null {
  const path = getClientManifestPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function writeClientManifest(manifest: ClientManifest): void {
  writeFileSync(getClientManifestPath(), JSON.stringify(manifest, null, 2));
}

async function installClientPackage(): Promise<{ version: string; integrity: string | null }> {
  const clientDir = getClientDir();
  mkdirSync(clientDir, { recursive: true });

  const pkgJsonPath = join(clientDir, 'package.json');
  const pkgJson = {
    name: 'jean2-client-install',
    version: '1.0.0',
    private: true,
    dependencies: {
      [CLIENT_PACKAGE]: 'latest',
    },
  };

  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

  const arb = createArborist(clientDir);

  console.log('[client] Installing @jean2/client from npm...');
  const tree = await arb.reify();

  const child = tree?.children?.get(CLIENT_PACKAGE);
  if (!child) {
    throw new Error('Failed to install @jean2/client: package not found in tree');
  }

  const version = (child as unknown as { package?: { version?: string } }).package?.version || 'unknown';
  const integrity = extractIntegrity(tree, CLIENT_PACKAGE);
  writeClientManifest({
    version,
    installedAt: new Date().toISOString(),
    lastUpdateCheck: new Date().toISOString(),
    integrity: integrity ?? undefined,
  });

  console.log(`[client] Installed @jean2/client@${version}${integrity ? ` (verified)` : ''}`);
  return { version, integrity };
}

function getCliPath(): string | null {
  const clientDir = getClientDir();
  const cliPath = join(clientDir, 'node_modules', CLIENT_PACKAGE, 'dist', 'cli.mjs');
  return existsSync(cliPath) ? cliPath : null;
}

function isInstalled(): boolean {
  return getCliPath() !== null;
}

async function fetchLatestVersion(): Promise<string | null> {
  const metadata = await fetchPackageMetadata(CLIENT_PACKAGE);
  if (!metadata) return null;

  return metadata.distTags.latest ?? null;
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const a = parse(latest);
  const b = parse(current);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export async function runClientCommand(cliPath: string, port: number): Promise<void> {
  const distPath = join(cliPath, '..');

  process.argv = [process.argv[0], cliPath, '--port', String(port)];

  const http = await import('node:http');
  const https = await import('node:https');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const tlsEnabled = process.env.JEAN2_TLS_ENABLED === 'true';
  let tlsOptions: { cert: string; key: string } | undefined;

  if (tlsEnabled) {
    const certPath = process.env.JEAN2_TLS_CERT_FILE;
    const keyPath = process.env.JEAN2_TLS_KEY_FILE;
    if (certPath && keyPath) {
      try {
        tlsOptions = {
          cert: fs.readFileSync(certPath, 'utf-8'),
          key: fs.readFileSync(keyPath, 'utf-8'),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[client] Failed to read TLS certificate/key: ${message}`);
        process.exit(1);
      }
    } else {
      console.error('[client] JEAN2_TLS_ENABLED is set but JEAN2_TLS_CERT_FILE and/or JEAN2_TLS_KEY_FILE are missing');
      process.exit(1);
    }
  }

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  function getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  function serveFile(res: ServerResponse, filePath: string, contentType: string): void {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
    let urlPath = (req.url ?? '/').split('?')[0];

    if (urlPath === '/') {
      urlPath = '/index.html';
    }

    // Try to serve the exact file first (handles /assets/* requests)
    const filePath = path.join(distPath, urlPath);

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const contentType = getContentType(filePath);
        serveFile(res, filePath, contentType);
        return;
      }

      // With base='./', asset paths resolve relative to current URL.
      // On /sessions/abc, the browser requests /sessions/assets/foo.js.
      // Detect these missed asset requests and try /assets/<filename>.
      const ext = path.extname(urlPath).toLowerCase();
      if (ext && ext !== '.html') {
        const filename = path.basename(urlPath);
        const assetPath = path.join(distPath, 'assets', filename);
        fs.stat(assetPath, (err2, stats2) => {
          if (!err2 && stats2.isFile()) {
            const contentType = getContentType(assetPath);
            serveFile(res, assetPath, contentType);
            return;
          }
          // Truly not found — serve index.html as last resort
          const indexPath = path.join(distPath, 'index.html');
          serveFile(res, indexPath, 'text/html');
        });
        return;
      }

      // No extension or .html — SPA fallback
      const indexPath = path.join(distPath, 'index.html');
      serveFile(res, indexPath, 'text/html');
    });
  };

  const server = tlsOptions
    ? https.createServer(tlsOptions, requestHandler)
    : http.createServer(requestHandler);

  server.on('error', (err) => {
    console.error(`[client] Server error: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, () => {
    const protocol = tlsOptions ? 'https' : 'http';
    console.log(`Jean2 client running at ${protocol}://localhost:${port}`);
  });

  function shutdown() {
    server.close(() => {
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export interface LaunchResult {
  success: boolean;
  pid?: number;
  port: number;
  url: string;
  error?: string;
}

export interface ClientLauncher {
  ensureInstalled(): Promise<string | null>;
  checkForUpdate(): Promise<string | null>;
  launch(port: number, serverPort: number, serverHost: string): Promise<LaunchResult>;
  relaunch(port: number, serverPort: number, serverHost: string): Promise<LaunchResult>;
  stop(): void;
  isRunning(): boolean;
  getInstalledVersion(): string | null;
}

export function createClientLauncher(): ClientLauncher {
  let childProcess: ReturnType<typeof Bun.spawn> | null = null;

  return {
    async ensureInstalled(): Promise<string | null> {
      if (isInstalled()) {
        const manifest = readClientManifest();
        return manifest?.version ?? null;
      }

      try {
        const result = await installClientPackage();
        return result.version;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[client] Failed to install: ${message}`);
        return null;
      }
    },

    async checkForUpdate(): Promise<string | null> {
      const manifest = readClientManifest();
      if (!manifest) return null;

      const latestVersion = await fetchLatestVersion();
      if (!latestVersion) return null;

      // Update the last check timestamp regardless
      writeClientManifest({
        ...manifest,
        lastUpdateCheck: new Date().toISOString(),
      });

      if (isNewerVersion(latestVersion, manifest.version)) {
        console.log(`[client] Update available: ${manifest.version} → ${latestVersion}`);
        return latestVersion;
      }

      return null;
    },

    async launch(port: number, serverPort: number, serverHost: string): Promise<LaunchResult> {
      const cliPath = getCliPath();
      if (!cliPath) {
        return {
          success: false,
          port,
          url: '',
          error: '@jean2/client CLI not found. Run ensureInstalled() first.',
        };
      }

      const clientProtocol = process.env.JEAN2_TLS_ENABLED === 'true' ? 'https' : 'http';
      const url = `${clientProtocol}://localhost:${port}`;

      try {
        childProcess = Bun.spawn(
          [
            process.execPath,
            '_client',
            '--cli-path', cliPath,
            '--port', String(port),
          ],
          {
            detached: false,
            windowsHide: true,
            stdout: 'inherit',
            stderr: 'inherit',
            env: {
              ...process.env,
              JEAN2_SERVER_URL: `${clientProtocol}://${serverHost === '0.0.0.0' ? 'localhost' : serverHost}:${serverPort}`,
            },
          },
        );

        // Give it a moment to detect immediate crashes (e.g. bad CLI args)
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (childProcess.exitCode !== null) {
          const code = childProcess.exitCode;
          childProcess = null;
          return {
            success: false,
            port,
            url,
            error: `Client process exited immediately with code ${code}`,
          };
        }

        childProcess.exited.then((code) => {
          if (code !== 0 && childProcess !== null) {
            console.warn(`[client] Process exited with code ${code}`);
            childProcess = null;
          }
        }).catch(() => {});

        console.log(`[client] Launched @ PID ${childProcess.pid} → ${url}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          port,
          url,
          error: `Failed to launch client: ${message}`,
        };
      }

      return {
        success: true,
        pid: childProcess.pid,
        port,
        url,
      };
    },

    async relaunch(port: number, serverPort: number, serverHost: string): Promise<LaunchResult> {
      this.stop();

      console.log('[client] Updating...');
      try {
        await installClientPackage();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          port,
          url: '',
          error: `Failed to update client: ${message}`,
        };
      }

      return this.launch(port, serverPort, serverHost);
    },

    stop(): void {
      if (childProcess && childProcess.exitCode === null) {
        try {
          childProcess.kill();
          console.log('[client] Stopped');
        } catch {
          // Process may have already exited
        }
        childProcess = null;
      }
    },

    isRunning(): boolean {
      return childProcess !== null && childProcess.exitCode === null;
    },

    getInstalledVersion(): string | null {
      return readClientManifest()?.version ?? null;
    },
  };
}
