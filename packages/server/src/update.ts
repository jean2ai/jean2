import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, statSync, openSync } from 'fs';

import { VERSION } from '@/version';
import { getStatus, stopDaemon, getLogFilePath } from '@/daemon';
import { getToolEnv } from '@/env';
import { isInitialized } from '@/config';
import { getBinaryPath } from './paths';

export interface UpdateOptions {
  version?: string;
  force?: boolean;
  dryRun?: boolean;
  noRestart?: boolean;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface UpdateResult {
  success: boolean;
  error?: string;
  previousVersion?: string;
  newVersion?: string;
}

const VERSION_FILE_URL = 'https://raw.githubusercontent.com/rabbyte-tech/jean2/refs/heads/main/packages/server/VERSION';
const REPO = 'rabbyte-tech/jean2';

export function detectPlatform(): 'darwin' | 'linux' | 'windows' {
  switch (process.platform) {
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export function getBinaryInstallPath(): string {
  return getBinaryPath();
}

export function getDownloadUrl(version: string, platform: string): string {
  const assetName = platform === 'windows' ? 'jean2-windows.exe' : `jean2-${platform}`;
  return `https://github.com/${REPO}/releases/download/server%2Fv${version}/${assetName}`;
}

export function isCompiledBinary(): boolean {
  return !process.argv[1]?.endsWith('.ts');
}

export async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(VERSION_FILE_URL, {
    headers: {
      'User-Agent': 'jean2-updater',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest version: ${response.status} ${response.statusText}`);
  }

  const version = (await response.text()).trim();

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format from remote: ${version}`);
  }

  return version;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  console.log('info: Fetching latest version...');

  const latestVersion = await fetchLatestVersion();
  const currentVersion = VERSION;

  console.log(`info: Current version: ${currentVersion}`);
  console.log(`info: Latest version: ${latestVersion}`);

  const updateAvailable = currentVersion !== latestVersion;

  if (updateAvailable) {
    console.log('info: Update available!');
  } else {
    console.log('info: Already up to date');
  }

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
  };
}

export async function downloadBinary(url: string, destPath: string): Promise<void> {
  console.log(`info: Downloading jean2 for ${detectPlatform()}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'jean2-updater',
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await Bun.write(destPath, buffer);

  console.log('info: Download complete');
}

export function spawnReplacer(
  tempPath: string,
  binaryPath: string,
  options: { needsMigration: boolean; wasDaemonRunning: boolean },
): void {
  const logFd = openSync(getLogFilePath(), 'a');
  const platform = detectPlatform();

  if (platform === 'windows') {
    const ps = Bun.which('pwsh') || Bun.which('powershell');
    if (!ps) {
      throw new Error('PowerShell not found');
    }

    let command = `Start-Sleep -Seconds 2; Move-Item -Force '${tempPath}' '${binaryPath}'`;
    if (options.needsMigration || options.wasDaemonRunning) {
      command += '; if ($LASTEXITCODE -eq 0) { ';
      const actions: string[] = [];
      if (options.needsMigration) {
        actions.push(`& '${binaryPath}' migrate`);
      }
      if (options.wasDaemonRunning) {
        actions.push(`& '${binaryPath}' start`);
      }
      command += actions.join('; ') + ' }';
    }

    Bun.spawn([ps, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...getToolEnv(),
      },
    });
  } else {
    let command = `sleep 2 && mv -f '${tempPath}' '${binaryPath}' && chmod +x '${binaryPath}'`;

    if (options.needsMigration || options.wasDaemonRunning) {
      const actions: string[] = [];
      if (options.needsMigration) {
        actions.push(`'${binaryPath}' migrate`);
      }
      if (options.wasDaemonRunning) {
        actions.push(`'${binaryPath}' start`);
      }
      command += ` && ${actions.join(' && ')}`;
    }

    Bun.spawn(['sh', '-c', command], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...getToolEnv(),
      },
    });
  }
}

export async function performUpdate(options: UpdateOptions): Promise<UpdateResult> {
  if (!isCompiledBinary()) {
    return {
      success: false,
      error: 'Self-update is only available when running the compiled binary',
    };
  }

  const currentVersion = VERSION;
  const targetVersion = options.version || (await fetchLatestVersion());

  if (targetVersion === currentVersion && !options.force) {
    if (options.dryRun) {
      console.log('info: Already up to date');
    }
    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: currentVersion,
    };
  }

  if (options.dryRun) {
    console.log(`info: Update available: v${currentVersion} → v${targetVersion}`);
    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: targetVersion,
    };
  }

  const platform = detectPlatform();
  const downloadUrl = getDownloadUrl(targetVersion, platform);

  let wasDaemonRunning = false;
  if (!options.noRestart) {
    const status = getStatus();
    if (status.running) {
      console.log('info: Stopping daemon...');
      await stopDaemon();
      wasDaemonRunning = true;
    }
  }

  const needsMigration = isInitialized();

  const tempDir = tmpdir();
  const tempPath = join(tempDir, `jean2-update-${Date.now()}`);

  await downloadBinary(downloadUrl, tempPath);

  if (!existsSync(tempPath)) {
    return {
      success: false,
      error: 'Download verification failed: file not found',
    };
  }

  const fileStats = statSync(tempPath);
  if (fileStats.size === 0) {
    return {
      success: false,
      error: 'Download verification failed: file is empty',
    };
  }

  if (options.noRestart) {
    console.log('info: Installing update... (--no-restart: daemon will not be restarted)');
  } else {
    console.log('info: Installing update... (daemon will restart automatically)');
  }

  spawnReplacer(tempPath, getBinaryInstallPath(), {
    needsMigration,
    wasDaemonRunning,
  });

  return {
    success: true,
    previousVersion: currentVersion,
    newVersion: targetVersion,
  };
}
