import { tavily } from '@tavily/core';

interface Input {
  url: string;
  instructions?: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  selectPaths?: string[];
  excludePaths?: string[];
  workspacePath: string;
  sessionId: string;
}

interface MapOutput {
  baseUrl: string;
  results: string[];
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
      workspacePath,
      sessionId,
    } = input;

    if (!sessionId || !workspacePath) {
      const output: MapOutput = { baseUrl: '', results: [], error: 'Missing required sessionId or workspacePath' };
      console.log(JSON.stringify(output));
      return;
    }

    if (!url || url.trim() === '') {
      const output: MapOutput = { baseUrl: '', results: [], error: 'URL is required' };
      console.log(JSON.stringify(output));
      return;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      const output: MapOutput = { baseUrl: '', results: [], error: 'TAVILY_API_KEY environment variable is not set' };
      console.log(JSON.stringify(output));
      return;
    }

    const client = tavily({ apiKey });

    const options: {
      instructions?: string;
      maxDepth?: number;
      maxBreadth?: number;
      limit?: number;
      selectPaths?: string[];
      excludePaths?: string[];
    } = {};

    if (instructions !== undefined) options.instructions = instructions;
    if (maxDepth !== undefined) options.maxDepth = maxDepth;
    if (maxBreadth !== undefined) options.maxBreadth = maxBreadth;
    if (limit !== undefined) options.limit = limit;
    if (selectPaths !== undefined) options.selectPaths = selectPaths;
    if (excludePaths !== undefined) options.excludePaths = excludePaths;

    const response = await client.map(url, options);

    const output: MapOutput = {
      baseUrl: url,
      results: response.results || [],
    };

    console.log(JSON.stringify(output));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const output: MapOutput = {
      baseUrl: '',
      results: [],
      error: message,
    };
    console.log(JSON.stringify(output));
  }
}

main();
