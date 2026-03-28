#!/usr/bin/env bun
// packages/lsp/src/cli.ts

import './env';  // Load environment first

import { startServer, type ServerOptions } from './index';
import { isInitialized } from './config';
import {
  startDaemon,
  stopDaemon,
  restartDaemon,
  getStatus,
  tailLogs,
  type DaemonOptions,
} from './daemon';
import { initLsp, type InitOptions } from './init';
import { VERSION } from './version';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

interface ParsedServerArgs {
  port?: number;
  host?: string;
  force?: boolean;
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
        result.host = args[++i];
        break;

      case '--force':
      case '-f':
        result.force = true;
        break;

      default:
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
  console.log(`jean2-lsp version ${VERSION}`);
}

function printHelp(): void {
  console.log(`
Jean2 LSP - Language Server Protocol Service

Usage: jean2-lsp <command> [options]

Commands:
  init                Initialize LSP service (requires jean2 init first)
    -f, --force        Force re-initialization
    -p, --port <port>  Port to listen on
    --host <host>      Host to bind to

  start               Start LSP server as background daemon
    -p, --port <port>  Port to listen on
    --host <host>      Host to bind to

  stop                Stop the LSP daemon

  restart             Restart the LSP daemon
    -p, --port <port>  Port to listen on
    --host <host>      Host to bind to

  status              Check LSP daemon status

  server [options]    Run in foreground (for systemd)
    -p, --port <port>  Port to listen on (default: 8739)
    --host <host>      Host to bind to (default: 0.0.0.0)

  logs                Tail LSP logs

  version             Show version
  help                Show this help

Examples:
  jean2-lsp init                  Initialize LSP service
  jean2-lsp start                 Start as daemon
  jean2-lsp stop                  Stop the daemon
  jean2-lsp status                Check if running
  jean2-lsp server                Run in foreground
  jean2-lsp logs                  Follow logs
  jean2-lsp version               Show version

Configuration:
  Config dir: ~/.jean2/services/lsp/
  PID file:   ~/.jean2/services/lsp/lsp.pid
  Log file:   ~/.jean2/services/lsp/lsp.log
  Env file:   ~/.jean2/services/lsp/.env
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      const parsed = parseServerArgs(args.slice(1));
      const options: InitOptions = {
        port: parsed.port,
        host: parsed.host,
        force: parsed.force,
      };

      try {
        const result = await initLsp(options);
        if (result.success) {
          console.log('\nLSP service initialized successfully!');
          console.log(`  Config: ${result.configPath}`);
          console.log(`  Port:   ${result.port}`);
          console.log(`  Host:   ${result.host}`);
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

    case 'start': {
      if (!isInitialized()) {
        console.error('Error: LSP is not initialized. Run `jean2-lsp init` first.');
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
      if (!isInitialized()) {
        console.error('Error: LSP is not initialized. Run `jean2-lsp init` first.');
        process.exit(1);
      }

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
        console.log('LSP Daemon is running');
        console.log(`  PID:     ${status.pid}`);
        console.log(`  Port:    ${status.port}`);
        console.log(`  Host:    ${status.host}`);
        console.log(`  Started: ${status.startedAt}`);
      } else {
        console.log('LSP Daemon is not running');
      }
      break;
    }

    case 'server': {
      if (!isInitialized()) {
        console.error('Error: LSP is not initialized. Run `jean2-lsp init` first.');
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

    case 'logs': {
      tailLogs();
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
      console.error('Run "jean2-lsp help" for usage information');
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Error:', message);
  process.exit(1);
});
