---
name: multiedit
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "Absolute path to the file to edit"
    edits:
      type: array
      description: "Array of edits to apply atomically"
      items:
        type: object
        properties:
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
          - oldString
          - newString
  required:
    - path
    - edits
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    error:
      type: string
    results:
      type: array
      description: "Array of match information for each edit"
      items:
        type: object
        properties:
          match:
            type: boolean
          matchType:
            type: string
          replacements:
            type: number
timeout: 60000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Performs multiple string replacements in a single file atomically.

All edits are applied in sequence - either all succeed or none are applied. Use this instead of multiple edit calls for efficiency and atomicity.

**Post-edit Diagnostics:**
When the `jean2-lsp` service is running and the file is a supported language, the tool automatically fetches fresh diagnostics after successful edits. Supported file types: TypeScript (.ts, .tsx, .mts, .cts), JavaScript (.js, .jsx, .mjs, .cjs), and PHP (.php, .phtml).

Parameters:
- path (required): Absolute path to the file to edit
- edits (required): Array of edit objects, each containing:
  - oldString (required): The text to find and replace
  - newString (required): The replacement text
  - strategy (optional): Force a specific matching strategy

Matching Strategies (same as edit tool):
1. exact, 2. line_start, 3. line_end, 4. partial, 5. multi_line

Important:
- Edits are applied in order - earlier edits may affect text that later edits try to find
- Plan edits carefully to avoid conflicts between sequential operations
- If any edit fails, none are applied (file remains unchanged)
