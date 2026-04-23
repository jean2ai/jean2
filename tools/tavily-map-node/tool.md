---
name: tavily-map
script: script.mjs
runtime: node
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: "The root URL to begin mapping"
    instructions:
      type: string
      description: "Natural language instructions for the mapper to guide URL discovery"
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
      description: "Regex patterns to restrict mapping to specific domains or subdomains (e.g. ^docs\\.example\\.com$)"
    excludeDomains:
      type: array
      items:
        type: string
      description: "Regex patterns to exclude specific domains or subdomains from mapping"
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
  - TAVILY_MAX_DEPTH
  - TAVILY_MAX_BREADTH
  - TAVILY_LIMIT
  - TAVILY_ALLOW_EXTERNAL
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
- selectPaths (optional): Array of regex patterns to include only URLs matching specific paths (e.g., `/docs/.*`, `/blog/.*`)
- excludePaths (optional): Array of regex patterns to exclude URLs matching specific paths (e.g., `/admin/.*`, `/private/.*`)
- selectDomains (optional): Array of regex patterns to restrict mapping to specific domains or subdomains (e.g., `^docs\\.example\\.com$`)
- excludeDomains (optional): Array of regex patterns to exclude specific domains or subdomains from mapping

Notes:
- maxDepth, maxBreadth, limit, allowExternal are controlled via environment variables (TAVILY_MAX_DEPTH, TAVILY_MAX_BREADTH, TAVILY_LIMIT, TAVILY_ALLOW_EXTERNAL) by the operator
- Mapping is cheaper than crawling since no content extraction is performed
- Use selectPaths and excludePaths to filter results to relevant pages
