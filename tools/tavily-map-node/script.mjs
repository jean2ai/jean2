import { tavily } from '@tavily/core';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

async function main() {
  try {
    const inputText = await readStdin();
    const input = JSON.parse(inputText);

    const {
      url,
      instructions,
      selectPaths,
      excludePaths,
      selectDomains,
      excludeDomains,
      workspacePath,
      sessionId,
    } = input;

    if (!sessionId || !workspacePath) {
      const output = { baseUrl: '', results: [], error: 'Missing required sessionId or workspacePath' };
      console.log(JSON.stringify(output));
      return;
    }

    if (!url || url.trim() === '') {
      const output = { baseUrl: '', results: [], error: 'URL is required' };
      console.log(JSON.stringify(output));
      return;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      const output = { baseUrl: '', results: [], error: 'TAVILY_API_KEY environment variable is not set' };
      console.log(JSON.stringify(output));
      return;
    }

    const client = tavily({ apiKey });

    // Env-only: operator controls cost
    const maxDepth = process.env.TAVILY_MAX_DEPTH ? Number(process.env.TAVILY_MAX_DEPTH) : undefined;
    const maxBreadth = process.env.TAVILY_MAX_BREADTH ? Number(process.env.TAVILY_MAX_BREADTH) : undefined;
    const limit = process.env.TAVILY_LIMIT ? Number(process.env.TAVILY_LIMIT) : undefined;
    const allowExternal = process.env.TAVILY_ALLOW_EXTERNAL === 'true';

    const options = {};

    if (maxDepth !== undefined) options.maxDepth = maxDepth;
    if (maxBreadth !== undefined) options.maxBreadth = maxBreadth;
    if (limit !== undefined) options.limit = limit;
    options.allowExternal = allowExternal;
    if (instructions !== undefined) options.instructions = instructions;
    if (selectPaths !== undefined) options.selectPaths = selectPaths;
    if (excludePaths !== undefined) options.excludePaths = excludePaths;
    if (selectDomains !== undefined) options.selectDomains = selectDomains;
    if (excludeDomains !== undefined) options.excludeDomains = excludeDomains;

    const response = await client.map(url, options);

    const output = {
      baseUrl: url,
      results: response.results || [],
    };

    console.log(JSON.stringify(output));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = {
      baseUrl: '',
      results: [],
      error: message,
    };
    console.log(JSON.stringify(output));
  }
}

main();
