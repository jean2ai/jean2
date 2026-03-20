# ls

Server tool for listing directory contents with tree-formatted output. Supports recursive listing, depth limiting, and hidden file toggling. Automatically skips common directories (`node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`).

## Requirements

- **Runtime**: `bun`
- **Alternative**: `node >= 22` (with `--experimental-strip-types`)

## Parameters

- `path` (optional): The directory to list. Defaults to workspace root.
- `recursive` (optional): Whether to list recursively (show tree). Default true.
- `depth` (optional): Maximum depth for tree. Default unlimited.
- `showHidden` (optional): Whether to show hidden files (starting with `.`). Default false.
