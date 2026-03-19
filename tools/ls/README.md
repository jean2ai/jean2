# ls

List directory contents with tree formatting. Supports recursive listing, depth control, and hidden file display.

## Parameters

- `path` (optional): The directory to list. Defaults to workspace root.
- `recursive` (optional): Whether to list recursively (show tree). Default true.
- `depth` (optional): Maximum depth for tree. Default unlimited.
- `showHidden` (optional): Whether to show hidden files (starting with .). Default false.

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "ls",
  "parameters": {
    "path": "/workspace",
    "recursive": true,
    "depth": 3
  }
}
```
