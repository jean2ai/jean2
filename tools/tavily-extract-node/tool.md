---
name: tavily-extract
script: script.mjs
runtime: node
inputSchema:
  type: object
  properties:
    urls:
      type: array
      items:
        type: string
      description: "List of URLs to extract content from (max 20)"
    query:
      type: string
      description: "User intent for reranking extracted content chunks"
  required:
    - urls
outputSchema:
  type: object
  properties:
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
    failedResults:
      type: array
      items:
        type: object
        properties:
          url:
            type: string
          error:
            type: string
    error:
      type: string
timeout: 60000
requireApproval: false
dangerous: false
env:
  - TAVILY_API_KEY
  - TAVILY_EXTRACT_DEPTH
  - TAVILY_INCLUDE_IMAGES
  - TAVILY_CHUNKS_PER_SOURCE
  - TAVILY_FORMAT
hasSecurityCheck: false
---

Extract clean content from a list of URLs using the Tavily search API.

## When to Use

- Extracting clean, readable content from multiple web pages
- Getting well-formatted markdown or text from web articles
- Batch fetching content from multiple URLs with automatic reranking
- When you need content organized by relevance to a query

## When NOT to Use

- If you just need to fetch raw HTML from a single URL (use `webfetch` instead)
- If you need to scrape dynamic content that requires JavaScript rendering

## Usage

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | string[] | Yes | - | List of URLs to extract content from (max 20) |
| `query` | string | No | - | User intent for reranking extracted content chunks |

**Output:**

- `results`: Array of successfully extracted URLs with `rawContent`, optionally `images` and `favicon`
- `failedResults`: Array of URLs that failed to extract with error messages
- `error`: Top-level error message if the entire operation failed

## Credits and Batching

- Every 5 successfully extracted URLs costs 1 credit (basic) or 2 credits (advanced)
- Batches are processed in groups of 5 URLs
- Failed URLs do not count toward credit usage
- Plan your queries efficiently to minimize API calls

## Example

```json
{
  "urls": [
    "https://example.com/article",
    "https://example.org/docs"
  ],
  "query": "user wants to understand the main topic"
}
```
