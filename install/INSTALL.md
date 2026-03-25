# Install Jean2

## Server

- Install the Jean2 server binary from GitHub Releases. Available for Linux (amd64) and macOS (darwin). 
- If you're on Windows, use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) to run the server.

```bash
curl -fsSL https://raw.githubusercontent.com/rabbyte-tech/jean2/main/install/install-jean2.sh | bash
```

## LSP Service

- Install the Jean2 LSP service binary. See the [LSP README](../services/lsp/README.md) for details.
- Don't forget to install the actual [language servers](../services/lsp/README.md#prerequisites) you need (e.g. `typescript-language-server`, `intelephense`).

```bash
curl -fsSL https://raw.githubusercontent.com/rabbyte-tech/jean2/main/install/install-jean2-lsp.sh | bash
```

## Client

- Desktop apps (macOS, Windows) are available as unsigned releases on [GitHub Releases](https://github.com/rabbyte-tech/jean2/releases?q=client&expanded=true). Signed releases and mobile apps are coming soon.
- Alternatively, run directly in the browser with npx:

```bash
npx @jean2/client
```

npm: [@jean2/client](https://www.npmjs.com/package/@jean2/client)

## Tools

See [TOOLS.md](./TOOLS.md) for all available tools and their install commands.
