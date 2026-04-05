import { tavily } from '@tavily/core';

interface SearchInput {
  query: string;
  topic?: 'general' | 'news' | 'finance';
  searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  maxResults?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  includeImages?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  workspacePath: string;
  sessionId: string;
}

interface SearchOutput {
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  error?: string;
}

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: SearchInput = JSON.parse(inputText);

    const {
      query,
      topic,
      searchDepth,
      maxResults,
      timeRange,
      includeAnswer,
      includeRawContent,
      includeImages,
      includeDomains,
      excludeDomains,
      workspacePath,
      sessionId,
    } = input;

    if (!sessionId || !workspacePath) {
      const output: SearchOutput = { results: [], error: 'Missing required sessionId or workspacePath' };
      console.log(JSON.stringify(output));
      return;
    }

    if (!query || query.trim() === '') {
      const output: SearchOutput = { results: [], error: 'Query is required' };
      console.log(JSON.stringify(output));
      return;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      const output: SearchOutput = { results: [], error: 'TAVILY_API_KEY environment variable is not set' };
      console.log(JSON.stringify(output));
      return;
    }

    const client = tavily({ apiKey });

    const options: Record<string, unknown> = {};

    if (topic !== undefined) options.topic = topic;
    if (searchDepth !== undefined) options.searchDepth = searchDepth;
    if (maxResults !== undefined) options.maxResults = maxResults;
    if (timeRange !== undefined) options.timeRange = timeRange;
    if (includeAnswer !== undefined) options.includeAnswer = includeAnswer;
    if (includeRawContent !== undefined) options.includeRawContent = includeRawContent;
    if (includeImages !== undefined) options.includeImages = includeImages;
    if (includeDomains !== undefined) options.includeDomains = includeDomains;
    if (excludeDomains !== undefined) options.excludeDomains = excludeDomains;

    const response = await client.search(query, options);

    const results = response.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      score: result.score,
    }));

    const output: SearchOutput = {
      results,
    };

    if (response.answer) {
      output.answer = response.answer;
    }

    console.log(JSON.stringify(output));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const output: SearchOutput = { results: [], error: message };
    console.log(JSON.stringify(output));
  }
}

main();
