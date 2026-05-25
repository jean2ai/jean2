# CLI Reference

The Jean2 CLI (`jean2`) manages the server daemon, tools, models, and updates.

```
jean2 <command> [options]
```

## Daemon Management

### `jean2 start`

Start the server as a background daemon.

```
jean2 start [-p|--port <port>] [-h|--host <host>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-p`, `--port` | `8742` | Port to listen on |
| `-h`, `--host` | `0.0.0.0` | Host to bind to |

### `jean2 stop`

Stop the running daemon.

### `jean2 restart`

Restart the daemon. Accepts the same flags as `start`.

### `jean2 status`

Show daemon status (PID, port, host, uptime).

### `jean2 logs`

Tail the server log file (`~/.jean2/server.log`).

### `jean2 server`

Start the server in the foreground (for systemd or debugging).

```
jean2 server [-p|--port <port>] [-h|--host <host>]
```

## Initialization

### `jean2 init`

Interactive first-time setup. Creates `~/.jean2/` with all necessary files.

```
jean2 init [options]
```

| Flag | Description |
|------|-------------|
| `--db-path <path>` | Custom database path |
| `--tools-path <path>` | Custom tools directory |
| `--run-migrations` | Run schema migrations (default) |
| `--no-migrations` | Skip schema migrations |
| `--install-preconfigs` | Install default preconfigs (default) |
| `--no-preconfigs` | Skip preconfig installation |
| `--install-tools` | Install recommended tools non-interactively |
| `--no-tools` | Skip tool installation entirely |
| `--force` | Force re-initialization |

## Tools

### `jean2 tools list`

List available and installed tools.

```
jean2 tools list [options]
```

| Flag | Description |
|------|-------------|
| `--installed` | Only show installed tools |
| `--extensions` | Show extension and env config details |
| `--tag <tag>` | Filter by tag |
| `--json` | JSON output |

### `jean2 tools install`

Install tools. Interactive if no names provided.

```
jean2 tools install [names...] [options]
```

| Flag | Description |
|------|-------------|
| `--all` | Install all tools |
| `--recommended` | Install recommended tools only |
| `--force` | Reinstall even if already installed |
| `--skip-runtime-check` | Skip runtime compatibility check |

### `jean2 tools update`

Update installed tools to the latest version.

```
jean2 tools update [names...] [--dry-run]
```

### `jean2 tools remove`

Remove installed tools.

```
jean2 tools remove [names...] [--all]
```

### `jean2 tools outdated`

Check for available updates.

## Models

### `jean2 models sync`

Sync models from the upstream registry.

```
jean2 models sync [--override]
```

| Flag | Description |
|------|-------------|
| `--override` | Replace local models.json with upstream (default: merge) |

## Database

### `jean2 migrate`

Run pending database migrations.

## Updates

### `jean2 update`

Update the Jean2 binary to the latest version.

```
jean2 update [options]
```

| Flag | Description |
|------|-------------|
| `--version <ver>` | Update to a specific version |
| `--force` | Reinstall even if already on latest |
| `--dry-run` | Check for updates without installing |
| `--no-restart` | Don't restart daemon after update |

## Utility

### `jean2 open`

Open the built-in client in your browser.

### `jean2 auth`

Show authentication status and masked token.

### `jean2 version`

Print the current version.

### `jean2 help`

Print the full help text.

## Environment

All server behavior is configured via environment variables. See [Configuration](./configuration.md) for the complete reference.

- `~/.jean2/.env` — Server reads this automatically on startup
- System environment variables take precedence over `.env`
- Changes to `.env` require a server restart

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.jean2/config.json` | Server configuration (port, host, paths) |
| `~/.jean2/models.json` | Model registry (providers and models) |
| `~/.jean2/.env` | Environment variables and API keys |
| `~/.jean2/AGENTS.md` | Global agent instructions |
| `~/.jean2/server.pid` | Daemon PID file |
| `~/.jean2/server.log` | Server log file |
