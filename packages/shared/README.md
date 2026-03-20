# @jean2/shared

Shared types, WebSocket protocol definitions, and utilities for the Jean2 AI Agent monorepo. This package is the single source of truth for all type contracts between the server (`@jean2/server`) and client (`@jean2/client`).

## Installation

Workspace dependency — install via:

```bash
bun install
```

## Usage

```typescript
import type { Session, Message, ToolState, Part } from '@jean2/shared';
import type { ClientMessage, ServerMessage } from '@jean2/shared';
import { isTextPart, isToolPart } from '@jean2/shared';
```

## Module Reference

### `types/` — Domain Types

#### `session.ts`

| Type | Kind | Description |
|------|------|-------------|
| `SessionStatus` | Type alias | `'active' \| 'closed'` |
| `SubagentStatus` | Type alias | `'running' \| 'completed' \| 'error'` |
| `Session` | Interface | Full session record with workspace binding, parent/child relationships, token usage, compaction state, and optional subagent status |

#### `message.ts`

Message, part, and tool state types for the chat system.

**Tool State** (discriminated on `status`):

| Type | Description |
|------|-------------|
| `ToolStatePending` | Awaiting execution |
| `ToolStateRunning` | Currently executing (with optional `childSessionId` for task tool) |
| `ToolStateCompleted` | Finished successfully |
| `ToolStateError` | Failed with error message |
| `ToolStateInterrupted` | Stopped mid-execution (supports partial output and cascade) |

**Parts** (discriminated on `type`):

| Type | Description |
|------|-------------|
| `TextPart` | Text content |
| `ReasoningPart` | LLM reasoning/chain-of-thought |
| `ToolPart` | Tool invocation with full lifecycle state |
| `FilePart` | File attachment (data URL or path) |
| `ImagePart` | Image content |
| `StepPart` | LLM step boundary with token counts and finish reason |
| `CompactionPart` | Compaction summary replacing old messages |

**Messages** (discriminated on `role`):

| Type | Role | Description |
|------|------|-------------|
| `UserMessage` | `user` | User input |
| `AssistantMessage` | `assistant` | LLM response with model info, token usage, cost, and status (`streaming` \| `completed` \| `error`) |
| `SystemMessage` | `system` | System-generated |

**Combined types**: `MessageWithParts`, `QueuedMessage`, `PermissionRequestBlock`

**Type guards**: `isTextPart`, `isToolPart`, `isReasoningPart`, `isStepPart`, `isCompactionPart`, `isAssistantMessage`, `isUserMessage`

#### `tool.ts`

| Type | Kind | Description |
|------|------|-------------|
| `ToolRuntime` | Type alias | `'bun' \| 'node' \| 'python' \| 'bash' \| 'go' \| 'binary' \| 'powershell'` |
| `ToolDefinition` | Interface | Full tool schema with input/output schemas, runtime, timeout, security checks |
| `ToolExecutionContext` | Interface | Runtime context (workspace path, session ID) |
| `ToolExecution` | Interface | Execution record with timing and result |
| `ToolApprovalStatus` | Type alias | `'pending' \| 'approved' \| 'denied' \| 'timeout'` |
| `ToolApproval` | Interface | Approval request with session binding and subagent info |

#### `mcp.ts`

MCP (Model Context Protocol) server configuration types.

| Type | Kind | Description |
|------|------|-------------|
| `McpServerType` | Type alias | `'local' \| 'remote'` |
| `McpLocalServerConfig` | Interface | Local MCP server: command, env, timeout |
| `McpRemoteServerConfig` | Interface | Remote MCP server: URL, OAuth config, headers |
| `McpServerConfig` | Union | `McpLocalServerConfig \| McpRemoteServerConfig` |
| `McpConfig` | Interface | Top-level config: `servers` map keyed by name |
| `McpStatus` | Union | Discriminated on `status`: `connected`, `disabled`, `failed`, `needs_auth`, `needs_client_registration` |
| `McpServerInfo` | Interface | Server config + status + tool count |

#### `model.ts`

| Type | Kind | Description |
|------|------|-------------|
| `ModelTier` | Type alias | `'budget' \| 'standard' \| 'premium'` |
| `ModelDefinition` | Interface | Model ID, name, context window, pricing tier |
| `ProviderDefinition` | Interface | Provider ID, name, and available models |
| `ModelWithProvider` | Interface | `ModelDefinition` + provider metadata |
| `ModelsConfig` | Interface | Full config with providers, defaults |

#### `permission.ts`

| Type | Kind | Description |
|------|------|-------------|
| `PermissionType` | Type alias | `'tool' \| 'action'` |
| `PermissionKey` | Type alias | `string` |
| `SecurityCheckInput` | Interface | Input for security validation |
| `SecurityCheckResult` | Interface | Result: allowed/requiresApproval with permission details |
| `ToolPermission` | Interface | Persisted permission grant with revocation tracking |
| `PermissionRequest` | Interface | Active permission request payload |
| `PermissionResponse` | Interface | Permission decision with always-allow flag |

#### `preconfig.ts`

| Type | Kind | Description |
|------|------|-------------|
| `PreconfigMode` | Type alias | `'primary' \| 'subagent' \| 'both'` |
| `Preconfig` | Interface | Agent configuration: system prompt, tools, model, skills access, subagent capabilities |

#### `task.ts`

Types for the task/subagent spawning system.

| Type | Kind | Description |
|------|------|-------------|
| `TaskToolParams` | Interface | Parameters for invoking a subagent (description, prompt, type, optional resume) |
| `TaskToolResult` | Interface | Subagent result with task_id for resumption |
| `SubagentContext` | Interface | Runtime context passed to subagent execution |

#### `interrupt.ts`

| Type | Kind | Description |
|------|------|-------------|
| `InterruptReason` | Type alias | `'user_request' \| 'timeout' \| 'error' \| 'cascade'` |
| `InterruptState` | Interface | Session-level interrupt tracking |
| `SessionInterruptResult` | Interface | Interrupt result with cascade targets, interrupted tools, partial results |
| `ToolAbortContext` | Interface | Abort signal context for tools |

#### `visualization.ts`

10 visualization types for rich tool output rendering.

| Type | Discriminant | Description |
|------|--------------|-------------|
| `DiffVisualization` | `'diff'` | Single file diff with hunks, additions/deletions, match info |
| `DiffsVisualization` | `'diffs'` | Multiple diffs (e.g., multiedit tool) |
| `CodeVisualization` | `'code'` | Full file display with syntax highlighting, line counts, highlight ranges |
| `TableVisualization` | `'table'` | Tabular data with column definitions and pagination |
| `FileListVisualization` | `'file-list'` | File list with grouping, action types, and content previews |
| `MarkdownVisualization` | `'markdown'` | Rendered markdown with optional source URL |
| `ShellOutputVisualization` | `'shell-output'` | Command, stdout, stderr, exit code |
| `TodoListVisualization` | `'todo-list'` | Checklist with status and priority per item |
| `NoneVisualization` | `'none'` | Explicit no-content marker |
| `VisualizableToolOutput` | — | Tool output wrapper with optional `_visualization` field (stripped before LLM consumption) |

All visualizations share the base `ToolVisualization` interface (`type`, optional `title`, optional `collapsed`).

#### `skill.ts`

| Type | Kind | Description |
|------|------|-------------|
| `SkillInfo` | Interface | Parsed skill: name, description, location, content, user-invocable flag |
| `SkillFrontmatter` | Interface | Raw SKILL.md frontmatter fields |

#### `workspace.ts`

| Type | Kind | Description |
|------|------|-------------|
| `Workspace` | Interface | Workspace record: id, name, path, isVirtual flag |

#### `file.ts`

| Type | Kind | Description |
|------|------|-------------|
| `FileEntry` | Interface | File/directory entry with path and extension |
| `FileListResponse` | Interface | Browsing response with files and current path |
| `FileSearchResult` | Interface | Search results with query, total, and truncation flag |

#### `server.ts`

| Type | Kind | Description |
|------|------|-------------|
| `SavedServer` | Interface | Saved remote server connection (name, URL, token) |
| `QuickConnection` | Interface | Quick-access connection with workspace binding |

#### `prompt.ts`

| Type | Kind | Description |
|------|------|-------------|
| `PromptInfo` | Interface | Prompt template: name, description, content |

---

### `protocol/` — WebSocket Protocol

The client and server communicate over WebSocket using typed message unions.

#### Client → Server Messages (`ClientMessage`)

| Message Type | Description |
|-------------|-------------|
| `session.create` | Create a new session (optional workspace, preconfig, title) |
| `session.resume` | Resume an existing session |
| `chat.message` | Send a chat message |
| `session.close` | Close a session |
| `session.update` | Update session preconfig |
| `session.update_model` | Change model/provider for a session |
| `session.reopen` | Reopen a closed session |
| `session.delete` | Delete a session |
| `session.rename` | Rename a session |
| `session.compact` | Compact/summarize messages |
| `session.revert` | Revert session to a specific message |
| `session.fork` | Fork a session at a specific message |
| `session.interrupt` | Interrupt a running session |
| `tool.approval` | Respond to a tool approval request |
| `permission.response` | Respond to a permission request |
| `permission.list` | List granted permissions for a workspace |
| `permission.revoke` | Revoke a specific permission |
| `permission.revoke_all` | Revoke all permissions for a workspace |
| `queue.add` | Add a message to the send queue |
| `queue.remove` | Remove a message from the queue |

#### Server → Client Messages (`ServerMessage`)

| Message Type | Description |
|-------------|-------------|
| `session.created` | New session created |
| `session.resumed` | Session resumed with full history |
| `session.closed` | Session closed |
| `session.updated` | Session metadata updated |
| `session.reopened` | Session reopened |
| `session.deleted` | Session deleted |
| `session.renamed` | Session renamed |
| `session.state` | Full session state snapshot |
| `session.reverted` | Session reverted to a point |
| `session.forked` | Session forked |
| `session.interrupted` | Session interrupted with result |
| `message.created` | New message created |
| `message.updated` | Message status updated |
| `part.created` | New part added to a message |
| `part.updated` | Part state changed |
| `part.append` | Streaming text/reasoning delta |
| `chat.usage` | Token usage and cost update |
| `tool.approval_required` | Tool needs user approval |
| `permission.request` | Permission required for tool execution |
| `permission.granted` | Permission granted (with cache flag) |
| `permission.list` | List of granted permissions |
| `permission.revoked` | Permission revoked |
| `permission.all_revoked` | All permissions revoked |
| `subagent.started` | Subagent session spawned |
| `subagent.completed` | Subagent finished (with result or error) |
| `subagent.progress` | Subagent real-time progress |
| `compaction.complete` | Message compaction finished |
| `error` | Server error |
| `queue.list` | Current message queue |
| `queue.added` | Message added to queue |
| `queue.removed` | Message removed from queue |
| `queue.sending` | Queue message being sent |

---

### `utils/` — Utilities

#### `model-context.ts`

| Function | Signature | Description |
|----------|-----------|-------------|
| `getModelContextWindow` | `(modelId: string) => number` | Placeholder — returns `0`. Real context window data comes from the server's `models.json` config |
| `getContextWindowPercentage` | `(tokensUsed: number, modelId: string) => number` | Placeholder — returns `0`. Prefer server-side calculation |

---

## Architecture Notes

- **Source-only consumption** — The package is consumed directly from source (`"main": "./src/index.ts"`) without a build step.
- **Discriminated unions** — Most types use string discriminants for type-safe pattern matching. Use the provided type guards (`isTextPart`, `isToolPart`, etc.) for narrowing.
- **Visualization stripping** — The `_visualization` field on `VisualizableToolOutput` is stored in the database but filtered out before passing to the LLM to avoid token bloat.
- **Cascade interrupts** — Interrupting a session cascades to all child subagent sessions. `SessionInterruptResult.cascadedTo` tracks which sessions were affected.
