# edit

Server tool for performing string replacements in files with fuzzy matching support. Tries 5 matching strategies in order: exact, line_start, line_end, partial (whitespace-tolerant), and multi_line. Fails if old string is not found or found multiple times.

## Requirements

- **Runtime**: `bun`

## Parameters

- `path` (required): Absolute path to the file to edit
- `oldString` (required): The text to find and replace
- `newString` (required): The replacement text
- `strategy` (optional): Matching strategy to use: `exact` | `line_start` | `line_end` | `partial` | `multi_line`
