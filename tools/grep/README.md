# grep

Server tool for searching file contents using regular expressions. Shells out to `ripgrep` (`rg`) and parses its `--json` output. Returns matches as file paths and line numbers with content.

## Requirements

- **Runtime**: `bun`
- **System**: `rg` (ripgrep) must be installed

## Parameters

- `pattern` (required): The regex pattern to search for
- `path` (required): The file or directory to search in
- `include` (optional): File pattern to include (e.g., `*.ts`, `*.{ts,tsx}`)

## Output

Each match contains:
- `file`: Absolute path to the file
- `line`: Line number (1-indexed)
- `content`: Full line content (not just the matched substring)

If the output exceeds 50,000 characters, results are persisted to a temp file and a truncated set (first 50 matches) is returned with `_persisted: true`.

If ripgrep encounters an error (invalid regex, permission denied, etc.), an `error` field is included in the output.
