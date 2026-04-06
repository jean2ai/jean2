---
name: todoread
script: script.mjs
runtime: node
inputSchema:
  type: object
  properties: {}
outputSchema:
  type: object
  properties:
    todos:
      type: array
      items:
        type: object
        properties:
          content:
            type: string
          status:
            type: string
          priority:
            type: string
timeout: 5000
requireApproval: false
dangerous: false
hasSecurityCheck: false
env:
  - TODOS_DB_PATH
---

Read the current task list for the session. Use this to check your progress on multi-step tasks.
