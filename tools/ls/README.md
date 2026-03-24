# ls

Server tool for listing directory contents with tree-formatted output. Recursively lists files up to a 100-entry limit. Automatically skips common directories (`node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv`, `coverage`, `cache`, `logs`, etc.) and environment files (`.env`, `.env.local`).

## Requirements

- **Runtime**: `bun`
- **Alternative**: `node >= 22` (with `--experimental-strip-types`)

## Parameters

- `path` (optional): The directory to list. Defaults to workspace root.
- `ignore` (optional): List of additional directory or file names to ignore.
- `showHidden` (optional): Whether to show hidden files (starting with `.`). Default false.

## Behavior

- Output is limited to 100 entries. When the limit is reached, the output is truncated and a message indicates the total count.
- Common noise directories are automatically filtered (see IGNORED_NAMES in script.ts).
- Directory existence and type are validated — returns an error for missing paths or non-directories.
