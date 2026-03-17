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

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Version from package.json
const VERSION = '1.0.0';

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
    --run-migrations   Run schema migrations (default)
    --no-migrations    Skip schema migrations
    --install-preconfigs   Install default preconfigs (default)
    --no-preconfigs        Skip preconfig installation
    --force            Force re-initialization

  migrate              Run database migrations

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
  jean2 migrate                   Run database migrations
  jean2 version                   Show version

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
        } else if (initArgs[i] === '--run-migrations' || initArgs[i] === '--no-migrations') {
          initOptions.runMigrations = initArgs[i] === '--run-migrations';
        } else if (initArgs[i] === '--install-preconfigs' || initArgs[i] === '--no-preconfigs') {
          initOptions.installPreconfigs = initArgs[i] === '--install-preconfigs';
        } else if (initArgs[i] === '--force' || initArgs[i] === '-f') {
          initOptions.force = true;
        }
      }

      try {
        const result = await initJean2(initOptions);
        if (result.success) {
          console.log('\nJean2 initialized successfully!');
          console.log(`  Config:   ${result.configPath}`);
          console.log(`  Database: ${result.databasePath}`);
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

    case 'migrate': {
      if (!isInitialized()) {
        console.error('Error: Jean2 is not initialized. Run `jean2 init` first.');
        process.exit(1);
      }

      try {
        runMigrations();
        console.log('Migrations completed successfully.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Migration failed:', message);
        process.exit(1);
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

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Error:', message);
  process.exit(1);
});
