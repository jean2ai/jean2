---
name: apply-patch
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    patch:
      type: string
      description: "The unified diff patch content to apply (standard git diff format)"
  required:
    - patch
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    appliedFiles:
      type: array
      items:
        type: string
      description: "List of files that were modified"
    createdFiles:
      type: array
      items:
        type: string
      description: "List of files that were created"
    deletedFiles:
      type: array
      items:
        type: string
      description: "List of files that were deleted"
    error:
      type: string
timeout: 60000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Apply unified diff patches to files atomically.

Parses standard unified diff format (git diff output) and applies changes to multiple files. Handles file creation, modification, and deletion.

When to use:
- Applying patches from external sources
- Batch file modifications from diff output

Parameters:
- patch (required): The unified diff patch content

Patch format example:
```
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-old line
+new line
```

Returns lists of applied, created, and deleted files.
