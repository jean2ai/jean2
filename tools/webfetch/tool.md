---
name: webfetch
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: "The URL to fetch content from (must start with http:// or https://)"
    format:
      type: string
      enum:
        - markdown
        - text
        - html
      default: markdown
      description: "Output format: markdown (default), text, or html"
    timeout:
      type: number
      description: "Optional timeout in seconds (max 120)"
  required:
    - url
outputSchema:
  type: object
  properties:
    content:
      type: string
    title:
      type: string
    contentType:
      type: string
    error:
      type: string
timeout: 120000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Fetch content from a URL and convert to readable format.

When to use:
- Retrieving documentation from web pages
- Fetching API documentation
- Reading web content for analysis

When NOT to use:
- If another tool offers better capabilities for the specific task

Usage:
- url (required): URL to fetch (must start with http:// or https://)
- format (optional): Output format - markdown (default), text, or html
- timeout (optional): Timeout in seconds (max 120)

Format options:
- markdown: HTML converted to markdown (best for reading)
- text: Plain text with HTML tags stripped
- html: Raw HTML content

Note: Results may be summarized for very large content.
