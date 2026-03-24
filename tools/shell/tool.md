---
name: shell
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    command:
      type: string
      description: "The shell command to execute"
    cwd:
      type: string
      description: "Working directory for the command. Defaults to the workspace directory. Use this instead of 'cd <directory> && <command>' patterns."
  required:
    - command
outputSchema:
  type: object
  properties:
    stdout:
      type: string
    stderr:
      type: string
    exitCode:
      type: number
timeout: 60000
requireApproval: false
dangerous: true
hasSecurityCheck: true
---

Execute a shell command in a persistent session.

This tool is for terminal operations (package managers, build tools, etc). DO NOT use it for file operations - use specialized tools instead.

When to use:
- Running package managers (npm, bun, pip)
- Build tools and compilers
- Process management
- Network operations (curl, etc)

When NOT to use (use these instead):
- File search: Use glob tool (NOT find or ls)
- Content search: Use grep tool (NOT grep command)
- Read files: Use read-file tool (NOT cat/head/tail)
- Edit files: Use edit tool (NOT sed/awk)
- Write files: Use write-file tool (NOT echo >)

Usage:
- The cwd parameter sets the working directory. Use this instead of 'cd <dir> && <command>' patterns.
- Commands timeout after 60 seconds by default.
- Quote file paths containing spaces with double quotes.

Examples:
- Good: cwd="/project" command="npm test"
- Bad: command="cd /project && npm test"
