# grep

Search for text patterns in files using regular expressions. Returns file paths and line numbers with matching content.

## Parameters

- `pattern` (required): The regex pattern to search for
- `path` (required): The file or directory to search in
- `include` (optional): File pattern to include (e.g., `*.ts`, `*.{ts,tsx}`)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "grep",
  "parameters": {
    "pattern": "function\\s+\\w+",
    "path": "/workspace",
    "include": "*.ts"
  }
}
```
