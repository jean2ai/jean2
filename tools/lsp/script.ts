interface Input {
  operation: 'definition' | 'references' | 'hover' | 'symbols';
  path: string;
  line?: number;
  character?: number;
  workspacePath: string;
  sessionId: string;
}

interface Output {
  success: boolean;
  result?: unknown;
  error?: string;
  _visualization?: {
    type: 'none';
    message: string;
  };
}

const LSP_SERVER_URL = process.env.LSP_SERVER_URL || 'http://localhost:3001';

async function fetchWithError(url: string, options: RequestInit): Promise<Output> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json() as Output;
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

async function initializeLsp(workspaceId: string, workspacePath: string): Promise<Output> {
  const url = `${LSP_SERVER_URL}/initialize`;
  const body = JSON.stringify({ workspaceId, workspaceRoot: workspacePath });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

async function getDefinition(workspaceId: string, uri: string, line: number, character: number): Promise<Output> {
  const url = `${LSP_SERVER_URL}/definition`;
  const body = JSON.stringify({
    workspaceId,
    uri,
    position: { line, character },
  });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

async function getReferences(workspaceId: string, uri: string, line: number, character: number): Promise<Output> {
  const url = `${LSP_SERVER_URL}/references`;
  const body = JSON.stringify({
    workspaceId,
    uri,
    position: { line, character },
  });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

async function getHover(workspaceId: string, uri: string, line: number, character: number): Promise<Output> {
  const url = `${LSP_SERVER_URL}/hover`;
  const body = JSON.stringify({
    workspaceId,
    uri,
    position: { line, character },
  });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

async function getSymbols(workspaceId: string, uri: string): Promise<Output> {
  const url = `${LSP_SERVER_URL}/symbols`;
  const body = JSON.stringify({ workspaceId, uri });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

async function openFile(workspaceId: string, uri: string, content: string): Promise<Output> {
  const url = `${LSP_SERVER_URL}/open`;
  const body = JSON.stringify({ workspaceId, uri, content });
  const result = await fetchWithError(url, {
    method: 'POST',
    body,
  });
  return result;
}

function pathToFileURL(filePath: string): URL {
  let normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  return new URL('file://' + normalizedPath);
}

async function main(): Promise<void> {
  const inputText = await ((): Promise<string> => {
    const chunks: Buffer[] = [];
    const stdin = process.stdin;

    return new Promise<string>((resolve, reject) => {
      stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stdin.on('error', reject);
    });
  })();

  let input: Input;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output: Output = { success: false, error: 'Invalid JSON input' };
    console.log(JSON.stringify(output));
    return;
  }

  const { operation, path: filePath, line, character, workspacePath, _sessionId } = input;

  if (!filePath) {
    const output: Output = { success: false, error: 'path is required' };
    console.log(JSON.stringify(output));
    return;
  }

  if (!operation) {
    const output: Output = { success: false, error: 'operation is required' };
    console.log(JSON.stringify(output));
    return;
  }

  const needsPosition = operation !== 'symbols';
  if (needsPosition && (line === undefined || character === undefined)) {
    const output: Output = { success: false, error: `operation '${operation}' requires line and character` };
    console.log(JSON.stringify(output));
    return;
  }

  const initResult = await initializeLsp(workspacePath, workspacePath);
  if (!initResult.success) {
    const output: Output = { success: false, error: initResult.error || 'Failed to initialize LSP' };
    console.log(JSON.stringify(output));
    return;
  }

  const uri = filePath.startsWith('file://') ? filePath : pathToFileURL(filePath).href;

  // Open the file in LSP before querying
  const file = Bun.file(filePath);
  const fileExists = await file.exists();
  if (!fileExists) {
    const output: Output = { success: false, error: `File not found: ${filePath}` };
    console.log(JSON.stringify(output));
    return;
  }

  const content = await file.text();
  const openResult = await openFile(workspacePath, uri, content);
  if (!openResult.success) {
    const output: Output = { success: false, error: openResult.error || 'Failed to open file in LSP' };
    console.log(JSON.stringify(output));
    return;
  }

  let result: Output;

  switch (operation) {
    case 'definition': {
      result = await getDefinition(workspacePath, uri, line! - 1, character! - 1);
      break;
    }
    case 'references': {
      result = await getReferences(workspacePath, uri, line! - 1, character! - 1);
      break;
    }
    case 'hover': {
      result = await getHover(workspacePath, uri, line! - 1, character! - 1);
      break;
    }
    case 'symbols': {
      result = await getSymbols(workspacePath, uri);
      break;
    }
    default: {
      result = { success: false, error: `Unknown operation: ${operation}` };
    }
  }

  if (result.success) {
    result._visualization = { type: 'none', message: `LSP: ${operation}` };
  }

  console.log(JSON.stringify(result));
}

main();
