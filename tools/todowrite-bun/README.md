# todowrite

Server tool for writing/replacing the entire task list for the current session. Deletes all existing todos for the session and inserts the new list. Validates content and status fields. Data is stored in a local SQLite database.

## Requirements

- **Runtime**: `bun`

## Parameters

- `todos` (required): The updated todo list (replaces existing list), each containing:
  - `content` (required): Brief description of the task
  - `status` (required): `pending` | `in_progress` | `completed` | `cancelled`
  - `priority` (optional): `high` | `medium` | `low` (default: medium)
