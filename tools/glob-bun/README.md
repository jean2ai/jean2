# glob

Server tool for finding files matching glob patterns. Implements custom glob-to-regex conversion and recursive directory walker. Supports `*`, `**`, and `?` wildcards. Automatically skips `node_modules`.

## Requirements

- **Runtime**: `bun`
- **Alternative**: `node >= 22` (with `--experimental-strip-types`)

## Parameters

- `pattern` (required): The glob pattern to match
- `path` (optional): The directory to search in. Defaults to workspace root.
