# Tools

Tools give the agent the ability to interact with your filesystem, run commands, search the web, and more. They are TypeScript modules that implement a `ToolDefinition` and `execute` function.

## Available Tools

Jean2 ships with 24 tools, installable via `jean2 tools install`. Tools are **not managed by npm** — they download from a GitHub releases registry.

### File Tools

| Tool | Description |
|------|-------------|
| **read-file** | Read files or list directory contents |
| **write-file** | Create or overwrite files |
| **edit** | String replacements in existing files with fuzzy matching |
| **multiedit** | Multiple string replacements applied atomically |
| **apply-patch** | Apply unified diff patches to files |
| **glob** | Find files matching glob patterns |
| **grep** | Search file contents with regex |
| **ls** | List directory contents with tree formatting |

### Shell

| Tool | Description |
|------|-------------|
| **shell** | Execute shell commands in persistent sessions |

The shell tool enforces safety: dangerous commands (`rm`, `sudo`, `curl`), filesystem modifications, and operations outside the workspace require explicit permission.

### Web

| Tool | Description |
|------|-------------|
| **webfetch** | Fetch and convert web pages to readable text |
| **file-to-markdown** | Convert files (PDF, Office, LibreOffice, ZIP) to Markdown |

### Browser

Requires the **Jean2Browser** extension. Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/jean2browser/jpahdfmmfmmnacapmkchljmcijoedcpj), then connect it to your Jean2 server:

| Tool | Description |
|------|-------------|
| **browser-navigate** | Navigate the browser to a URL |
| **browser-read-active-tab** | Read the current tab's title, URL, and visible text |
| **browser-tab-manage** | List, create, close, and switch between browser tabs |
| **browser-discover-elements** | Find interactive elements on a page |
| **browser-dom-action** | Click, type, and interact with page elements |
| **browser-screenshot** | Capture screenshots of the active tab |

### Interaction

| Tool | Description |
|------|-------------|
| **question** | Ask the user structured questions (select, multi-select, text, confirm) |
| **todoread** | Read the current task list |
| **todowrite** | Update the task list |

### Tavily Search

Requires a Tavily API key:

| Tool | Description |
|------|-------------|
| **tavily-search** | Web search with topic and time filters |
| **tavily-crawl** | Deep crawl a URL and its subpages |
| **tavily-extract** | Extract clean content from URLs |
| **tavily-map** | Map/discover URLs from a domain |

## Installing Tools

```bash
# Interactive — browse and pick tools
jean2 tools install

# Install specific tools
jean2 tools install shell grep read-file

# Install all tools
jean2 tools install --all

# Install only recommended tools
jean2 tools install --recommended

# Force reinstall even if already installed
jean2 tools install shell --force
```

```bash
# List available tools
jean2 tools list

# List only installed tools
jean2 tools list --installed

# Check for updates
jean2 tools outdated

# Update installed tools
jean2 tools update

# Remove tools
jean2 tools remove shell grep
```

Tools are stored in `~/.jean2/tools/` (or your custom `JEAN2_TOOLS_PATH`).

## The Ask Protocol

Every tool gets a `ToolContext` with an `ask()` method. This is how tools request permissions, ask questions, or get user input. The client handles the UI — the tool just awaits a typed response.

### Permission asks

Tool calls that modify files, run commands, or access the network go through the permission system. The user can:

- **Approve once** — Allow this specific call
- **Approve always** — Auto-approve future calls with the same parameters
- **Deny** — Block this call

The permission state persists per workspace and per tool.

### Question asks

Tools can ask the user structured questions through `ctx.ask()`:

```typescript
const answer = await ctx.ask({
  type: 'question',
  question: {
    type: 'single_select',
    question: 'Which file should I use?',
    options: [
      { label: 'config.ts', value: 'config' },
      { label: 'settings.ts', value: 'settings' },
    ],
  },
});
```

The client renders the appropriate form (radio buttons, checkboxes, text input, etc.) and returns the answer.

## Writing a Custom Tool

A tool is a directory with two files:

```
my-tool/
├── tool.ts          # Tool definition + execute function
├── package.json     # Dependencies (can be empty for simple tools)
└── VERSION          # Semantic version (e.g., "1.0.0")
```

### `tool.ts`

```typescript
import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';

interface Input {
  message: string;
}

export const definition: ToolDefinition = {
  name: 'my-tool',
  description: 'Does something useful.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A message to process',
      },
    },
    required: ['message'],
  },
};

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    // Do work here. ctx has:
    //   ctx.fs    — filesystem access (scoped to workspace)
    //   ctx.ask() — permission and question requests
    //   ctx.env   — safe environment variables

    const result = `Processed: ${input.message}`;
    return { success: true, result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
```

### `package.json`

```json
{
  "name": "my-tool",
  "version": "1.0.0",
  "dependencies": {}
}
```

### Installing custom tools

Place the tool directory in `~/.jean2/tools/` and restart the server. Tools are discovered automatically by scanning for `tool.ts` files.

### Testing tools

Tools can be tested with the virtual filesystem test utilities used by the built-in tools. See `tools/test-utils.ts` for `VirtualFS`, `createMockContext`, and `WORKSPACE`.
