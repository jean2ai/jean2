# multiedit

Server tool for performing multiple string replacements in a single file atomically. All edits are applied in sequence — if any edit fails, none are applied (atomicity). Uses the same 5 matching strategies as the edit tool.

## Requirements

- **Runtime**: `bun`

## Parameters

- `path` (required): Absolute path to the file to edit
- `edits` (required): Array of edits to apply atomically, each containing:
  - `oldString` (required): The text to find and replace
  - `newString` (required): The replacement text
  - `strategy` (optional): `exact` | `line_start` | `line_end` | `partial` | `multi_line`
