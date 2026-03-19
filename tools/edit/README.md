# edit

Performs string replacements in files with fuzzy matching support. Strategies include: exact, line_start, line_end, partial, and multi_line matching.

## Parameters

- `path` (required): Absolute path to the file to edit
- `oldString` (required): The text to find and replace
- `newString` (required): The replacement text
- `strategy` (optional): Matching strategy to use: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "edit",
  "parameters": {
    "path": "/path/to/file.ts",
    "oldString": "const foo = 'bar';",
    "newString": "const foo = 'baz';",
    "strategy": "exact"
  }
}
```
