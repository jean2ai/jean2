import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { state } from '../src/state';

describe('server', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jean2-vscode-test-'));
    state.serverPort = 0;
    state.server = null;
  });

  afterEach(() => {
    if (state.server) {
      state.server.close();
      state.server = null;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('startStaticServer serves index.html for root path', async () => {
    const { startStaticServer } = await import('../src/server');

    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html>hello</html>');

    const port = await startStaticServer(tmpDir);
    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('hello');
  });

  test('startStaticServer serves static files', async () => {
    const { startStaticServer } = await import('../src/server');

    fs.writeFileSync(path.join(tmpDir, 'test.js'), 'console.log(1);');

    const port = await startStaticServer(tmpDir);

    const response = await fetch(`http://127.0.0.1:${port}/test.js`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('console.log(1);');
  });

  test('startStaticServer returns 404 for missing files', async () => {
    const { startStaticServer } = await import('../src/server');

    const port = await startStaticServer(tmpDir);

    const response = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    expect(response.status).toBe(404);
  });

  test('startStaticServer blocks directory traversal via encoded path', async () => {
    const { startStaticServer } = await import('../src/server');

    const port = await startStaticServer(tmpDir);

    // URL-encoded traversal attempt bypasses HTTP client normalization
    const response = await fetch(`http://127.0.0.1:${port}/%2e%2e/secret.txt`);
    expect(response.status).toBe(404);
  });

  test('startStaticServer serves index.html for directory paths', async () => {
    const { startStaticServer } = await import('../src/server');

    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.html'), 'sub index');

    const port = await startStaticServer(tmpDir);

    const response = await fetch(`http://127.0.0.1:${port}/sub`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('sub index');
  });

  test('startStaticServer resolves on successful listen', async () => {
    const { startStaticServer } = await import('../src/server');

    const port = await startStaticServer(tmpDir);
    expect(port).toBeGreaterThan(0);
    expect(state.serverPort).toBe(port);
  });
});
