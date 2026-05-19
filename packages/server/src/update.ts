import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, statSync, openSync, writeFileSync } from 'fs';

import { VERSION } from '@/version';
import { getStatus, stopDaemon, getLogFilePath } from '@/daemon';
import { getToolEnv } from '@/env';
import { isInitialized } from '@/config';

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

function encodePowerShellCommand(script: string): string {
  const utf16leBuffer = Buffer.from(script, 'utf16le');
  const bom = Buffer.from([0xff, 0xfe]);
  return Buffer.concat([bom, utf16leBuffer]).toString('base64');
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

    const logFile = getLogFilePath();
    const lines: string[] = [
      `Start-Sleep -Seconds 3`,
      `$ErrorActionPreference = 'Stop'`,
      `$moved = $false`,
      `for ($i = 0; $i -lt 10; $i++) {`,
      `  try {`,
      `    Move-Item -Force '${tempPath}' '${binaryPath}'`,
      `    $moved = $true`,
      `    break`,
      `  } catch {`,
      `    Add-Content -Path '${logFile}' -Value "[$(Get-Date)] Update retry $($i+1)/10: $_"`,
      `    Start-Sleep -Seconds 1`,
      `  }`,
      `}`,
      `if (-not $moved) {`,
      `  Add-Content -Path '${logFile}' -Value "[$(Get-Date)] FAILED: Could not replace binary after 10 retries"`,
      `  exit 1`,
      `}`,
    ];

    if (options.needsMigration || options.wasDaemonRunning) {
      if (options.needsMigration) {
        lines.push(`& '${binaryPath}' migrate`);
      }
      if (options.wasDaemonRunning) {
        lines.push(`& '${binaryPath}' start`);
      }
    }

    lines.push(
      `Add-Content -Path '${logFile}' -Value "[$(Get-Date)] Update completed successfully"`,
    );

    const scriptPath = join(tmpdir(), `jean2-update-${Date.now()}.ps1`);
    writeFileSync(scriptPath, lines.join('\r\n'));

    const encodedCmd = encodePowerShellCommand(
      `Set-ExecutionPolicy Bypass -Scope Process -Force; & '${scriptPath}'; Remove-Item -Force '${scriptPath}' -ErrorAction SilentlyContinue`,
    );

    const child = Bun.spawn(
      [ps, '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCmd],
      {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...getToolEnv(),
        },
      },
    );
    child.unref();
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

    const child = Bun.spawn(['sh', '-c', command], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...getToolEnv(),
      },
    });
    child.unref();
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

  const binaryPath = process.execPath;

  spawnReplacer(tempPath, binaryPath, {
    needsMigration,
    wasDaemonRunning,
  });

  return {
    success: true,
    previousVersion: currentVersion,
    newVersion: targetVersion,
  };
}
