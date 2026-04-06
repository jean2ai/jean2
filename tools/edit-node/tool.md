---
name: edit
script: script.mjs
runtime: node
securityScript: security.mjs
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "Absolute path to the file to edit"
    oldString:
      type: string
      description: "The text to find and replace"
    newString:
      type: string
      description: "The replacement text"
    strategy:
      type: string
      description: "Matching strategy to use: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'"
      enum:
        - exact
        - line_start
        - line_end
        - partial
        - multi_line
  required:
    - path
    - oldString
    - newString
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    error:
      type: string
timeout: 180000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Performs string replacements in files with fuzzy matching support.

This tool finds and replaces text in files using multiple matching strategies. When an exact match is not found, it tries fuzzy strategies automatically.

Parameters:
- path (required): Absolute path to the file to edit
- oldString (required): The text to find and replace. Preserve exact indentation from read-file output (the part after `<line>: `).
- newString (required): The replacement text
- strategy (optional): Force a specific matching strategy

Matching Strategies (tried in order if no strategy specified):
1. exact: Exact string match
2. line_start: Match at the start of a line
3. line_end: Match at the end of a line
4. partial: Partial/substring match within lines (ignores whitespace differences)
5. multi_line: Multi-line pattern matching

Important:
- You MUST use read-file at least once before editing a file
- The edit will FAIL if oldString is not found or found multiple times
- For multiple edits to the same file, use multiedit tool instead
