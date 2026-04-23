# tavily-map

Discover and map URLs on a website without extracting content using the Tavily API.

## Requirements

- **Runtime**: `bun`
- **Dependency**: `@tavily/core@^0.7.2`
- **Env**: `TAVILY_API_KEY` (required)

## LLM Parameters

These parameters can be provided by the AI when calling the tool:

- `url` (required): The root URL to begin mapping
- `instructions` (optional): Natural language instructions to guide URL discovery
- `selectPaths` (optional): Regex patterns to include only matching URLs
- `excludePaths` (optional): Regex patterns to exclude matching URLs
- `selectDomains` (optional): Regex patterns to restrict to specific domains
- `excludeDomains` (optional): Regex patterns to exclude specific domains

## Environment Variables

These parameters are operator-controlled via environment variables. The AI cannot override them.

| Variable | Default | Description |
|----------|---------|-------------|
| `TAVILY_API_KEY` | — | API key (required) |
| `TAVILY_MAX_DEPTH` | (API default) | Mapping depth (1-5) |
| `TAVILY_MAX_BREADTH` | (API default) | Links to follow per level (1-500) |
| `TAVILY_LIMIT` | (API default) | Total links to process |
| `TAVILY_ALLOW_EXTERNAL` | `false` | Include external domain links |