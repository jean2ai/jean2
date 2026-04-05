---
name: tavily-search
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: "The search query to execute"
    topic:
      type: string
      enum:
        - general
        - news
        - finance
      default: general
      description: "Search category: general, news, or finance"
    searchDepth:
      type: string
      enum:
        - basic
        - advanced
        - fast
        - ultra-fast
      default: basic
      description: "Search depth: basic (balanced), advanced (highest relevance, 2 credits), fast, or ultra-fast"
    maxResults:
      type: number
      default: 5
      description: "Maximum number of results (0-20)"
    timeRange:
      type: string
      enum:
        - day
        - week
        - month
        - year
      description: "Filter results by publish date: day, week, month, or year"
    includeAnswer:
      type: boolean
      default: false
      description: "Include an LLM-generated answer to the query"
    includeRawContent:
      type: boolean
      default: false
      description: "Include the cleaned HTML content of each result"
    includeImages:
      type: boolean
      default: false
      description: "Include images in the response"
    includeDomains:
      type: array
      items:
        type: string
      description: "List of domains to include (max 300)"
    excludeDomains:
      type: array
      items:
        type: string
      description: "List of domains to exclude (max 150)"
  required:
    - query
outputSchema:
  type: object
  properties:
    answer:
      type: string
    results:
      type: array
      items:
        type: object
        properties:
          title:
            type: string
          url:
            type: string
          content:
            type: string
          score:
            type: number
    error:
      type: string
timeout: 60000
requireApproval: false
dangerous: false
env:
  - TAVILY_API_KEY
hasSecurityCheck: true
---

Perform web searches using Tavily's search API.

When to use:
- Searching the web for current information
- Finding relevant articles, documentation, or resources
- Research tasks requiring up-to-date web content
- When you need categorized results (general, news, or finance)

When NOT to use:
- For simple URL content fetching (use webfetch instead)
- For very short, fact-based queries that can be answered from training data
- When the query is ambiguous and requires clarification first

Usage:
- query (required): The search query to execute
- topic (optional): Search category - general (default), news, or finance
- searchDepth (optional): basic (balanced, default), advanced (highest relevance, uses 2 credits), fast, or ultra-fast
- maxResults (optional): Number of results to return (0-20, default 5)
- timeRange (optional): Filter by publish date - day, week, month, or year
- includeAnswer (optional): Include an LLM-generated answer to the query
- includeRawContent (optional): Include cleaned HTML content of each result
- includeImages (optional): Include images in the response
- includeDomains (optional): List of domains to include (max 300)
- excludeDomains (optional): List of domains to exclude (max 150)

Notes:
- Basic search uses 1 credit per query
- Advanced search uses 2 credits per query
- News and finance topics may have different pricing
- Tavily maintains a free tier with usage limits
