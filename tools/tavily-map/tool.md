---
name: tavily-map
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: "The root URL to begin mapping"
    instructions:
      type: string
      description: "Natural language instructions for the mapper to guide URL discovery"
    maxDepth:
      type: number
      default: 1
      description: "Max depth of the mapping (1-5). How far from base URL the mapper can explore"
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

Discover and map URLs on a website without extracting content.

When to use:
- Discovering all URLs on a website or web application
- Building site maps for documentation or analysis
- Finding pages matching specific patterns (using selectPaths)
- Surveying the structure of a website before deeper exploration
- When you only need URLs, not the actual page content

When NOT to use:
- If you need the actual content from pages (use tavily-crawl or tavily-extract instead)
- For single page lookups where webfetch would be more efficient

Usage:

- url (required): The root URL to begin mapping. Should include the protocol (https://)
- instructions (optional): Natural language instructions to guide the mapper (e.g., "find all blog posts" or "focus on documentation pages")
- maxDepth (optional): How far from the base URL the mapper can explore. Range 1-5, default 1
- maxBreadth (optional): Max number of links to follow per level. Range 1-500, default 20
- limit (optional): Total number of links to process before stopping. Default 50
- selectPaths (optional): Array of regex patterns to include only URLs matching specific paths (e.g., `/docs/.*`, `/blog/.*`)
- excludePaths (optional): Array of regex patterns to exclude URLs matching specific paths (e.g., `/admin/.*`, `/private/.*`)

Output:
- baseUrl: The original URL that was mapped
- results: Array of discovered URLs

Notes:
- Mapping is cheaper than crawling since no content extraction is performed
- Use selectPaths and excludePaths to filter results to relevant pages
- For very large sites, increase maxDepth and limit carefully as it affects processing time
