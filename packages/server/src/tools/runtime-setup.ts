import { spawn } from 'child_process';
import { log, select, confirm, isCancel } from '@clack/prompts';
import type {
  RuntimeSetup,
  RuntimeSetupResult,
  PlatformRuntimeSetup,
} from '@jean2/shared';

const RUNTIME_SETUPS: Record<string, RuntimeSetup> = {
  bun: {
    id: 'bun',
    displayName: 'Bun',
    verifyCommand: 'bun --version',
    docsUrl: 'https://bun.sh/docs/installation',
    platforms: {
      darwin: {
        prereqNotes: 'Requires macOS 13.0 (Ventura) or later',
        methods: [
          {
            name: 'Official Install Script',
            command: 'curl -fsSL https://bun.com/install | bash',
            notes: 'Requires curl and a supported shell (bash/zsh/fish)',
          },
          {
            name: 'npm',
            command: 'npm install -g bun',
            notes: 'Requires Node.js to be installed first',
          },
          {
            name: 'Homebrew',
            command: 'brew install oven-sh/bun/bun',
            notes: 'Requires Homebrew — https://brew.sh',
          },
        ],
      },
      linux: {
        prereqNotes: 'Requires unzip package (sudo apt install unzip) and Linux kernel 5.6+ (min 5.1)',
        methods: [
          {
            name: 'Official Install Script',
            command: 'curl -fsSL https://bun.com/install | bash',
            notes: 'Requires curl and unzip',
          },
          {
            name: 'npm',
            command: 'npm install -g bun',
            notes: 'Requires Node.js to be installed first',
          },
        ],
      },
      win32: {
        methods: [
          {
            name: 'PowerShell',
            command: 'powershell -c "irm bun.sh/install.ps1|iex"',
            notes: 'Requires Windows 10 version 1809 or later',
          },
          {
            name: 'npm',
            command: 'npm install -g bun',
            notes: 'Requires Node.js to be installed first',
          },
          {
            name: 'Scoop',
            command: 'scoop install bun',
            notes: 'Requires Scoop to be installed first',
          },
        ],
      },
    },
  },
};

export function getRuntimeSetup(runtimeId: string): RuntimeSetup | undefined {
  return RUNTIME_SETUPS[runtimeId];
}

export function getPlatformSetup(
  runtimeId: string,
): PlatformRuntimeSetup | undefined {
  const setup = RUNTIME_SETUPS[runtimeId];
  if (!setup) {
    return undefined;
  }
  return setup.platforms[process.platform as keyof typeof setup.platforms];
}

export function hasSetupForRuntime(runtimeId: string): boolean {
  return getPlatformSetup(runtimeId) !== undefined;
}

export async function verifyRuntime(
  runtimeId: string,
): Promise<RuntimeSetupResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: RuntimeSetupResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const setup = getRuntimeSetup(runtimeId);
    const verifyCmd = setup?.verifyCommand || `${runtimeId} --version`;
    const parts = verifyCmd.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
        const version = versionMatch ? versionMatch[1] : stdout.trim();
        done({ success: true, version });
      } else {
        done({ success: false, error: stderr.trim() || 'Failed to verify runtime' });
      }
    });

    proc.on('error', (err) => {
      done({ success: false, error: err.message });
    });

    const timer = setTimeout(() => {
      proc.kill();
      done({ success: false, error: 'Runtime verification timed out' });
    }, 5000);
  });
}

export async function offerRuntimeSetup(
  runtimeId: string,
): Promise<RuntimeSetupResult> {
  const setup = getRuntimeSetup(runtimeId);
  if (!setup) {
    return { success: false, error: 'No setup instructions available' };
  }

  const platformSetup = getPlatformSetup(runtimeId);
  if (!platformSetup) {
    return { success: false, error: 'No setup instructions for your platform' };
  }

  if (platformSetup.prereqNotes) {
    log.warn(platformSetup.prereqNotes);
  }

  const method =
    platformSetup.methods.length === 1
      ? platformSetup.methods[0]
      : await select({
          message: `Select installation method for ${setup.displayName}:`,
          options: platformSetup.methods.map((m) => ({
            label: m.name,
            value: m,
          })),
        });

  if (isCancel(method)) {
    return { success: false, error: 'Cancelled' };
  }

  const confirmed = await confirm({
    message: `Install ${setup.displayName} via ${method.name}?`,
    active: 'Yes',
    inactive: 'No',
  });

  if (isCancel(confirmed) || !confirmed) {
    return { success: false, error: 'Cancelled' };
  }

  const shell = process.platform === 'win32' ? 'cmd' : 'sh';
  const shellFlag = process.platform === 'win32' ? '/c' : '-c';

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: RuntimeSetupResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const proc = spawn(shell, [shellFlag, method.command], {
      stdio: 'inherit',
    });

    const timer = setTimeout(() => {
      proc.kill();
      log.error('Installation timed out after 120 seconds.');
      done({
        success: false,
        error: `Installation timed out. Try installing manually:\n  ${setup.docsUrl}`,
      });
    }, 120_000);

    proc.on('error', (err) => {
      log.error(`Failed to start installation: ${err.message}`);
      done({ success: false, error: err.message });
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        done({
          success: false,
          error: `Installation failed with exit code ${code}. Restart your terminal and try again, or install manually.`,
        });
        return;
      }

      const verifyResult = await verifyRuntime(runtimeId);

      if (verifyResult.success) {
        log.success(`${setup.displayName} ${verifyResult.version} installed successfully!`);
        done({ success: true, version: verifyResult.version });
      } else {
        log.warn(
          `${setup.displayName} installed but not detected in PATH. Restart your terminal and try again.`,
        );
        log.info(`Documentation: ${setup.docsUrl}`);
        done({
          success: false,
          error: `Restart your terminal and run 'jean2 tools install' again.\nDocumentation: ${setup.docsUrl}`,
        });
      }
    });
  });
}
