# webfetch

Server tool for fetching content from a URL and converting it to a readable format. Supports markdown (HTML converted via Turndown), plain text, and raw HTML output. Blocks private IPs and cloud metadata endpoints.

## Requirements

- **Runtime**: `bun`
- **Install**: `bun install` (requires `turndown` package)

## Parameters

- `url` (required): The URL to fetch content from (must start with `http://` or `https://`)
- `format` (optional): `markdown` (default) | `text` | `html`
- `timeout` (optional): Timeout in seconds (max 120)
