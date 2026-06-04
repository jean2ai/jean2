import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { state } from '../src/state';

describe('html', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jean2-vscode-test-'));
    state.serverPort = 9999;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getProductionHtml rewrites asset paths to local server', async () => {
    // Import after setting up tmpDir to avoid caching
    const { getProductionHtml } = await import('../src/html');

    const indexPath = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/assets/style.css">
  <script type="module" src="./assets/main.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`);

    const mockWebview = { cspSource: 'vscode-webview:' } as unknown as import('vscode').Webview;
    const mockUri = { fsPath: tmpDir } as unknown as import('vscode').Uri;

    const html = getProductionHtml(mockWebview, mockUri);

    expect(html).toContain('http://127.0.0.1:9999/assets/style.css');
    expect(html).toContain('http://127.0.0.1:9999/assets/main.js');
  });

  test('getProductionHtml strips PWA manifest and service worker', async () => {
    const { getProductionHtml } = await import('../src/html');

    const indexPath = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html>
<head>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <div id="root"></div>
  <script src="/registerSW.js"></script>
  <script type="modulepreload" href="/chunk.js"></script>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
</body>
</html>`);

    const mockWebview = { cspSource: 'vscode-webview:' } as unknown as import('vscode').Webview;
    const mockUri = { fsPath: tmpDir } as unknown as import('vscode').Uri;

    const html = getProductionHtml(mockWebview, mockUri);

    expect(html).not.toContain('manifest');
    expect(html).not.toContain('favicon.ico');
    expect(html).not.toContain('registerSW');
    expect(html).not.toContain('modulepreload');
    // Should have our injected CSP
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('script-src http://127.0.0.1:9999');
  });

  test('getProductionHtml strips inline theme detection script', async () => {
    const { getProductionHtml } = await import('../src/html');

    const indexPath = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="root"></div>
  <script>(function() { var t = localStorage.getItem('theme'); })()</script>
</body>
</html>`);

    const mockWebview = { cspSource: 'vscode-webview:' } as unknown as import('vscode').Webview;
    const mockUri = { fsPath: tmpDir } as unknown as import('vscode').Uri;

    const html = getProductionHtml(mockWebview, mockUri);

    expect(html).not.toContain('(function()');
  });

  test('getDevHtml includes Vite client and dev server URL', async () => {
    const { getDevHtml } = await import('../src/html');

    const mockWebview = { cspSource: 'vscode-webview:' } as unknown as import('vscode').Webview;
    const html = getDevHtml(mockWebview);

    expect(html).toContain('@vite/client');
    expect(html).toContain('http://localhost:5173');
    expect(html).toContain('src/main.tsx');
    expect(html).toContain('vscode-webview:');
  });

  test('getDevHtml has proper CSP', async () => {
    const { getDevHtml } = await import('../src/html');

    const mockWebview = { cspSource: 'vscode-webview:' } as unknown as import('vscode').Webview;
    const html = getDevHtml(mockWebview);

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('connect-src http://localhost:* ws://localhost:* wss://localhost:* https: wss:');
  });
});
