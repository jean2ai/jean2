# grep

Pure JavaScript file search tool using regular expressions. Cross-platform — no external system dependencies required.

## Requirements

- **Runtime**: `bun`
- **Dependencies**: `ignore` (for .gitignore support)

## Parameters

- `pattern` (required): The regex pattern to search for
- `path` (required): The file or directory to search in
- `include` (optional): File pattern to include (e.g., `*.ts`, `*.{ts,tsx}`)

## Output

Each match contains:
- `file`: Relative path from the search root
- `line`: Line number (1-indexed)
- `content`: Full line content (not just the matched substring)

If the output exceeds 50,000 characters, results are persisted to a temp file and a truncated set (first 50 matches) is returned with `_persisted: true`.

If the regex is invalid, an `error` field is included in the output.

## Features

- Respects `.gitignore` via the `ignore` package
- Skips binary files (by extension and null-byte detection)
- Skips common non-source directories (node_modules, .git, dist, build, etc.)
- Supports glob include filters with brace expansion (`*.{ts,tsx}`)
- Cross-platform temp directory via `os.tmpdir()`
