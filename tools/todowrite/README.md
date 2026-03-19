# todowrite

Update the task list for the current session. Track progress on complex multi-step tasks with status (pending, in_progress, completed, cancelled) and priority levels.

## Parameters

- `todos` (required): The updated todo list (replaces existing list), each containing:
  - `content` (required): Brief description of the task
  - `status` (required): Current status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  - `priority` (optional): Priority level: 'high' | 'medium' | 'low' (default: medium)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "todowrite",
  "parameters": {
    "todos": [
      { "content": "Complete the feature", "status": "in_progress", "priority": "high" },
      { "content": "Write tests", "status": "pending", "priority": "medium" }
    ]
  }
}
```
