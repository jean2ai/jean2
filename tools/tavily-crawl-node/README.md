# tavily-crawl

Crawl a website and extract content from multiple pages using the Tavily API.

## Requirements

- **Runtime**: `node`
- **Dependency**: `@tavily/core@^0.7.2`
- **Env**: `TAVILY_API_KEY` (required)

## LLM Parameters

These parameters can be provided by the AI when calling the tool:

- `url` (required): The root URL to begin the crawl
- `instructions` (optional): Natural language instructions to guide content discovery
- `selectPaths` (optional): Regex patterns to include only matching URLs
- `excludePaths` (optional): Regex patterns to exclude matching URLs
- `selectDomains` (optional): Regex patterns to restrict to specific domains
- `excludeDomains` (optional): Regex patterns to exclude specific domains

## Environment Variables

These parameters are operator-controlled via environment variables. The AI cannot override them.

| Variable | Default | Description |
|----------|---------|-------------|
| `TAVILY_API_KEY` | — | API key (required) |
| `TAVILY_MAX_DEPTH` | (API default) | Crawl depth (1-5) |
| `TAVILY_MAX_BREADTH` | (API default) | Links to follow per level (1-500) |
| `TAVILY_LIMIT` | (API default) | Total links to process |
| `TAVILY_EXTRACT_DEPTH` | `basic` | `basic` or `advanced` |
| `TAVILY_FORMAT` | `markdown` | Output format: `markdown` or `text` |
| `TAVILY_ALLOW_EXTERNAL` | `false` | Include external domain links |
| `TAVILY_INCLUDE_IMAGES` | `false` | Include images in crawl results |
| `TAVILY_CHUNKS_PER_SOURCE` | (omit) | Max content chunks per source (1-5) |