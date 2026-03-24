import { dirname } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { createInterface } from 'node:readline';
import { homedir } from 'os';
import { join } from 'path';

import {
  getConfigPath,
  getDefaultDatabasePath,
  getDefaultToolsPath,
  saveConfig,
  isInitialized,
  clearConfigCache,
  getModelsConfigPath,
  clearModelsCache,
} from './config';
import { runMigrations } from './store';
import { initializePreconfigs } from './core/preconfig';
import { initializeToken } from './auth/token';
import defaultModelsJson from './config/models.json';

export interface InitOptions {
  databasePath?: string;
  toolsPath?: string;
  runMigrations?: boolean;
  installPreconfigs?: boolean;
  force?: boolean;
}

export interface InitResult {
  success: boolean;
  error?: string;
  configPath: string;
  databasePath: string;
  toolsPath: string;
  modelsPath: string;
  preconfigsInstalled: boolean;
}

interface RlInterface {
  question: (query: string) => Promise<string>;
  close: () => void;
}

function createRl(): RlInterface {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    question: (query: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(query, (answer) => {
          resolve(answer);
        });
      });
    },
    close: () => {
      rl.close();
    },
  };
}

async function promptDatabasePath(rl: RlInterface, defaultPath: string): Promise<string> {
  const answer = await rl.question(`Database path [${defaultPath}]: `);
  return answer.trim() || defaultPath;
}

async function promptToolsPath(rl: RlInterface, defaultPath: string): Promise<string> {
  const answer = await rl.question(`Tools path [${defaultPath}]: `);
  return answer.trim() || defaultPath;
}

async function promptRunMigrations(rl: RlInterface): Promise<boolean> {
  const answer = await rl.question('Run database migrations? [Y/n]: ');
  const trimmed = (answer || '').trim().toLowerCase();
  return trimmed === '' || trimmed === 'y' || trimmed === 'yes';
}

async function promptInstallPreconfigs(rl: RlInterface): Promise<boolean> {
  const answer = await rl.question('Install default preconfigs? [Y/n]: ');
  const trimmed = (answer || '').trim().toLowerCase();
  return trimmed === '' || trimmed === 'y' || trimmed === 'yes';
}

async function initJean2Internal(options: InitOptions = {}): Promise<InitResult> {
  const { databasePath, toolsPath, runMigrations: runMigrationsOption, installPreconfigs: installPreconfigsOption, force } = options;

  if (isInitialized() && !force) {
    return {
      success: false,
      error: 'Jean2 is already initialized. Use --force to re-initialize.',
      configPath: getConfigPath(),
      databasePath: databasePath || getDefaultDatabasePath(),
      toolsPath: toolsPath || getDefaultToolsPath(),
      modelsPath: getModelsConfigPath(),
      preconfigsInstalled: false,
    };
  }

  if (force) {
    clearConfigCache();
    clearModelsCache();
  }

  const defaultDbPath = getDefaultDatabasePath();
  const defaultToolsPath = getDefaultToolsPath();
  let shouldRunMigrations = runMigrationsOption ?? true;
  let shouldInstallPreconfigs = installPreconfigsOption ?? true;
  let finalDbPath = databasePath || defaultDbPath;
  let finalToolsPath = toolsPath || defaultToolsPath;

  if (!databasePath || !toolsPath || runMigrationsOption === undefined || installPreconfigsOption === undefined) {
    const rl = createRl();

    try {
      finalDbPath = await promptDatabasePath(rl, defaultDbPath);
      finalToolsPath = await promptToolsPath(rl, defaultToolsPath);
      shouldRunMigrations = await promptRunMigrations(rl);
      shouldInstallPreconfigs = await promptInstallPreconfigs(rl);
      console.log();

      rl.close();
    } catch (_e) {
      rl.close();
      throw _e;
    }
  }

  // Create directories
  mkdirSync(dirname(finalDbPath), { recursive: true });
  mkdirSync(finalToolsPath, { recursive: true });
  mkdirSync(join(homedir(), '.jean2', 'prompts'), { recursive: true });

  // Create empty .env file
  const envPath = join(homedir(), '.jean2', '.env');
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `# Jean2 Environment Variables
# Add your API keys and configuration here

# LLM API Keys
# JEAN2_LLM_OPENAI_API_KEY=your-key-here
# JEAN2_LLM_ANTHROPIC_API_KEY=your-key-here

# Agent Configuration
JEAN2_LLM_MAX_STEPS=500
JEAN2_LLM_SUBAGENT_MAX_STEPS=500
`);
  }

  // Create empty AGENTS.md file
  const agentsPath = join(homedir(), '.jean2', 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# Jean2 Global Instructions
#
# This file contains instructions that apply to all projects on this machine.
# They will be loaded before project-specific instructions.
#
# Example:
# - Always use TypeScript strict mode
# - Never commit .env files
# - Prefer functional components in React
`);
  }

  const modelsPath = getModelsConfigPath();
  if (!existsSync(modelsPath)) {
    writeFileSync(modelsPath, JSON.stringify(defaultModelsJson, null, 2));
    console.log('Created default models.json at ~/.jean2/models.json');
  }

  // Save config
  saveConfig({
    databasePath: finalDbPath,
    toolsPath: finalToolsPath,
    port: 8742,
    host: '0.0.0.0',
    initializedAt: new Date().toISOString(),
    version: '1.0.0',
  });

  // Initialize auth token
  const token = initializeToken();
  console.log(`Auth token generated: ${token}`);

  // Run migrations if requested
  if (shouldRunMigrations) {
    console.log('Running migrations...');
    runMigrations();
  }

  // Install preconfigs if requested
  if (shouldInstallPreconfigs) {
    console.log('Installing default preconfigs...');
    await initializePreconfigs();
  }

  console.log('\nDone! Jean2 is ready.');

  return {
    success: true,
    configPath: getConfigPath(),
    databasePath: finalDbPath,
    toolsPath: finalToolsPath,
    modelsPath: getModelsConfigPath(),
    preconfigsInstalled: shouldInstallPreconfigs,
  };
}

export async function initJean2(options: InitOptions = {}): Promise<InitResult> {
  if (!process.stdin.isTTY) {
    return initJean2Internal(options);
  }

  return initJean2Internal(options);
}
