# shell

Execute shell commands in a persistent session. For package managers, build tools, and terminal operations.

## Parameters

- `command` (required): The shell command to execute
- `cwd` (optional): Working directory for the command. Defaults to the workspace directory.

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "shell",
  "parameters": {
    "command": "bun run build",
    "cwd": "/workspace"
  }
}
```
