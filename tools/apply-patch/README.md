# apply-patch

Apply unified diff patches to files atomically. Parses standard unified diff format (git diff output) and applies changes to multiple files. Handles file creation, modification, and deletion.

## Parameters

- `patch` (required): The unified diff patch content to apply (standard git diff format)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "apply-patch",
  "parameters": {
    "patch": "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old line\n+new line"
  }
}
```
