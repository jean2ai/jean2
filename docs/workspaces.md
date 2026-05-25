# Workspaces & Sessions

## Workspaces

A workspace is a directory the agent operates within. There are two types:

- **Physical workspace** — A real directory you choose on your machine. The agent can read and write files directly.
- **Virtual workspace** — An isolated empty directory auto-generated in `~/.jean2/workspaces/<uuid>/`. Good for sandboxed experiments or when you don't want the agent touching real files.

### Creating a workspace

1. Open the client
2. Click **New Workspace** in the sidebar
3. Choose "Physical" and pick a directory, or "Virtual" for an isolated sandbox
4. Optionally add an `AGENTS.md` file in that directory for project-specific instructions

### Workspace instructions

Create an `AGENTS.md` file in the workspace root:

```markdown
# Project Rules
- This is a Next.js project
- Use the App Router, not Pages Router
- All components go in src/components/
```

The agent loads this automatically when you switch to the workspace.

### Global instructions

The file `~/.jean2/AGENTS.md` contains instructions that apply to **all** workspaces. These are loaded first, then workspace-specific ones are appended.

### Permissions

Each workspace has its own permission state. When you approve a tool "always" in one workspace, it doesn't affect others.

## Sessions

A session is a single conversation thread within a workspace. Each session is an independent agent run with its own message history, model selection, and state.

### Starting a session

1. Select a workspace
2. Pick a **preconfig** (system prompt template) — or start from scratch
3. Select a **model** and optionally a reasoning variant
4. Start chatting

### Session lifecycle

- **Active** — The agent is processing messages
- **Idle** — Waiting for your next message
- **Interrupted** — You cancelled the current generation

### Preconfigs

Preconfigs are saved combinations of system prompts, model selections, and settings. They're like templates for sessions. Jean2 ships with defaults and you can create your own.

## Session Controls

### Fork

Branch a session at any message. Creates a new session with the same history up to that point, then diverges. Useful for exploring different approaches to a problem.

How it works:
1. Click the fork icon next to any message
2. A new session is created with the history up to that point
3. Continue the conversation in the new direction

### Revert

Undo to any previous point in a conversation. Later messages are discarded.

### Interrupt

Cancel a running generation. Interrupts cascade to subagents — if a subagent is running, interrupting the parent also interrupts the child.

### Compact

When a conversation approaches the model's context window limit, Jean2 automatically compacts (summarizes) older messages while preserving recent context and tool results. This is transparent — you don't need to do anything. See [Configuration](./configuration.md#compaction) for tuning options.

### Queue

Send a message while the agent is still processing. The message is queued and delivered when the agent finishes its current step.

## Subagents

The agent can spawn subagents for complex, multi-step tasks. Subagents:

- Run in **isolated sessions** (separate message history)
- **Inherit** the parent's workspace context
- Are limited to **2 levels of depth** (subagent → sub-subagent)
- Support **cascading interrupts** (interrupt parent → interrupt children)

Subagents are automatic — the agent decides when to spawn them based on the complexity of the task.

## Terminal Sessions

The client provides full PTY terminal sessions. The agent can also run commands in these terminals via the `shell` tool.

- **Multi-tab** — Run multiple terminals side by side
- **Persistent** — Terminals survive across chat sessions
- **Visualized** — Terminal output appears as rendered blocks in chat

## Data Storage

Sessions, messages, and permissions are stored in SQLite at `~/.jean2/data/agent.db` (or your custom `JEAN2_DATABASE_PATH`). Workspace data (files, project structure) remains in the workspace directory.
