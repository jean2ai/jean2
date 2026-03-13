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
}

const SERVER_URL = process.env.JEAN2_SERVER_URL || 'http://localhost:3000';

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

async function initializeLsp(workspacePath: string): Promise<Output> {
  const url = `${SERVER_URL}/api/lsp/initialize`;
  return fetchWithError(url, {
    method: 'POST',
    body: JSON.stringify({ workspaceRoot: workspacePath }),
  });
}

async function getDefinition(uri: string, line: number, character: number): Promise<Output> {
  const url = `${SERVER_URL}/api/lsp/definition`;
  return fetchWithError(url, {
    method: 'POST',
    body: JSON.stringify({
      uri,
      position: { line, character },
    }),
  });
}

async function getReferences(uri: string, line: number, character: number): Promise<Output> {
  const url = `${SERVER_URL}/api/lsp/references`;
  return fetchWithError(url, {
    method: 'POST',
    body: JSON.stringify({
      uri,
      position: { line, character },
    }),
  });
}

async function getHover(uri: string, line: number, character: number): Promise<Output> {
  const url = `${SERVER_URL}/api/lsp/hover`;
  return fetchWithError(url, {
    method: 'POST',
    body: JSON.stringify({
      uri,
      position: { line, character },
    }),
  });
}

async function getSymbols(uri: string): Promise<Output> {
  const url = `${SERVER_URL}/api/lsp/symbols`;
  return fetchWithError(url, {
    method: 'POST',
    body: JSON.stringify({ uri }),
  });
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

  const { operation, path: filePath, line, character, workspacePath } = input;

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

  const initResult = await initializeLsp(workspacePath);
  if (!initResult.success) {
    const output: Output = { success: false, error: initResult.error || 'Failed to initialize LSP' };
    console.log(JSON.stringify(output));
    return;
  }

  const uri = filePath.startsWith('file://') ? filePath : pathToFileURL(filePath).href;

  let result: Output;

  switch (operation) {
    case 'definition': {
      result = await getDefinition(uri, line! - 1, character! - 1);
      break;
    }
    case 'references': {
      result = await getReferences(uri, line! - 1, character! - 1);
      break;
    }
    case 'hover': {
      result = await getHover(uri, line! - 1, character! - 1);
      break;
    }
    case 'symbols': {
      result = await getSymbols(uri);
      break;
    }
    default: {
      result = { success: false, error: `Unknown operation: ${operation}` };
    }
  }

  console.log(JSON.stringify(result));
}

main();
