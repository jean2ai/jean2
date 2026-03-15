import { Hono } from 'hono';
import { pathToFileURL } from 'url';
import { lspManager } from '@/manager';

const app = new Hono();

app.post('/initialize', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceRoot } = body;

    if (!workspaceRoot) {
      return c.json({ success: false, error: 'workspaceRoot is required' }, 400);
    }

    await lspManager.initialize(workspaceRoot);
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
    const { uri, position } = body;

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getDefinition(fileUri, position);
    
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
    const { uri, position } = body;

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getReferences(fileUri, position);
    
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
    const { uri, position } = body;

    if (!uri || !position) {
      return c.json({ success: false, error: 'uri and position are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getHover(fileUri, position);
    
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
    const { uri } = body;

    if (!uri) {
      return c.json({ success: false, error: 'uri is required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    const result = await lspManager.getDocumentSymbols(fileUri);
    
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
    const { uri } = body;

    if (uri) {
      const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
      const result = lspManager.getDiagnostics(fileUri);
      return c.json({ success: true, result });
    }

    const allDiagnostics = lspManager.getAllDiagnostics();
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
    const { uri, content } = body;

    if (!uri || content === undefined) {
      return c.json({ success: false, error: 'uri and content are required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    await lspManager.openFile(fileUri, content);
    
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
    const { uri } = body;

    if (!uri) {
      return c.json({ success: false, error: 'uri is required' }, 400);
    }

    const fileUri = uri.startsWith('file://') ? uri : pathToFileURL(uri).href;
    await lspManager.closeFile(fileUri);
    
    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('LSP close error:', message);
    return c.json({ success: false, error: message });
  }
});

export default app;
