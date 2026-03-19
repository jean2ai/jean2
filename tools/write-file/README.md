# write-file

Write content to a file, creating it if it doesn't exist or overwriting if it does. Use for creating new files only; prefer edit tool for modifications.

## Parameters

- `path` (required): Path to the file. Supports relative paths from workspace, absolute paths, or home paths.
- `content` (required): The content to write to the file

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "write-file",
  "parameters": {
    "path": "/workspace/new-file.ts",
    "content": "console.log('Hello, world!');"
  }
}
```
