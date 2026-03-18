import { Hono } from 'hono';
import { pathToFileURL } from 'url';
import { lspManager } from '@/manager';

const app = new Hono();

app.post('/initialize', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, workspaceRoot } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!workspaceRoot) {
      return c.json({ success: false, error: 'workspaceRoot is required' }, 400);
    }

    await lspManager.initialize(workspaceId, workspaceRoot);
    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP initialize error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/definition', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri, position } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getDefinition(workspaceId, fileUri, position);

    return c.json({ success: true, result: result ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP definition error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/references', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri, position } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getReferences(workspaceId, fileUri, position);

    return c.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP references error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/hover', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri, position } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getHover(workspaceId, fileUri, position);

    return c.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP hover error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/symbols', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri) {
      return c.json({ success: false, error: 'uri is required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getDocumentSymbols(workspaceId, fileUri);

    return c.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP symbols error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/diagnostics', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (uri) {
      const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
      const result = lspManager.getDiagnostics(workspaceId, fileUri);
      return c.json({ success: true, result });
    }

    const allDiagnostics = lspManager.getAllDiagnostics(workspaceId);
    const result: Record<string, unknown[]> = {};
    allDiagnostics.forEach((diagnostics, fileUri) => {
      result[fileUri] = diagnostics;
    });

    return c.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP diagnostics error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/open', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri, content } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri || content === undefined) {
      return c.json({ success: false, error: 'uri and content are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    await lspManager.openFile(workspaceId, fileUri, content);

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP open error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/close', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uri } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    if (!uri) {
      return c.json({ success: false, error: 'uri is required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    await lspManager.closeFile(workspaceId, fileUri);

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP close error:', message);
    return c.json({ success: false, error: message });
  }
});

app.post('/shutdown', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId } = body;

    if (!workspaceId) {
      return c.json({ success: false, error: 'workspaceId is required' }, 400);
    }

    await lspManager.shutdownWorkspace(workspaceId);
    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP shutdown error:', message);
    return c.json({ success: false, error: message });
  }
});

app.get('/workspaces', (c) => {
  const workspaces = lspManager.getActiveWorkspaces();
  return c.json({ success: true, workspaces });
});

export default app;
