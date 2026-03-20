# grep

Server tool for searching file contents using regular expressions. Shells out to `ripgrep` (`rg`) and parses its `--json` output. Returns matches as file paths and line numbers with content.

## Requirements

- **Runtime**: `bun`
- **System**: `rg` (ripgrep) must be installed

## Parameters

- `pattern` (required): The regex pattern to search for
- `path` (required): The file or directory to search in
- `include` (optional): File pattern to include (e.g., `*.ts`, `*.{ts,tsx}`)
