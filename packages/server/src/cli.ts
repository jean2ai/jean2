#!/usr/bin/env bun
// packages/server/src/cli.ts

import './env';  // This loads .env automatically

import { startServer, type ServerOptions } from './index';
import { isInitialized } from './config';
import { getDatabasePath } from './env';
import {
  startDaemon,
  stopDaemon,
  restartDaemon,
  getStatus,
  tailLogs,
  type DaemonOptions,
} from './daemon';
import { showToken, regenerateToken } from './auth/token';
import { initJean2, type InitOptions } from './init';
import { runMigrations } from './store';
import { runToolsCommand, type ToolsCommandArgs } from './tools/tools-cli';
import { performUpdate, type UpdateOptions } from './update';
import { VERSION } from './version';

import './tools/clack-utils';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

interface ParsedServerArgs {
  port?: number;
  host?: string;
}

function parseServerArgs(args: string[]): ParsedServerArgs {
  const result: ParsedServerArgs = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--port':
      case '-p':
        result.port = parseInt(args[++i], 10);
        if (isNaN(result.port)) {
          console.error('Error: --port/-p requires a number');
          process.exit(1);
        }
        break;

      case '--host':
      case '-h':
        result.host = args[++i];
        break;

      default:
        // Unknown option - could be positional arg or error
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }

    i++;
  }

  return result;
}

function printVersion(): void {
  console.log(`jean2 version ${VERSION}`);
}

function printHelp(): void {
  console.log(`
Jean2 - AI Agent Server

Usage: jean2 <command> [options]

Commands:
  start               Start server as background daemon
    -p, --port <port>  Port to listen on
    -h, --host <host>  Host to bind to

  stop                Stop the running server daemon

  status              Check server daemon status

  restart             Restart the server daemon
    -p, --port <port>  Port to listen on
    -h, --host <host>  Host to bind to

  server [options]    Start server in foreground (for systemd)
    -p, --port <port>  Port to listen on (default: 8742)
    -h, --host <host>  Host to bind to (default: 0.0.0.0)

  logs                 Tail server logs

  auth                 Auth token management
    show               Show current API token
    regenerate         Generate a new token

  init                 Initialize Jean2 (required before first use)
    --db-path <path>   Custom database path
    --tools-path <path>  Custom tools path
    --run-migrations   Run schema migrations (default)
    --no-migrations    Skip schema migrations
    --install-preconfigs   Install default preconfigs (default)
    --no-preconfigs        Skip preconfig installation
    --install-tools     Install recommended tools non-interactively
    --no-tools          Skip tool installation entirely
    --force            Force re-initialization

  tools                Tool management
    list                List available and installed tools
      --installed         Only show installed tools
      --extensions        Show extension and env config details
      --tag <tag>         Filter by tag
      --json              JSON output
    install [names...]  Install tools (interactive if no args)
      --all               Install all tools
      --recommended       Install recommended tools only
      --force             Reinstall even if installed
      --skip-runtime-check  Skip runtime check
    update [names...]   Update installed tools to latest
      --dry-run           Preview without installing
    remove [names...]  Remove installed tools
      --all               Remove all tools
    outdated            Check for available updates

  migrate              Run database migrations

  update               Update jean2 to latest version
    --version <ver>    Update to a specific version
    --force            Reinstall even if already on latest
    --dry-run          Check for updates without installing
    --no-restart       Don't restart daemon after update

  version              Show version
  help                 Show this help

Examples:
  jean2 start                     Start server as daemon
  jean2 stop                      Stop the daemon
  jean2 status                    Check if daemon is running
  jean2 restart                   Restart the daemon
  jean2 server                    Run in foreground (for systemd)
  jean2 logs                      Follow server logs
  jean2 auth show                 Show API token
  jean2 auth regenerate           Generate new API token
  jean2 init                      Initialize Jean2
  jean2 tools install             Interactive tool install
  jean2 tools list                List available tools
  jean2 tools list --extensions  Show extension details
  jean2 tools update              Update installed tools
  jean2 tools outdated            Check for updates
  jean2 migrate                   Run database migrations
  jean2 update                     Update to latest version
  jean2 update --dry-run           Check for updates only
  jean2 update --version 0.9.0     Update to specific version

Environment:
  API keys and config can be set in ~/.jean2/.env
  System environment variables take precedence.

Configuration:
  Config dir: ~/.jean2/
  PID file:   ~/.jean2/server.pid
  Log file:   ~/.jean2/server.log
  Token file: ~/.jean2/auth-token.json
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'server': {
      // Check if initialized (skip if JEAN2_DATABASE_PATH is set - backward compat)
      if (!getDatabasePath() && !isInitialized()) {
        console.error('Error: Jean2 is not initialized. Run `jean2 init` first.');
        process.exit(1);
      }

      const parsed = parseServerArgs(args.slice(1));
      const options: ServerOptions = {
        port: parsed.port,
        host: parsed.host,
      };

      await startServer(options);
      break;
    }

    case 'start': {
      // Check if initialized (skip if JEAN2_DATABASE_PATH is set - backward compat)
      if (!getDatabasePath() && !isInitialized()) {
        console.error('Error: Jean2 is not initialized. Run `jean2 init` first.');
        process.exit(1);
      }

      const parsed = parseServerArgs(args.slice(1));
      const options: DaemonOptions = {
        port: parsed.port,
        host: parsed.host,
      };

      const result = await startDaemon(options);
      if (!result.success) {
        console.error('Failed to start daemon:', result.error);
        process.exit(1);
      }
      break;
    }

    case 'stop': {
      const result = await stopDaemon();
      if (!result.success) {
        console.error('Failed to stop daemon:', result.error);
        process.exit(1);
      }
      break;
    }

    case 'restart': {
      const parsed = parseServerArgs(args.slice(1));
      const options: DaemonOptions = {
        port: parsed.port,
        host: parsed.host,
      };

      const result = await restartDaemon(options);
      if (!result.success) {
        console.error('Failed to restart daemon:', result.error);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const status = getStatus();

      if (status.running) {
        console.log('Daemon is running');
        console.log(`  PID:    ${status.pid}`);
        console.log(`  Port:   ${status.port}`);
        console.log(`  Host:   ${status.host}`);
        console.log(`  Started: ${status.startedAt}`);
      } else {
        console.log('Daemon is not running');
      }
      break;
    }

    case 'logs': {
      tailLogs();
      break;
    }

    case 'auth': {
      const subCommand = args[1];

      switch (subCommand) {
        case 'show':
        case 'token':
          showToken();
          break;

        case 'regenerate':
        case 'regen':
          regenerateToken();
          break;

        case 'help':
        case undefined:
          console.log(`
Auth commands:
  show        Show current API token
  regenerate  Generate a new token (invalidates old one)
`);
          break;

        default:
          console.error(`Unknown auth subcommand: ${subCommand}`);
          console.log(`Run 'jean2 auth' for usage.`);
          process.exit(1);
      }
      break;
    }

    case 'init': {
      const initOptions: InitOptions = {};

      // Parse init options
      const initArgs = args.slice(1);
      for (let i = 0; i < initArgs.length; i++) {
        if (initArgs[i] === '--db-path' && initArgs[i + 1]) {
          initOptions.databasePath = initArgs[++i];
        } else if (initArgs[i] === '--tools-path' && initArgs[i + 1]) {
          initOptions.toolsPath = initArgs[++i];
        } else if (initArgs[i] === '--run-migrations' || initArgs[i] === '--no-migrations') {
          initOptions.runMigrations = initArgs[i] === '--run-migrations';
        } else if (initArgs[i] === '--install-preconfigs' || initArgs[i] === '--no-preconfigs') {
          initOptions.installPreconfigs = initArgs[i] === '--install-preconfigs';
        } else if (initArgs[i] === '--force' || initArgs[i] === '-f') {
          initOptions.force = true;
        } else if (initArgs[i] === '--install-tools') {
          initOptions.installTools = true;
        } else if (initArgs[i] === '--no-tools') {
          initOptions.skipTools = true;
        }
      }

      try {
        const result = await initJean2(initOptions);
        if (result.success) {
          console.log('\nJean2 initialized successfully!');
          console.log(`  Config:   ${result.configPath}`);
          console.log(`  Database: ${result.databasePath}`);
          console.log(`  Tools:    ${result.toolsPath}`);
          if (result.toolsInstalled) {
            console.log('  Tools installed: yes');
          }
        } else {
          console.error('Initialization failed:', result.error);
          process.exit(1);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Error:', message);
        process.exit(1);
      }
      break;
    }

    case 'tools': {
      await runToolsCommandFromCLI(args.slice(1));
      break;
    }

    case 'migrate': {
      if (!isInitialized()) {
        console.error('Error: Jean2 is not initialized. Run `jean2 init` first.');
        process.exit(1);
      }

      try {
        runMigrations();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Migration failed:', message);
        process.exit(1);
      }
      break;
    }

    case 'update': {
      const updateOptions: UpdateOptions = {};
      const updateArgs = args.slice(1);

      for (let i = 0; i < updateArgs.length; i++) {
        if (updateArgs[i] === '--version' && updateArgs[i + 1]) {
          updateOptions.version = updateArgs[++i];
        } else if (updateArgs[i] === '--force') {
          updateOptions.force = true;
        } else if (updateArgs[i] === '--dry-run') {
          updateOptions.dryRun = true;
        } else if (updateArgs[i] === '--no-restart') {
          updateOptions.noRestart = true;
        } else if (updateArgs[i] === '--help' || updateArgs[i] === '-h') {
          console.log(`
jean2 update - Update jean2 to latest version

Usage: jean2 update [options]

Options:
  --version <ver>    Update to a specific version (default: latest)
  --force            Reinstall even if already on latest version
  --dry-run          Check for updates without installing
  --no-restart       Don't restart daemon after update
  --help             Show this help message

Examples:
  jean2 update                     Update to latest version
  jean2 update --dry-run           Check for updates only
  jean2 update --version 0.9.0     Update to specific version
`);
          process.exit(0);
        }
      }

      const result = await performUpdate(updateOptions);
      if (!result.success) {
        console.error('Update failed:', result.error);
        process.exit(1);
      }

      if (result.previousVersion !== result.newVersion) {
        console.log(`info: Updated from v${result.previousVersion} to v${result.newVersion}`);
      }

      if (!updateOptions.dryRun && result.previousVersion !== result.newVersion) {
        process.exit(0);
      }
      break;
    }

    case 'version':
    case '-v':
    case '--version': {
      printVersion();
      break;
    }

    case 'help':
    case '-h':
    case '--help':
    case undefined: {
      printHelp();
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run "jean2 help" for usage information');
      process.exit(1);
    }
  }
}

async function runToolsCommandFromCLI(args: string[]): Promise<void> {
  const toolsArgs: ToolsCommandArgs = {
    subCommand: undefined,
    flags: {},
    names: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith('-')) {
      if (!toolsArgs.subCommand) {
        toolsArgs.subCommand = arg;
      } else {
        toolsArgs.names = toolsArgs.names || [];
        toolsArgs.names.push(arg);
      }
      i++;
      continue;
    }

    switch (arg) {
      case '--installed':
        toolsArgs.flags.installed = true;
        break;
      case '--extensions':
        toolsArgs.flags.extensions = true;
        break;
      case '--json':
        toolsArgs.flags.json = true;
        break;
      case '--tag':
        toolsArgs.flags.tag = args[++i];
        break;
      case '--all':
        toolsArgs.flags.all = true;
        break;
      case '--recommended':
        toolsArgs.flags.recommended = true;
        break;
      case '--force':
      case '-f':
        toolsArgs.flags.force = true;
        break;
      case '--skip-runtime-check':
        toolsArgs.flags.skipRuntimeCheck = true;
        break;
      case '--dry-run':
        toolsArgs.flags.dryRun = true;
        break;
      case '--help':
      case '-h':
        toolsArgs.subCommand = 'help';
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
    i++;
  }

  const result = await runToolsCommand(toolsArgs);

  if (result.exitCode !== undefined) {
    process.exitCode = result.exitCode;
  } else if (!result.success) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Error:', message);
  process.exit(1);
});
