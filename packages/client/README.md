# Jean2 Client

Cross-platform frontend for the Jean2 AI Agent. Connects to a Jean2 server over WebSocket and REST API for real-time AI chat sessions with tool execution, multi-workspace support, and multi-server management.

Three deployment targets:

- **Tauri Desktop** — Native macOS and Windows application with multi-window support
- **Tauri iOS** — Native iPhone application
- **Web CLI** — Run locally via `npx @jean2/client`

## Features

- Streaming chat with real-time message updates and token usage display
- Multi-model and multi-provider selection (budget/standard/premium tiers)
- Session management — create, close, reopen, rename, fork, compact, and revert
- Multi-server and multi-workspace support with quick switching
- Tool permission approval flow with grant scope options (once, session, workspace, always)
- File tree browser and file path autocomplete
- MCP (Model Context Protocol) server management
- Queued messages when a session is busy streaming
- Built-in remote terminal with multi-tab support and session reconnection
- Offline detection with exponential backoff auto-reconnect
- Dark and light themes (persists per platform)
- Responsive layout — works on desktop and mobile viewports
- Two view modes — Default (session list) and Overview (multi-workspace dashboard with Quick Switcher)

## Prerequisites

- [Bun](https://bun.sh/)
- For Tauri desktop builds: [Rust](https://www.rust-lang.org/tools/install) and Xcode Command Line Tools (`xcode-select --install`) (macOS) or Visual Studio Build Tools (Windows)
- For iOS builds: Xcode, Apple Developer account — see [README-ios.md](README-ios.md)

## Development

```bash
# Install dependencies (from repo root)
bun install

# Start Vite dev server (port 5173, proxies to server on port 3000)
bun run dev
```

The Vite dev server proxies `/api` and `/ws` to `http://localhost:3000`.

### Tauri Desktop (Live Reload)

```bash
# Opens native window with hot module replacement
bun run tauri:dev
```

### Tauri iOS (Live Reload)

```bash
bun run tauri:ios:dev
```

## Building

### Web

```bash
bun run build
# Output: dist/
```

### Tauri Desktop

```bash
# macOS (Apple Silicon)
bun run tauri:build:macos

# Generic (all targets)
bun run tauri:build
```

### macOS Gatekeeper (Unsigned Builds)

Apps downloaded from GitHub releases are not code-signed. macOS will block opening them by default. Remove the quarantine attribute:

```bash
xattr -cr /Applications/Jean2.app
```

### Tauri Windows

```bash
# Windows (x64)
bun run tauri:build:windows
```

### Tauri iOS

See [README-ios.md](README-ios.md) for full build and deployment instructions.

### CLI / npx

```bash
bun run build:npx
# Output: dist/cli.mjs (bundled Node.js server)
```

## Running via npx

```bash
npx @jean2/client
# Opens browser to http://localhost:3774

# Custom port
npx @jean2/client --port 8080
```

The CLI bundles the built web assets and serves them with a static Node.js HTTP server.

## Project Structure

```
packages/client/
  src/
    App.tsx              Root component, WebSocket + REST state management
    main.tsx             Entry point, ThemeProvider wrapper
    cli.ts               npx CLI — static file server
    index.css            Tailwind v4, theme tokens, responsive utilities
    components/
      chat/              ChatView, MessageBubble, MessageInput, ToolCall, etc.
      layout/            AppSidebar, QuickSwitcher, WorkspaceSwitcher, FilesPanel
      modals/            SettingsDialog, MCPManagementDialog, AddServerDialog
      visualizations/    CodeBlock, DiffViewer, TerminalOutput, TodoList, etc.
      shared/            MarkdownRenderer, ThemeToggle, EmptyState, OfflineState
      files/             FileTree, FileTreeNode, FileAutocomplete
      providers/         ThemeProvider
      ui/                shadcn/ui primitives (button, dialog, sidebar, etc.)
    contexts/
      ServerContext.tsx   Multi-server state, quick connections
    hooks/
      useApi.ts          Authenticated fetch helper
      useFileSearch.ts   File search utility
      useLocalStorage.ts LocalStorage hook
      use-mobile.ts      Mobile viewport detection
    config/
      auth.ts            Token validation, URL normalization
      servers.ts         Server CRUD in localStorage
    lib/
      utils.ts           cn() and Tailwind merge
      storage.ts         Platform-agnostic storage (Tauri Store / localStorage)
      path.ts            Path utilities
    utils/
      diff.ts            Diff parsing utilities
  src-tauri/
    tauri.conf.json      Tauri configuration
    src/
      lib.rs             Platform gate (desktop vs mobile)
      desktop.rs         Desktop entry — multi-window, plugins
      mobile.rs          iOS entry — plugins only
  components.json        shadcn/ui configuration (radix-nova style)
  vite.config.ts         Vite — React, Tailwind, path aliases, dev proxy
  package.npm.json       Minimal manifest for npm publish (CLI mode)
  VERSION                Client version
```

## Technology Stack

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| Framework    | React 19                                    |
| Build        | Vite 6, TypeScript                          |
| Styling      | Tailwind CSS v4, shadcn/ui, Radix UI        |
| Fonts        | Geist Variable                              |
| Icons        | Lucide React                                |
| Desktop      | Tauri 2 (Rust) — macOS, Windows              |
| Mobile       | Tauri 2 iOS                                 |
| Markdown     | react-markdown + remark-gfm                 |
| Code blocks  | prism-react-renderer                        |
| Storage      | @tauri-apps/plugin-store / localStorage     |
| CLI          | esbuild bundle, Node.js http module         |

## Architecture

The client connects to a Jean2 server via WebSocket (`ws://host:port/ws?token=...`) for real-time events and REST (`http://host:port/api`) for initial data loading. Authentication is optional — when the server has `JEAN2_AUTH_TOKEN` set, all requests require the bearer token. When not set, all requests pass through without authentication.

**WebSocket protocol** handles session CRUD, message streaming (including delta-based text append), part creation/updates, ask requests (permissions, questions, forms, client capabilities), permission responses, queue management, usage tracking, and compaction events. The `App.tsx` handler dispatches all `ServerMessage` types into React state.

**Multi-server support** allows connecting to multiple Jean2 server instances. Servers are persisted in localStorage. Switching servers clears all session state and reconnects.

**Multi-workspace support** isolates sessions by workspace. The active workspace is persisted and restored on reload.

**Platform abstraction** — the `storage` module (`lib/storage.ts`) transparently uses Tauri Store on native platforms and falls back to localStorage on web. The Tauri Rust layer adds native-only features like multi-window (`Cmd+N`).
