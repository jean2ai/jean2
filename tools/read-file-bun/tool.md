---
name: read-file
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "The absolute path to the file or directory to read"
    offset:
      type: number
      description: "The line number to start reading from (1-indexed)"
    limit:
      type: number
      description: "The maximum number of lines to read (defaults to 2000)"
  required:
    - path
outputSchema:
  type: object
  properties:
    content:
      type: string
    error:
      type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Read a file or directory from the filesystem. If the path does not exist, an error is returned.

Usage:
- The path parameter should be an absolute path.
- By default, returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files.
- If unsure of the file path, use the glob tool to look up filenames.

Output format:
- File contents are prefixed with line numbers as `<line>: <content>`
- For directories, entries are listed one per line with trailing `/` for subdirectories
- Lines longer than 2000 characters are truncated

Best practices:
- Call this tool in parallel when reading multiple files
- Avoid tiny repeated slices. If you need more context, read a larger window.
- This tool can read image files and PDFs as file attachments.
