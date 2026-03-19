# read-file

Read files or directories from the filesystem. Supports offset, limit, and line-numbered output. Can also read images and PDFs.

## Parameters

- `path` (required): The absolute path to the file or directory to read
- `offset` (optional): The line number to start reading from (1-indexed)
- `limit` (optional): The maximum number of lines to read (defaults to 2000)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "read-file",
  "parameters": {
    "path": "/workspace/src/main.ts",
    "offset": 1,
    "limit": 100
  }
}
```
