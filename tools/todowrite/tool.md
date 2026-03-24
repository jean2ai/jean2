---
name: todowrite
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    todos:
      type: array
      items:
        type: object
        properties:
          content:
            type: string
            description: "Brief description of the task"
          status:
            type: string
            enum:
              - pending
              - in_progress
              - completed
              - cancelled
            description: "Current status of the task"
          priority:
            type: string
            enum:
              - high
              - medium
              - low
            description: "Priority level (default: medium)"
        required:
          - content
          - status
      description: "The updated todo list (replaces existing list)"
  required:
    - todos
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    count:
      type: integer
timeout: 5000
requireApproval: false
dangerous: false
hasSecurityCheck: false
---

Update the task list for the current session. Use this to track progress on complex multi-step tasks. Set status to 'in_progress' for the task you're currently working on, 'completed' when done.
