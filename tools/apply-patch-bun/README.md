# apply-patch

Server tool for applying unified diff patches to files atomically. Parses standard git diff format and applies changes to multiple files with rollback on failure. Handles file creation, modification, and deletion.

## Requirements

- **Runtime**: `bun`

## Parameters

- `patch` (required): The unified diff patch content to apply (standard git diff format)
