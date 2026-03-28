/**
 * Jean2 Tools CLI
 *
 * Interactive and non-interactive tool management via @clack/prompts.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { intro, outro, log, multiselect, confirm, spinner, isCancel, cancel } from '@clack/prompts';
import { join } from 'path';
import { homedir } from 'os';

import {
  fetchRepositoryWithVersions,
  collectRequiredRuntimes,
  getRequiredExtensions,
  getOptionalExtensions,
  collectEnvVars,
  type ResolvedToolEntry,
  type ExtensionDef,
  type EnvVarDef,
} from './tool-repository';

import {
  installTool,
  removeTool,
  getInstalledTools,
  isToolInstalled,
  getToolsBaseDir,
} from './tool-installer';

// ─── Runtime Checks ───────────────────────────────────────────────────────

export interface RuntimeCheckResult {
  found: boolean;
  version?: string;
}

export async function checkRuntime(runtime: string): Promise<RuntimeCheckResult> {
  const pathDirs = process.env.PATH?.split(':') || [];
  const candidates = [runtime, `${runtime}.exe`];

  for (const dir of pathDirs) {
    for (const candidate of candidates) {
      const fullPath = join(dir, candidate);
      if (existsSync(fullPath)) {
        const version = await getRuntimeVersion(runtime);
        return { found: true, version };
      }
    }
  }

  return { found: false };
}

async function getRuntimeVersion(runtime: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    const child = spawn(runtime, ['--version'], { stdio: 'pipe' });
    let output = '';
    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.on('close', () => {
      const match = output.match(/v?(\d+[\d.]*)/);
      resolve(match ? match[1] : undefined);
    });
    child.on('error', () => resolve(undefined));
    // Timeout fallback
    setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, 2000);
  });
}

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface ToolsCliOptions {
  skipRuntimeCheck?: boolean;
  force?: boolean;
}

export interface ToolsCliResult {
  success: boolean;
  error?: string;
  exitCode?: number;
}

interface OutdatedResult {
  name: string;
  currentVersion: string;
  latestVersion: string;
}

// ─── Utility ───────────────────────────────────────────────────────────────

async function formatRuntimeCheck(requiredRuntimes: string[], skipCheck: boolean): Promise<{ ok: boolean; messages: string[] }> {
  const messages: string[] = [];
  let ok = true;

  for (const rt of requiredRuntimes) {
    const result = await checkRuntime(rt);
    if (result.found) {
      messages.push(`${rt} (found v${result.version ?? '?'})`);
    } else {
      messages.push(`${rt} (not found)`);
      ok = false;
      if (skipCheck) {
        messages.push(`  Skipping check via --skip-runtime-check`);
      }
    }
  }

  return { ok: skipCheck || ok, messages };
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

/**
 * Normalize user-facing paths that may contain `~` or `~/.jean2/`.
 * Ensures consistent absolute path display in CLI output.
 */
function normalizePath(value: string): string {
  if (value.startsWith('~/') || value === '~') {
    return value.replace('~', homedir());
  }
  return value;
}

function formatDefault(value: string): string {
  return normalizePath(value);
}

// ─── Extension Tips ─────────────────────────────────────────────────────────

function displayExtensionTips(
  tools: ResolvedToolEntry[],
  extensions: Record<string, ExtensionDef>,
  envConfig: Record<string, EnvVarDef>,
): void {
  const required = getRequiredExtensions(tools, extensions);
  const optional = getOptionalExtensions(tools, extensions);
  const envVars = collectEnvVars(tools, extensions, envConfig);

  if (required.length === 0 && optional.length === 0 && envVars.length === 0) return;

  log.step('Setup tips:');

  for (const ext of required) {
    log.warn(`  ⚡ ${ext.name} (required for ${ext.requiredFor.join(', ')})`);
    log.step(`    ${ext.installCommand}`);
    if (ext.setupSteps.length > 0) {
      log.step(`    Then: ${ext.setupSteps.join(' && ')}`);
    }
    if (ext.envConfig) {
      for (const [key, def] of Object.entries(ext.envConfig)) {
        log.step(`    Config: ${key} in ${normalizePath(def.configFile)} (default: ${formatDefault(def.default)})`);
      }
    }
  }

  for (const ext of optional) {
    log.info(`  ↗ ${ext.name} (enhances ${ext.optionalFor.join(', ')})`);
    log.step(`    ${ext.installCommand}`);
    if (ext.envConfig) {
      for (const [key, def] of Object.entries(ext.envConfig)) {
        log.step(`    Config: ${key} in ${normalizePath(def.configFile)} (default: ${formatDefault(def.default)})`);
      }
    }
  }

  const extEnvKeys = new Set<string>();
  for (const ext of [...required, ...optional]) {
    if (ext.envConfig) {
      for (const key of Object.keys(ext.envConfig)) {
        extEnvKeys.add(key);
      }
    }
  }

  const topLevelEnvVars = envVars.filter((ev) => ev.source === 'global' && !extEnvKeys.has(ev.key));
  if (topLevelEnvVars.length > 0) {
    log.step(`  Environment variables (all configured in ${normalizePath('~/.jean2/.env')}):`);
    for (const { key, def } of topLevelEnvVars) {
      log.step(`    ${key} — ${def.description}`);
      log.step(`    Default: ${formatDefault(def.default)}`);
    }
  }
}

// ─── Display Extension Details ─────────────────────────────────────────────

function displayExtensionsDetail(
  extensions: Record<string, ExtensionDef>,
  envConfig: Record<string, EnvVarDef>,
): void {
  const extEntries = Object.entries(extensions);
  if (extEntries.length === 0) {
    log.step('  No extensions defined.');
    return;
  }

  for (const [_id, ext] of extEntries) {
    const usedBy = [...ext.requiredFor, ...ext.optionalFor].join(', ');

    log.step(`  ${ext.name}`);
    if (ext.description) log.step(`    ${ext.description}`);
    if (usedBy) log.step(`    Used by: ${usedBy}`);
    log.step(`    Install: ${ext.installCommand}`);
    if (ext.setupSteps.length > 0) {
      log.step(`    Setup: ${ext.setupSteps.join(' && ')}`);
    }
    if (ext.envConfig) {
      for (const [key, def] of Object.entries(ext.envConfig)) {
        log.step(`    Config: ${key} in ${normalizePath(def.configFile)} (default: ${formatDefault(def.default)})`);
      }
    }
    if (ext.languageServers.length > 0) {
      log.step('    Language servers:');
      for (const ls of ext.languageServers) {
        const opt = ls.optional ? ' (optional)' : '';
        log.step(`      ├── ${ls.name}${opt} (${ls.languages.join(', ')})`);
        log.step(`      │   └── ${ls.installCommand}`);
      }
    }
  }

  // Top-level env vars
  const topLevelEntries = Object.entries(envConfig).filter(([key]) => {
    // Check if this key is already covered by an extension
    for (const ext of Object.values(extensions)) {
      if (ext.envConfig && key in ext.envConfig) return false;
    }
    return true;
  });
    if (topLevelEntries.length > 0) {
    log.step('');
    log.step(`  Environment variables (all configured in ${normalizePath('~/.jean2/.env')}):`);
    for (const [key, def] of topLevelEntries) {
      log.step(`    ${key}  ${def.description}`);
      log.step(`    Default: ${formatDefault(def.default)}`);
    }
  }
}

// ─── Filter Tools ───────────────────────────────────────────────────────────

function filterToolsByTag(tools: ResolvedToolEntry[], tag: string): ResolvedToolEntry[] {
  return tools.filter((t) => t.tags.includes(tag));
}

function filterToolsByInstalled(tools: ResolvedToolEntry[]): ResolvedToolEntry[] {
  return tools.filter((t) => isToolInstalled(t.name));
}

function filterToolsByName(tools: ResolvedToolEntry[], names: string[]): ResolvedToolEntry[] {
  const nameSet = new Set(names);
  return tools.filter((t) => nameSet.has(t.name));
}

function getRecommendedTools(tools: ResolvedToolEntry[]): ResolvedToolEntry[] {
  return tools.filter((t) => t.tags.includes('recommended'));
}

// ─── tools list ─────────────────────────────────────────────────────────────

export interface ListOptions {
  installed?: boolean;
  extensions?: boolean;
  json?: boolean;
  tag?: string;
}

export async function toolsList(options: ListOptions): Promise<ToolsCliResult> {
  const s = spinner();

  try {
    s.start('Fetching tool registry...');
    const { tools, extensions, envConfig } = await fetchRepositoryWithVersions();
    s.stop('Fetching tool registry... done');

    const installedSet = new Set(getInstalledTools().map((t) => t.name));

    if (options.extensions) {
      intro('jean2 tools · extensions');
      log.step('');
      log.step('  Extensions:');
      log.step('');
      displayExtensionsDetail(extensions, envConfig);
      outro('✨ Done');
      return { success: true };
    }

    let displayTools = tools;
    if (options.tag) {
      displayTools = filterToolsByTag(tools, options.tag);
    } else if (options.installed) {
      displayTools = filterToolsByInstalled(tools);
    }

    if (options.json) {
      const result = displayTools.map((t) => ({
        name: t.name,
        version: t.version,
        installed: installedSet.has(t.name),
        description: t.description,
        runtime: t.runtime,
        tags: t.tags,
        extensions: t.extensions,
        dangerous: t.dangerous,
        postInstall: t.postInstall,
      }));
      console.log(JSON.stringify(result, null, 2));
      return { success: true };
    }

    intro('jean2 tools · list');
    log.step('');
    log.step('  Tool           Version   Status        Description');
    log.step('  ──────────────────────────────────────────────────────────────────────');

    for (const tool of displayTools) {
      const installed = installedSet.has(tool.name);
      const status = installed ? '✔ installed' : '— available';

      const extHints: string[] = [];
      for (const extId of tool.extensions) {
        const ext = extensions[extId];
        if (!ext) continue;
        if (ext.requiredFor.includes(tool.name)) {
          extHints.push(`⚡ ${extId} required`);
        } else {
          extHints.push(`↗ ${extId}`);
        }
      }

      let desc = tool.description;
      if (tool.dangerous) {
        desc += ' ⚠ dangerous';
      }
      if (extHints.length > 0) {
        desc += '  ' + extHints.join('  ');
      }

      const namePad = tool.name.padEnd(14);
      const versionPad = (tool.version || '?').padEnd(8);
      const statusPad = status.padEnd(13);
      log.step(`  ${namePad}${versionPad}${statusPad}${desc}`);
    }

    log.step('');
    const installedCount = tools.filter((t) => installedSet.has(t.name)).length;
    const runtime = tools[0]?.runtime || 'bun';
    log.step(`  ${installedCount} installed, ${tools.length} available  ·  Runtime: ${runtime}`);

    if (Object.keys(extensions).length > 0) {
      log.step('');
      log.step('  Extensions:');
      log.step('    ↗ optional  ·  ⚡ required  ·  run `jean2 tools list --extensions` for details');
    }

    outro('✨ Done');
    return { success: true };
  } catch (err: unknown) {
    s.stop('Failed to fetch tool registry');
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    return { success: false, error: message };
  }
}

// ─── tools install ──────────────────────────────────────────────────────────

export interface CliInstallOptions extends ToolsCliOptions {
  names?: string[];
  all?: boolean;
  recommended?: boolean;
}

interface TaskResult {
  status: 'ok' | 'error';
  value?: string;
  reason?: unknown;
}

export async function toolsInstall(options: CliInstallOptions): Promise<ToolsCliResult> {
  const toolArgs = options.names || [];
  const isInteractive = toolArgs.length === 0 && !options.all && !options.recommended;

  const s = spinner();

  let repoData: Awaited<ReturnType<typeof fetchRepositoryWithVersions>>;

  try {
    s.start('Fetching tool registry...');
    repoData = await fetchRepositoryWithVersions();
    s.stop('Fetching tool registry... done');
  } catch (err: unknown) {
    s.stop('Failed to fetch tool registry');
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    return { success: false, error: message };
  }

  const { tools, registry, extensions, envConfig } = repoData;

  const requiredRuntimes = collectRequiredRuntimes(tools);
  const runtimeCheck = await formatRuntimeCheck(requiredRuntimes, !!options.skipRuntimeCheck);

  // Resolve which tools to install
  let selected: ResolvedToolEntry[];

  if (options.all) {
    selected = tools;
  } else if (options.recommended) {
    selected = getRecommendedTools(tools);
  } else if (isInteractive) {
    // Interactive multiselect
    intro('jean2 tools · install');
    log.step('');
    for (const msg of runtimeCheck.messages) {
      log.step(`  Runtime required: ${msg}`);
    }
    log.step('');

    const choices = tools.map((tool) => {
      const extHints: string[] = [];
      for (const extId of tool.extensions) {
        const ext = extensions[extId];
        if (!ext) continue;
        if (ext.requiredFor.includes(tool.name)) {
          extHints.push(`⚡ requires ${extId}`);
        }
      }
      let hint = '';
      if (tool.dangerous) hint = ' ⚠ dangerous';
      if (extHints.length > 0) hint += ' ' + extHints.join(' ');

      return {
        value: tool.name,
        label: tool.name,
        hint: `v${tool.version}   ${tool.description}${hint}`,
      };
    });

    const selectedNames = await multiselect({
      message: 'Select tools to install:',
      options: choices,
      required: false,
    });

    if (isCancel(selectedNames)) {
      cancel();
      return { success: true };
    }

    if (!selectedNames || (Array.isArray(selectedNames) && selectedNames.length === 0)) {
      log.step('No tools selected.');
      outro('✨ Done');
      return { success: true };
    }

    selected = filterToolsByName(tools, selectedNames as string[]);
  } else {
    // Non-interactive: specific tool names
    const unknownNames = toolArgs.filter((n) => !tools.find((t) => t.name === n));
    if (unknownNames.length > 0) {
      log.error(`Unknown tools: ${unknownNames.join(', ')}`);
      return { success: false, error: `Unknown tools: ${unknownNames.join(', ')}` };
    }
    selected = filterToolsByName(tools, toolArgs);
  }

  if (selected.length === 0) {
    outro('✨ Done');
    return { success: true };
  }

  if (!isInteractive) {
    intro('jean2 tools · install');
    log.step('');
    for (const msg of runtimeCheck.messages) {
      log.step(`  Runtime required: ${msg}`);
    }
    if (!runtimeCheck.ok) {
      log.error('Required runtimes not found. Aborting. Use --skip-runtime-check to bypass.');
      return { success: false, error: 'Required runtimes not found' };
    }
  }

  // Run installs sequentially with individual spinners
  const results: TaskResult[] = [];
  for (const tool of selected) {
    const toolSpinner = spinner();
    toolSpinner.start(tool.name);
    try {
      const result = await installTool(tool, registry, {
        force: options.force,
        skipPostInstall: false,
      });

      if (result.success) {
        if (result.skipped) {
          toolSpinner.stop(`${tool.name} already installed`);
          results.push({ status: 'ok', value: 'skipped' });
        } else {
          let msg = `${tool.name} installed`;
          if (tool.postInstall) {
            msg += ` (post-install: ${tool.postInstall})`;
          }
          toolSpinner.stop(`✔ ${msg}`);
          results.push({ status: 'ok', value: msg });
        }
      } else {
        toolSpinner.stop(`✗ ${tool.name} failed: ${result.error ?? 'unknown error'}`);
        results.push({ status: 'error', reason: result.error });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toolSpinner.stop(`✗ ${tool.name} failed: ${message}`);
      results.push({ status: 'error', reason: message });
    }
  }

  const successCount = results.filter((r: TaskResult) => r.status === 'ok').length;
  const errorCount = results.filter((r: TaskResult) => r.status === 'error').length;

  log.step('');
  log.step(`  ${successCount} ${pluralize(successCount, 'tool')} installed to ${getToolsBaseDir()}/`);
  if (errorCount > 0) {
    log.error(`${errorCount} ${pluralize(errorCount, 'tool')} failed:`);
    for (const r of results) {
      if (r.status === 'error' && r.reason) {
        log.error(`  • ${r.reason}`);
      }
    }
  }

  // Show extension tips for installed tools
  if (successCount > 0) {
    displayExtensionTips(selected, extensions, envConfig);
  }

  outro('✨ Done');
  return { success: errorCount === 0 };
}

// ─── tools update ───────────────────────────────────────────────────────────

export interface UpdateOptions {
  names?: string[];
  dryRun?: boolean;
}

export async function toolsUpdate(options: UpdateOptions): Promise<ToolsCliResult> {
  const toolArgs = options.names || [];

  const s = spinner();

  let repoData: Awaited<ReturnType<typeof fetchRepositoryWithVersions>>;

  try {
    s.start('Fetching tool registry...');
    repoData = await fetchRepositoryWithVersions();
    s.stop('Fetching tool registry... done');
  } catch (err: unknown) {
    s.stop('Failed to fetch tool registry');
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    return { success: false, error: message };
  }

  const { tools, registry, extensions, envConfig } = repoData;

  const installed = getInstalledTools();
  const installedSet = new Set(installed.map((t) => t.name));

  let toUpdate = tools.filter((t) => installedSet.has(t.name));

  if (toolArgs.length > 0) {
    const nameSet = new Set(toolArgs);
    toUpdate = toUpdate.filter((t) => nameSet.has(t.name));
  }

  if (toUpdate.length === 0) {
    intro('jean2 tools · update');
    log.step('');
    log.step('  No installed tools to update.');
    outro('✨ Done');
    return { success: true };
  }

  const outdated: Array<{ tool: ResolvedToolEntry; installedVersion: string }> = [];
  const upToDate: string[] = [];

  for (const tool of toUpdate) {
    const installed = getInstalledTools().find((t) => t.name === tool.name);
    if (installed && installed.installedVersion !== tool.version) {
      outdated.push({ tool, installedVersion: installed.installedVersion || 'unknown' });
    } else if (installed) {
      upToDate.push(tool.name);
    }
  }

  if (outdated.length === 0) {
    intro('jean2 tools · update');
    log.step('');
    log.step('  All installed tools are up to date.');
    outro('✨ Done');
    return { success: true };
  }

  if (options.dryRun) {
    intro('jean2 tools · update (dry run)');
    log.step('');
    log.step('  Tool        Current   Latest');
    log.step('  ──────────────────────────────');
    for (const { tool, installedVersion } of outdated) {
      log.step(`  ${tool.name.padEnd(11)}${installedVersion.padEnd(10)}${tool.version}`);
    }
    log.step('');
    outro('✨ Done');
    return { success: true };
  }

  intro('jean2 tools · update');
  log.step('');
  for (const { tool, installedVersion } of outdated) {
    log.step(`  ${tool.name.padEnd(11)}${installedVersion} → ${tool.version}`);
  }
  log.step('');

  const confirmed = await confirm({
    message: `Update ${outdated.length} ${pluralize(outdated.length, 'tool')} to latest versions?`,
  });

  if (isCancel(confirmed)) {
    cancel();
    return { success: true };
  }

  if (!confirmed) {
    log.step('Update cancelled.');
    outro('✨ Done');
    return { success: true };
  }

  const updateResults: TaskResult[] = [];
  for (const { tool } of outdated) {
    const toolSpinner = spinner();
    toolSpinner.start(tool.name);
    try {
      const result = await installTool(tool, registry, { force: true });
      if (result.success) {
        let msg = `✔ ${tool.name} updated`;
        if (tool.postInstall) {
          msg += ` (post-install: ${tool.postInstall})`;
        }
        toolSpinner.stop(msg);
        updateResults.push({ status: 'ok', value: tool.name });
      } else {
        toolSpinner.stop(`✗ ${tool.name} failed: ${result.error ?? 'unknown error'}`);
        updateResults.push({ status: 'error', reason: result.error });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toolSpinner.stop(`✗ ${tool.name} failed: ${message}`);
      updateResults.push({ status: 'error', reason: message });
    }
  }

  const updatedCount = updateResults.filter((r: TaskResult) => r.status === 'ok').length;
  const updateErrorCount = updateResults.filter((r: TaskResult) => r.status === 'error').length;

  log.step('');
  log.step(`  ${updatedCount} ${pluralize(updatedCount, 'tool')} updated, ${upToDate.length} already up-to-date`);
  if (updateErrorCount > 0) {
    log.error(`${updateErrorCount} ${pluralize(updateErrorCount, 'tool')} failed:`);
    for (const r of updateResults) {
      if (r.status === 'error' && r.reason) {
        log.error(`  • ${r.reason}`);
      }
    }
  }

  // Show extension tips after updates
  // Filter by index to correctly identify which outdated entries succeeded
  const updatedTools = outdated
    .filter((_, i) => updateResults[i]?.status === 'ok')
    .map((o) => o.tool);
  displayExtensionTips(updatedTools, extensions, envConfig);

  outro('✨ Done');
  return { success: updateErrorCount === 0 };
}

// ─── tools remove ────────────────────────────────────────────────────────────

export interface RemoveOptions {
  names?: string[];
  all?: boolean;
}

export async function toolsRemove(options: RemoveOptions): Promise<ToolsCliResult> {
  const toolArgs = options.names || [];

  if (toolArgs.length === 0 && !options.all) {
    log.error('No tools specified. Use `jean2 tools remove <names...>` or `jean2 tools remove --all`');
    return { success: false, error: 'No tools specified' };
  }

  const installed = getInstalledTools();
  const installedSet = new Set(installed.map((t) => t.name));

  let toRemove: string[];

  if (options.all) {
    toRemove = installed.map((t) => t.name);
  } else {
    toRemove = toolArgs.filter((n) => installedSet.has(n));
    const notInstalled = toolArgs.filter((n) => !installedSet.has(n));
    if (notInstalled.length > 0) {
      log.warn(`Tools not installed: ${notInstalled.join(', ')}`);
    }
  }

  if (toRemove.length === 0) {
    log.step('No installed tools to remove.');
    return { success: true };
  }

  const s = spinner();
  s.start(`Removing ${toRemove.length} ${pluralize(toRemove.length, 'tool')}...`);

  let successCount = 0;
  let failedCount = 0;

  for (const name of toRemove) {
    const result = await removeTool(name);
    if (result.success) {
      successCount++;
    } else {
      failedCount++;
      log.step(`  Failed to remove ${name}: ${result.error}`);
    }
  }

  s.stop(`Removed ${successCount} ${pluralize(successCount, 'tool')}`);

  if (failedCount > 0) {
    log.warn(`${failedCount} ${pluralize(failedCount, 'tool')} failed to remove`);
  }

  return { success: failedCount === 0 };
}

// ─── installRecommendedTools (for init integration) ─────────────────────────

export interface InstallRecommendedToolsResult {
  success: boolean;
  toolsInstalled: boolean;
  error?: string;
}

/**
 * Install recommended tools non-interactively.
 * Used by `jean2 init` to install recommended tools after setup.
 */
export async function installRecommendedTools(): Promise<InstallRecommendedToolsResult> {
  try {
    const result = await toolsInstall({
      recommended: true,
      skipRuntimeCheck: false,
    });

    if (!result.success) {
      return {
        success: false,
        toolsInstalled: false,
        error: result.error,
      };
    }

    return {
      success: true,
      toolsInstalled: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolsInstalled: false,
      error: message,
    };
  }
}

// ─── tools outdated ─────────────────────────────────────────────────────────

export interface OutdatedOptions {
  names?: string[];
}

export async function toolsOutdated(_options: OutdatedOptions = {}): Promise<ToolsCliResult> {
  const s = spinner();

  let repoData: Awaited<ReturnType<typeof fetchRepositoryWithVersions>>;

  try {
    s.start('Fetching tool registry...');
    repoData = await fetchRepositoryWithVersions();
    s.stop('Fetching tool registry... done');
  } catch (err: unknown) {
    s.stop('Failed to fetch tool registry');
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    return { success: false, error: message, exitCode: 1 };
  }

  const { tools } = repoData;
  const installed = getInstalledTools();
  const installedMap = new Map(installed.map((t) => [t.name, t]));

  const outdated: OutdatedResult[] = [];

  for (const tool of tools) {
    const installedInfo = installedMap.get(tool.name);
    if (!installedInfo || !installedInfo.isInstalled) continue;

    if (installedInfo.installedVersion !== tool.version) {
      outdated.push({
        name: tool.name,
        currentVersion: installedInfo.installedVersion || 'unknown',
        latestVersion: tool.version,
      });
    }
  }

  intro('jean2 tools · outdated');
  log.step('');

  if (outdated.length === 0) {
    log.step('  All installed tools are up to date.');
    log.step('');
    log.step(`  ${installed.length} installed, all up-to-date`);
    outro('✨ Done');
    return { success: true, exitCode: 0 };
  }

  log.step('  Tool        Current   Latest');
  log.step('  ──────────────────────────────');
  for (const o of outdated) {
    log.step(`  ${o.name.padEnd(11)}${o.currentVersion.padEnd(10)}${o.latestVersion}`);
  }

  log.step('');
  log.step(`  ${outdated.length} of ${installed.length} installed ${pluralize(installed.length, 'tool')} are outdated`);
  log.step('  Run `jean2 tools update` to update');

  outro('✨ Done');
  return { success: true, exitCode: 1 };
}

// ─── Help ───────────────────────────────────────────────────────────────────

export function toolsHelp(): void {
  console.log(`
  Tool management commands:

    list                  List available and installed tools
      --installed           Only show installed tools
      --extensions          Show extension and env config details
      --tag <tag>           Filter by tag
      --json                JSON output

    install [names...]    Install tools (interactive if no args)
      --all                 Install all available tools
      --recommended         Install recommended tools only
      --force               Reinstall even if already installed
      --skip-runtime-check  Skip runtime requirement check

    update [names...]     Update installed tools to latest
      --dry-run             Preview updates without installing

    remove [names...]     Remove installed tools
      --all                 Remove all tools

    outdated              Check for available updates

  Environment:
    JEAN2_TOOL_REGISTRY_URL  Custom registry URL (default: GitHub raw)

  Configuration:
    All tool env vars are configured in ${normalizePath('~/.jean2/.env')}
    Run \`jean2 tools list --extensions\` to see available env vars

  Examples:
    jean2 tools install                Interactive selection
    jean2 tools install --recommended  Install recommended set
    jean2 tools install grep glob      Install specific tools
    jean2 tools list --extensions     Show extension/env dependencies
    jean2 tools update                 Update all installed tools
    jean2 tools outdated               Check for updates
`);
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export interface ToolsCommandArgs {
  subCommand?: string;
  flags: {
    installed?: boolean;
    extensions?: boolean;
    json?: boolean;
    tag?: string;
    all?: boolean;
    recommended?: boolean;
    force?: boolean;
    skipRuntimeCheck?: boolean;
    dryRun?: boolean;
  };
  names?: string[];
}

export async function runToolsCommand(args: ToolsCommandArgs): Promise<ToolsCliResult> {
  const { subCommand, flags, names } = args;

  switch (subCommand) {
    case 'list':
    case 'ls': {
      return toolsList({
        installed: flags.installed,
        extensions: flags.extensions,
        json: flags.json,
        tag: flags.tag,
      });
    }

    case 'install':
    case 'add': {
      return toolsInstall({
        names,
        all: flags.all,
        recommended: flags.recommended,
        force: flags.force,
        skipRuntimeCheck: flags.skipRuntimeCheck,
      });
    }

    case 'update': {
      return toolsUpdate({
        names,
        dryRun: flags.dryRun,
      });
    }

    case 'remove':
    case 'rm':
    case 'uninstall': {
      return toolsRemove({
        names,
        all: flags.all,
      });
    }

    case 'outdated': {
      return toolsOutdated({});
    }

    case 'help':
    case undefined: {
      toolsHelp();
      return { success: true };
    }

    default: {
      log.error(`Unknown tools command: ${subCommand}`);
      toolsHelp();
      return { success: false, error: `Unknown command: ${subCommand}`, exitCode: 1 };
    }
  }
}
