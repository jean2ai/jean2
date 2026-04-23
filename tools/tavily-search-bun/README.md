# tavily-search

Web search tool using the Tavily API. Returns ranked search results with titles, URLs, content snippets, and relevance scores.

## Requirements

- **Runtime**: `bun`
- **Dependency**: `@tavily/core@^0.7.2`
- **Env**: `TAVILY_API_KEY` (required)

## LLM Parameters

These parameters can be provided by the AI when calling the tool:

- `query` (required): The search query to execute
- `topic` (optional): `general`, `news`, or `finance`
- `timeRange` (optional): Filter by publish date — `day`, `week`, `month`, or `year`
- `startDate` (optional): Return results after this date (YYYY-MM-DD)
- `endDate` (optional): Return results before this date (YYYY-MM-DD)
- `includeRawContent` (optional): Include cleaned HTML content of each result
- `includeDomains` (optional): List of domains to restrict results to (max 300)
- `excludeDomains` (optional): List of domains to exclude from results (max 150)
- `country` (optional): Boost results from a specific country (full name, e.g. "united states")
- `exactMatch` (optional): Only return results containing exact quoted phrase(s) from the query

## Environment Variables

These parameters are operator-controlled via environment variables. The AI cannot override them.

| Variable | Default | Description |
|----------|---------|-------------|
| `TAVILY_API_KEY` | — | API key (required) |
| `TAVILY_SEARCH_DEPTH` | `basic` | `basic` (1 credit), `advanced` (2 credits), `fast`, `ultra-fast` |
| `TAVILY_MAX_RESULTS` | `5` | Number of results returned (0-20) |
| `TAVILY_INCLUDE_ANSWER` | `false` | Include an LLM-generated answer to the query |
| `TAVILY_INCLUDE_IMAGES` | `false` | Include images in the response |
| `TAVILY_INCLUDE_IMAGE_DESCRIPTIONS` | `false` | Include descriptions for each image |
| `TAVILY_CHUNKS_PER_SOURCE` | (omit) | Max content chunks per source (1-3), only with advanced depth |