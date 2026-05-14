# Install Jean2

## Server

Install the Jean2 server binary from GitHub Releases. Available for Linux (amd64), macOS (darwin), and Windows (x64).

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/rabbyte-tech/jean2/main/install/install-jean2.sh | bash
```

**Windows:**
```powershell
irm https://raw.githubusercontent.com/rabbyte-tech/jean2/main/install/install-jean2.ps1 | iex
```

### First Run

```bash
jean2 init              # Initialize config, database, tools directory
jean2 init --install-tools  # Also install recommended tools
jean2 start             # Start as background daemon
```

### Authentication

Auth is **off by default** — no tokens are generated. To enable authentication:

```bash
# Add to ~/.jean2/.env or your shell environment
JEAN2_AUTH_TOKEN=your-secret-token
```

Check status with `jean2 auth`.

## Client

- Desktop apps (macOS, Windows) are available as unsigned releases on [GitHub Releases](https://github.com/rabbyte-tech/jean2/releases?q=client&expanded=true). Signed releases and mobile apps are coming soon.
- Alternatively, run directly in the browser with npx:

```bash
npx @jean2/client
```

npm: [@jean2/client](https://www.npmjs.com/package/@jean2/client)

### Running Unsigned Desktop Apps

**macOS** — Since the app is not signed, macOS will quarantine it. Remove the quarantine attribute:

```bash
xattr -cr /Applications/jean2.app
```

**Windows** — Since the app is not signed, Windows Defender SmartScreen will block it. Click **"More info"** then **"Run anyway"** to proceed.

## Tools

Tools are language-agnostic — the server binary ships with npm built in for dependency installation. No external runtime is required.

Install tools via the CLI:

```bash
jean2 tools install --all        # Install all available tools
jean2 tools install --name edit  # Install a specific tool
```

Or see [TOOLS.md](./TOOLS.md) for manual installation commands for each tool.
