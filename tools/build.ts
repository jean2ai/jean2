import { readdir, stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = __dirname;

const DEFAULT_OUTPUT = join(TOOLS_DIR, 'dist', 'tools');
const EXTERNAL_MODULES = ['bun:sqlite'];

interface CliArgs {
  output: string;
  tool: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    output: DEFAULT_OUTPUT,
    tool: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' && i + 1 < args.length) {
      result.output = args[++i];
    } else if (arg === '--tool' && i + 1 < args.length) {
      result.tool = args[++i];
    }
  }

  return result;
}

async function findToolDirectories(): Promise<string[]> {
  const entries = await readdir(TOOLS_DIR);
  const tools: string[] = [];

  for (const entry of entries) {
    const toolPath = join(TOOLS_DIR, entry);
    const toolTsPath = join(toolPath, 'tool.ts');

    try {
      const entryStat = await stat(toolPath);
      const tsStat = await stat(toolTsPath);

      if (entryStat.isDirectory() && tsStat.isFile()) {
        tools.push(entry);
      }
    } catch {
      // Not a tool directory or tool.ts doesn't exist
    }
  }

  return tools.sort();
}

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== 'EEXIST') {
      throw err;
    }
  }
}

async function writeVersionFile(toolDir: string, outputDir: string): Promise<void> {
  const packageJsonPath = join(toolDir, 'package.json');
  const versionDest = join(outputDir, 'VERSION');
  const raw = await readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(raw) as { version?: unknown };

  if (typeof pkg.version !== 'string' || !pkg.version.trim()) {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }

  await ensureDir(outputDir);
  await writeFile(versionDest, `${pkg.version.trim()}\n`, 'utf-8');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BuildResult {
  name: string;
  success: boolean;
  outputPath?: string;
  size?: number;
  error?: string;
}

async function buildTool(name: string, outputDir: string): Promise<BuildResult> {
  const toolDir = join(TOOLS_DIR, name);
  const toolOutputDir = join(outputDir, name);
  const toolTsPath = join(toolDir, 'tool.ts');
  const toolJsPath = join(toolOutputDir, 'tool.js');

  try {
    await ensureDir(toolOutputDir);

    const result = await Bun.build({
      entrypoints: [toolTsPath],
      outdir: toolOutputDir,
      target: 'bun',
      external: EXTERNAL_MODULES,
    });

    if (!result.success) {
      const errors = result.logs
        .filter((l) => l.level === 'error')
        .map((l) => l.message)
        .join('; ') || 'Build failed';
      return {
        name,
        success: false,
        error: errors,
      };
    }

    const outputStat = await stat(toolJsPath);

    await writeVersionFile(toolDir, toolOutputDir);

    return {
      name,
      success: true,
      outputPath: toolJsPath,
      size: outputStat.size,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name,
      success: false,
      error: message,
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  let tools = await findToolDirectories();

  if (args.tool) {
    if (!tools.includes(args.tool)) {
      console.error(`Error: Tool '${args.tool}' not found in ${TOOLS_DIR}`);
      process.exit(1);
    }
    tools = [args.tool];
  }

  console.log(`Building ${tools.length} tool${tools.length === 1 ? '' : 's'}...`);

  const results: BuildResult[] = [];

  for (const tool of tools) {
    process.stdout.write(`  ${tool}... `);

    const result = await buildTool(tool, args.output);
    results.push(result);

    if (result.success) {
      process.stdout.write(`\x1b[32m\x1b[1m✓\x1b[0m → ${result.outputPath} (${formatBytes(result.size!)})\n`);
    } else {
      process.stdout.write(`\x1b[31m\x1b[1m✗\x1b[0m → Error: ${result.error}\n`);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nBuilt ${succeeded}/${results.length} tool${results.length === 1 ? '' : 's'} successfully.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
