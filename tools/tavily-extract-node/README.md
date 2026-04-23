# tavily-extract

Extract clean content from a list of URLs using the Tavily API.

## Requirements

- **Runtime**: `node`
- **Dependency**: `@tavily/core@^0.7.2`
- **Env**: `TAVILY_API_KEY` (required)

## LLM Parameters

These parameters can be provided by the AI when calling the tool:

- `urls` (required): List of URLs to extract content from (max 20)
- `query` (optional): User intent for reranking extracted content chunks

## Environment Variables

These parameters are operator-controlled via environment variables. The AI cannot override them.

| Variable | Default | Description |
|----------|---------|-------------|
| `TAVILY_API_KEY` | — | API key (required) |
| `TAVILY_EXTRACT_DEPTH` | `basic` | `basic` (1 credit/5 URLs) or `advanced` (2 credits/5 URLs) |
| `TAVILY_FORMAT` | `markdown` | Output format: `markdown` or `text` |
| `TAVILY_INCLUDE_IMAGES` | `false` | Include extracted images list |
| `TAVILY_CHUNKS_PER_SOURCE` | (omit) | Max content chunks per source (1-5), only effective with query |