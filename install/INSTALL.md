# Install Jean2

## Server

- Install the Jean2 server binary from GitHub Releases. Available for Linux (amd64) and macOS (darwin). 
- If you're on Windows, use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) to run the server.

```bash
curl -fsSL https://raw.githubusercontent.com/rabbyte-tech/jean2/main/install/install-jean2.sh | bash
```

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

See [TOOLS.md](./TOOLS.md) for all available tools and their install commands.
