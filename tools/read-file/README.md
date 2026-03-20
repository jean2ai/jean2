# read-file

Server tool for reading files or listing directories. Returns line-numbered content with offset/limit pagination. Detects and refuses binary files. For directories, lists entries with trailing `/` for subdirectories.

## Requirements

- **Runtime**: `bun`

## Parameters

- `path` (required): The absolute path to the file or directory to read
- `offset` (optional): The line number to start reading from (1-indexed)
- `limit` (optional): The maximum number of lines to read (defaults to 2000)
