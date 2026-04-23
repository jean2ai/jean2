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
      urls,
      query,
      workspacePath,
      sessionId,
    } = input;

    if (!sessionId || !workspacePath) {
      const output = { results: [], failedResults: [], error: 'Missing required sessionId or workspacePath' };
      console.log(JSON.stringify(output));
      return;
    }

    if (!urls || urls.length === 0) {
      const output = { results: [], failedResults: [], error: 'No URLs provided' };
      console.log(JSON.stringify(output));
      return;
    }

    if (urls.length > 20) {
      const output = { results: [], failedResults: [], error: 'Maximum 20 URLs allowed' };
      console.log(JSON.stringify(output));
      return;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      const output = { results: [], failedResults: [], error: 'TAVILY_API_KEY environment variable is not set' };
      console.log(JSON.stringify(output));
      return;
    }

    // Env-only: operator controls cost
    const extractDepth = process.env.TAVILY_EXTRACT_DEPTH || 'basic';
    const includeImages = process.env.TAVILY_INCLUDE_IMAGES === 'true';
    const chunksPerSource = process.env.TAVILY_CHUNKS_PER_SOURCE ? Number(process.env.TAVILY_CHUNKS_PER_SOURCE) : undefined;
    const format = process.env.TAVILY_FORMAT || 'markdown';

    const client = tavily({ apiKey });

    const options = {};

    if (query) options.query = query;
    options.extractDepth = extractDepth;
    options.format = format;
    options.includeImages = includeImages;
    if (chunksPerSource !== undefined) options.chunksPerSource = chunksPerSource;

    const response = await client.extract(urls, options);

    const results = response.results.map((r) => ({
      url: r.url,
      rawContent: r.rawContent,
      ...(r.images && { images: r.images }),
      ...(r.favicon && { favicon: r.favicon }),
    }));

    const failedResults = (response.failedResults || []).map((r) => ({
      url: r.url,
      error: r.error,
    }));

    const output = { results, failedResults };
    console.log(JSON.stringify(output));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = { results: [], failedResults: [], error: message };
    console.log(JSON.stringify(output));
  }
}

main();
