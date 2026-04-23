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
    timeRange:
      type: string
      enum:
        - day
        - week
        - month
        - year
      description: "Filter results by publish date: day, week, month, or year"
    startDate:
      type: string
      description: "Return results after this date (YYYY-MM-DD format). Mutually exclusive with timeRange."
    endDate:
      type: string
      description: "Return results before this date (YYYY-MM-DD format). Mutually exclusive with timeRange."
    includeRawContent:
      type: boolean
      default: false
      description: "Include the cleaned HTML content of each result"
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
    country:
      type: string
      description: "Boost results from a specific country (full name e.g. 'united states'). Only with topic=general."
    exactMatch:
      type: boolean
      default: false
      description: "Only return results containing the exact quoted phrase(s) from the query"
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
  - TAVILY_SEARCH_DEPTH
  - TAVILY_MAX_RESULTS
  - TAVILY_INCLUDE_ANSWER
  - TAVILY_INCLUDE_IMAGES
  - TAVILY_INCLUDE_IMAGE_DESCRIPTIONS
  - TAVILY_CHUNKS_PER_SOURCE
hasSecurityCheck: false
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
- timeRange (optional): Filter by publish date - day, week, month, or year (mutually exclusive with startDate/endDate)
- startDate (optional): Return results after this date (YYYY-MM-DD format)
- endDate (optional): Return results before this date (YYYY-MM-DD format)
- includeRawContent (optional): Include cleaned HTML content of each result
- includeDomains (optional): List of domains to include (max 300)
- excludeDomains (optional): List of domains to exclude (max 150)
- country (optional): Boost results from a specific country (full name e.g. 'united states'). Only with topic=general.
- exactMatch (optional): Only return results containing exact quoted phrase(s) from the query

Notes:
- Tavily maintains a free tier with usage limits
- Default search uses basic depth (1 credit per query)