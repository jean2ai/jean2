import { tavily } from '@tavily/core';

interface ExtractInput {
  urls: string[];
  query?: string;
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
  try {
    const input: ExtractInput = JSON.parse(await Bun.stdin.text());

    const {
      urls,
      query,
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

    // Env-only: operator controls cost
    const extractDepth = process.env.TAVILY_EXTRACT_DEPTH || 'basic';
    const includeImages = process.env.TAVILY_INCLUDE_IMAGES === 'true';
    const chunksPerSource = process.env.TAVILY_CHUNKS_PER_SOURCE ? Number(process.env.TAVILY_CHUNKS_PER_SOURCE) : undefined;
    const format = process.env.TAVILY_FORMAT || 'markdown';

    const client = tavily({ apiKey });

    const options: {
      query?: string;
      extractDepth?: 'basic' | 'advanced';
      includeImages?: boolean;
      chunksPerSource?: number;
    } = {};

    if (query) options.query = query;
    options.extractDepth = extractDepth as 'basic' | 'advanced';
    options.format = format as 'markdown' | 'text';
    options.includeImages = includeImages;
    if (chunksPerSource !== undefined) options.chunksPerSource = chunksPerSource;

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