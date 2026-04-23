---
name: tavily-crawl
script: script.mjs
runtime: node
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: "The root URL to begin the crawl"
    instructions:
      type: string
      description: "Natural language instructions for the crawler to guide content discovery"
    selectPaths:
      type: array
      items:
        type: string
      description: "Regex patterns to select only URLs with specific path patterns (e.g. /docs/.*)"
    excludePaths:
      type: array
      items:
        type: string
      description: "Regex patterns to exclude URLs with specific path patterns (e.g. /admin/.*)"
    selectDomains:
      type: array
      items:
        type: string
      description: "Regex patterns to restrict crawling to specific domains or subdomains (e.g. ^docs\\.example\\.com$)"
    excludeDomains:
      type: array
      items:
        type: string
      description: "Regex patterns to exclude specific domains or subdomains from crawling"
  required:
    - url
outputSchema:
  type: object
  properties:
    baseUrl:
      type: string
    results:
      type: array
      items:
        type: object
        properties:
          url:
            type: string
          rawContent:
            type: string
          images:
            type: array
            items:
              type: string
          favicon:
            type: string
    error:
      type: string
timeout: 180000
requireApproval: false
dangerous: false
env:
  - TAVILY_API_KEY
  - TAVILY_MAX_DEPTH
  - TAVILY_MAX_BREADTH
  - TAVILY_LIMIT
  - TAVILY_EXTRACT_DEPTH
  - TAVILY_ALLOW_EXTERNAL
  - TAVILY_INCLUDE_IMAGES
  - TAVILY_CHUNKS_PER_SOURCE
  - TAVILY_FORMAT
hasSecurityCheck: false
---

Crawl a website and extract content from multiple pages using the Tavily search API.

## When to use

- Crawling documentation sites (e.g., API docs, README files, knowledge bases)
- Exploring website structure with full content extraction
- Gathering content from multiple related pages on a domain
- Building a corpus of web content for analysis or training
- Research tasks requiring comprehensive site exploration

## When NOT to use

- For simple URL list discovery without content extraction (use `tavily-map` instead)
- For single page fetching (use `webfetch` instead)
- For real-time search queries (use `tavily-search` instead)

## Usage

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `url` | Yes | - | Root URL to begin the crawl |
| `instructions` | No | - | Natural language instructions to guide content discovery |
| `selectPaths` | No | - | Regex patterns to include only matching URLs |
| `excludePaths` | No | - | Regex patterns to exclude matching URLs |
| `selectDomains` | No | - | Regex patterns to restrict to specific domains (e.g. `^docs\\.example\\.com$`) |
| `excludeDomains` | No | - | Regex patterns to exclude specific domains |

### Examples

Basic crawl:
```
{"url": "https://docs.example.com"}
```

Guided crawl with instructions:
```
{"url": "https://api.example.com", "instructions": "Focus on authentication and rate limiting endpoints"}
```

Filtered crawl:
```
{"url": "https://example.com/blog", "selectPaths": ["/blog/posts/.*"], "excludePaths": ["/blog/drafts/.*"]}
```

## Notes

- **Timeout**: Default timeout is 180 seconds (3 minutes). Large crawls may need this increased.
- **Credits**: Crawl operations use Tavily credits. Configure environment variables to control costs (`TAVILY_LIMIT`, `TAVILY_MAX_DEPTH`, etc.).
- **Rate limiting**: The Tavily API may rate limit requests. For large crawls, consider running multiple smaller operations.
- **Robots.txt**: Respect the target website's robots.txt directives.
- **Output**: Results are returned as an array with URL, raw content, images, and favicon for each page.
- **Domain filtering**: Use `selectDomains`/`excludeDomains` to control which domains the crawler visits when following links beyond the initial URL.
- **Environment control**: Cost-related parameters (`maxDepth`, `maxBreadth`, `limit`, `extractDepth`, `allowExternal`, `includeImages`, `chunksPerSource`) are controlled via environment variables, not the LLM.
