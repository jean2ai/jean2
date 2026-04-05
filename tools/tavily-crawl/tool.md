---
name: tavily-crawl
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: "The root URL to begin the crawl"
    instructions:
      type: string
      description: "Natural language instructions for the crawler to guide content discovery"
    maxDepth:
      type: number
      default: 1
      description: "Max depth of the crawl (1-5). How far from base URL the crawler can explore"
    maxBreadth:
      type: number
      default: 20
      description: "Max number of links to follow per level of the tree (1-500)"
    limit:
      type: number
      default: 50
      description: "Total number of links to process before stopping"
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
    extractDepth:
      type: string
      enum:
        - basic
        - advanced
      default: basic
      description: "Extraction depth: basic or advanced"
    format:
      type: string
      enum:
        - markdown
        - text
      default: markdown
      description: "Output format: markdown (default) or text"
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
| `maxDepth` | No | 1 | Crawl depth (1-5), how far from base URL to explore |
| `maxBreadth` | No | 20 | Links to follow per level (1-500) |
| `limit` | No | 50 | Total links to process before stopping |
| `selectPaths` | No | - | Regex patterns to include only matching URLs |
| `excludePaths` | No | - | Regex patterns to exclude matching URLs |
| `extractDepth` | No | basic | Extraction depth: `basic` or `advanced` |
| `format` | No | markdown | Output format: `markdown` or `text` |

### Examples

Basic crawl:
```
{"url": "https://docs.example.com", "maxDepth": 2, "limit": 20}
```

Guided crawl with instructions:
```
{"url": "https://api.example.com", "instructions": "Focus on authentication and rate limiting endpoints", "extractDepth": "advanced"}
```

Filtered crawl:
```
{"url": "https://example.com/blog", "selectPaths": ["/blog/posts/.*"], "excludePaths": ["/blog/drafts/.*"]}
```

## Notes

- **Timeout**: Default timeout is 180 seconds (3 minutes). Large crawls may need this increased.
- **Credits**: Crawl operations use Tavily credits. Be mindful of the `limit` parameter.
- **Rate limiting**: The Tavily API may rate limit requests. For large crawls, consider running multiple smaller operations.
- **Robots.txt**: Respect the target website's robots.txt directives.
- **Output**: Results are returned as an array with URL, raw content, images, and favicon for each page.
