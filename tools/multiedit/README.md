# multiedit

Performs multiple string replacements in a single file atomically. All edits are applied in sequence - either all succeed or none are applied.

## Parameters

- `path` (required): Absolute path to the file to edit
- `edits` (required): Array of edits to apply atomically, each containing:
  - `oldString` (required): The text to find and replace
  - `newString` (required): The replacement text
  - `strategy` (optional): Matching strategy: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "multiedit",
  "parameters": {
    "path": "/workspace/src/main.ts",
    "edits": [
      { "oldString": "const a = 1;", "newString": "const a = 2;" },
      { "oldString": "const b = 3;", "newString": "const b = 4;" }
    ]
  }
}
```
