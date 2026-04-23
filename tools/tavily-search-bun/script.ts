import { tavily } from '@tavily/core';

interface SearchInput {
  query: string;
  topic?: 'general' | 'news' | 'finance';
  timeRange?: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
  includeRawContent?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
  exactMatch?: boolean;
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
      timeRange,
      startDate,
      endDate,
      includeRawContent,
      includeDomains,
      excludeDomains,
      country,
      exactMatch,
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

    // Env-only: operator controls cost
    const searchDepth = process.env.TAVILY_SEARCH_DEPTH || 'basic';
    const maxResults = Number(process.env.TAVILY_MAX_RESULTS) || 5;
    const includeAnswer = process.env.TAVILY_INCLUDE_ANSWER === 'true';
    const includeImages = process.env.TAVILY_INCLUDE_IMAGES === 'true';
    const includeImageDescriptions = process.env.TAVILY_INCLUDE_IMAGE_DESCRIPTIONS === 'true';
    const chunksPerSource = process.env.TAVILY_CHUNKS_PER_SOURCE ? Number(process.env.TAVILY_CHUNKS_PER_SOURCE) : undefined;

    const options: Record<string, unknown> = {};

    if (topic !== undefined) options.topic = topic;
    options.searchDepth = searchDepth;
    options.maxResults = maxResults;
    if (timeRange !== undefined) options.timeRange = timeRange;
    if (startDate !== undefined) options.startDate = startDate;
    if (endDate !== undefined) options.endDate = endDate;
    if (chunksPerSource !== undefined) options.chunksPerSource = chunksPerSource;
    options.includeAnswer = includeAnswer;
    if (includeRawContent !== undefined) options.includeRawContent = includeRawContent;
    options.includeImages = includeImages;
    options.includeImageDescriptions = includeImageDescriptions;
    if (includeDomains !== undefined) options.includeDomains = includeDomains;
    if (excludeDomains !== undefined) options.excludeDomains = excludeDomains;
    if (country !== undefined) options.country = country;
    if (exactMatch !== undefined) options.exactMatch = exactMatch;

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