# webfetch

Fetch content from a URL and convert to readable format (markdown, text, or html). For retrieving documentation and web content.

## Parameters

- `url` (required): The URL to fetch content from (must start with http:// or https://)
- `format` (optional): Output format: 'markdown' (default), 'text', or 'html'
- `timeout` (optional): Timeout in seconds (max 120)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "webfetch",
  "parameters": {
    "url": "https://example.com/docs",
    "format": "markdown",
    "timeout": 30
  }
}
```
