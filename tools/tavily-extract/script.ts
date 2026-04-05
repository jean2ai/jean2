import { tavily } from '@tavily/core';

interface ExtractInput {
  urls: string[];
  query?: string;
  extractDepth?: 'basic' | 'advanced';
  format?: 'markdown' | 'text';
  includeImages?: boolean;
  workspacePath: string;
  sessionId: string;
}

interface ExtractOutput {
  results: Array<{
    url: string;
    rawContent: string;
    images?: string[];
    favicon?: string;
  }>;
  failedResults: Array<{
    url: string;
    error: string;
  }>;
  error?: string;
}

async function main(): Promise<void> {
  const input: ExtractInput = JSON.parse(await Bun.stdin.text());

  const {
    urls,
    query,
    extractDepth = 'basic',
    format = 'markdown',
    includeImages = false,
    workspacePath,
    sessionId,
  } = input;

  if (!sessionId || !workspacePath) {
    const output: ExtractOutput = { results: [], failedResults: [], error: 'Missing required sessionId or workspacePath' };
    console.log(JSON.stringify(output));
    return;
  }

  if (!urls || urls.length === 0) {
    const output: ExtractOutput = { results: [], failedResults: [], error: 'No URLs provided' };
    console.log(JSON.stringify(output));
    return;
  }

  if (urls.length > 20) {
    const output: ExtractOutput = { results: [], failedResults: [], error: 'Maximum 20 URLs allowed' };
    console.log(JSON.stringify(output));
    return;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const output: ExtractOutput = { results: [], failedResults: [], error: 'TAVILY_API_KEY environment variable is not set' };
    console.log(JSON.stringify(output));
    return;
  }

  try {
    const client = tavily({ apiKey });

    const options: {
      query?: string;
      extractDepth?: 'basic' | 'advanced';
      format?: 'markdown' | 'text';
      includeImages?: boolean;
    } = {};

    if (query) options.query = query;
    if (extractDepth) options.extractDepth = extractDepth;
    if (format) options.format = format;
    if (includeImages !== undefined) options.includeImages = includeImages;

    const response = await client.extract(urls, options);

    const results: ExtractOutput['results'] = response.results.map((r) => ({
      url: r.url,
      rawContent: r.rawContent,
      ...(r.images && { images: r.images }),
      ...(r.favicon && { favicon: r.favicon }),
    }));

    const failedResults: ExtractOutput['failedResults'] = (response.failedResults || []).map((r) => ({
      url: r.url,
      error: r.error,
    }));

    const output: ExtractOutput = { results, failedResults };
    console.log(JSON.stringify(output));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const output: ExtractOutput = { results: [], failedResults: [], error: message };
    console.log(JSON.stringify(output));
  }
}

main();
