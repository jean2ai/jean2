# glob

Find files matching glob patterns. Returns matching file paths sorted by modification time. Supports patterns like `**/*.ts`, `src/**/*.tsx`, etc.

## Parameters

- `pattern` (required): The glob pattern to match
- `path` (optional): The directory to search in. Defaults to workspace root.

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "glob",
  "parameters": {
    "pattern": "**/*.ts",
    "path": "/workspace"
  }
}
```
