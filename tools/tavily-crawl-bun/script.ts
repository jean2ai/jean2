import { tavily } from '@tavily/core';

interface Input {
  url: string;
  instructions?: string;
  selectPaths?: string[];
  excludePaths?: string[];
  selectDomains?: string[];
  excludeDomains?: string[];
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
      selectPaths,
      excludePaths,
      selectDomains,
      excludeDomains,
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

    // Env-only: operator controls cost
    const maxDepth = process.env.TAVILY_MAX_DEPTH ? Number(process.env.TAVILY_MAX_DEPTH) : undefined;
    const maxBreadth = process.env.TAVILY_MAX_BREADTH ? Number(process.env.TAVILY_MAX_BREADTH) : undefined;
    const limit = process.env.TAVILY_LIMIT ? Number(process.env.TAVILY_LIMIT) : undefined;
    const extractDepth = process.env.TAVILY_EXTRACT_DEPTH || 'basic';
    const allowExternal = process.env.TAVILY_ALLOW_EXTERNAL === 'true';
    const includeImages = process.env.TAVILY_INCLUDE_IMAGES === 'true';
    const format = process.env.TAVILY_FORMAT || 'markdown';
    const chunksPerSource = process.env.TAVILY_CHUNKS_PER_SOURCE ? Number(process.env.TAVILY_CHUNKS_PER_SOURCE) : undefined;

    const options: Record<string, unknown> = {};

    if (maxDepth !== undefined) options.maxDepth = maxDepth;
    if (maxBreadth !== undefined) options.maxBreadth = maxBreadth;
    if (limit !== undefined) options.limit = limit;
    options.extractDepth = extractDepth;
    options.format = format as 'markdown' | 'text';
    options.allowExternal = allowExternal;
    options.includeImages = includeImages;
    if (chunksPerSource !== undefined) options.chunksPerSource = chunksPerSource;
    if (instructions !== undefined) options.instructions = instructions;
    if (selectPaths !== undefined) options.selectPaths = selectPaths;
    if (excludePaths !== undefined) options.excludePaths = excludePaths;
    if (selectDomains !== undefined) options.selectDomains = selectDomains;
    if (excludeDomains !== undefined) options.excludeDomains = excludeDomains;

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