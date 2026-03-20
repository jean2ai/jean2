# shell

Server tool for executing arbitrary shell commands via `sh -c`. Supports configurable working directory. Returns stdout, stderr, and exit code. Subject to security checks that block dangerous commands and path traversal.

## Requirements

- **Runtime**: `bun`

## Parameters

- `command` (required): The shell command to execute
- `cwd` (optional): Working directory for the command. Defaults to the workspace directory.
