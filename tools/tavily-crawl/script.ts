import { tavily } from '@tavily/core';

interface Input {
  url: string;
  instructions?: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  selectPaths?: string[];
  excludePaths?: string[];
  extractDepth?: 'basic' | 'advanced';
  format?: 'markdown' | 'text';
  workspacePath: string;
  sessionId: string;
}

interface CrawlResult {
  url: string;
  rawContent: string;
  images?: string[];
  favicon?: string;
}

interface Output {
  baseUrl: string;
  results: CrawlResult[];
  error?: string;
}

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: Input = JSON.parse(inputText);

    const {
      url,
      instructions,
      maxDepth,
      maxBreadth,
      limit,
      selectPaths,
      excludePaths,
      extractDepth,
      format,
      workspacePath,
      sessionId,
    } = input;

    if (!sessionId || !workspacePath) {
      const output: Output = { baseUrl: '', results: [], error: 'Missing required sessionId or workspacePath' };
      console.log(JSON.stringify(output));
      return;
    }

    if (!url || url.trim() === '') {
      const output: Output = { baseUrl: '', results: [], error: 'URL is required' };
      console.log(JSON.stringify(output));
      return;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      const output: Output = { baseUrl: '', results: [], error: 'TAVILY_API_KEY environment variable is not set' };
      console.log(JSON.stringify(output));
      return;
    }

    const client = tavily({ apiKey });

    const options: Record<string, unknown> = {};
    if (instructions !== undefined) options.instructions = instructions;
    if (maxDepth !== undefined) options.maxDepth = maxDepth;
    if (maxBreadth !== undefined) options.maxBreadth = maxBreadth;
    if (limit !== undefined) options.limit = limit;
    if (selectPaths !== undefined) options.selectPaths = selectPaths;
    if (excludePaths !== undefined) options.excludePaths = excludePaths;
    if (extractDepth !== undefined) options.extractDepth = extractDepth;
    if (format !== undefined) options.format = format;

    const response = await client.crawl(url, options);

    const output: Output = {
      baseUrl: url,
      results: response.results.map((result: { url?: string; rawContent?: string; images?: string[]; favicon?: string }) => ({
        url: result.url || '',
        rawContent: result.rawContent || '',
        images: result.images,
        favicon: result.favicon,
      })),
    };

    console.log(JSON.stringify(output));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const output: Output = { baseUrl: '', results: [], error: message };
    console.log(JSON.stringify(output));
  }
}

main();
