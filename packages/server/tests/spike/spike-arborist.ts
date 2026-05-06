/**
 * Phase 1 Feasibility Spike
 *
 * Proves that Jean2 can install a source-based tool with npm dependencies
 * using @npmcli/arborist, then import and execute it from a temp directory.
 *
 * Run:  bun packages/server/tests/spike/spike-arborist.ts
 */

import { mkdirSync, cpSync, existsSync, readFileSync, rmSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import Arborist from '@npmcli/arborist';

// ── Configuration ──────────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(import.meta.dir, 'fixtures', 'smile-tool');
const TEST_DIR = join(tmpdir(), `jean2-spike-${Date.now()}`);

// ── Helpers ────────────────────────────────────────────────────────────────

function log(label: string, ...args: unknown[]) {
  console.log(`\n[${label}]`, ...args);
}

function fail(label: string, ...args: unknown[]) {
  console.error(`\n❌ [${label}]`, ...args);
  process.exit(1);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  Phase 1 Feasibility Spike — Arborist Install + Execute');
  console.log('══════════════════════════════════════════════════════');

  // ── Step 1: Copy fixture into a temp install directory ──
  log('Step 1', `Copying fixture to ${TEST_DIR}`);
  mkdirSync(TEST_DIR, { recursive: true });
  cpSync(FIXTURE_DIR, TEST_DIR, { recursive: true });

  const pkgJsonPath = join(TEST_DIR, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    fail('Step 1', 'package.json missing after copy');
  }
  log('Step 1', '✅ Fixture copied. package.json:', JSON.parse(readFileSync(pkgJsonPath, 'utf-8')));

  // ── Step 2: Install dependencies with @npmcli/arborist ──
  log('Step 2', 'Loading @npmcli/arborist...');

  log('Step 2', `Arborist loaded (constructor type: ${typeof Arborist})`);

  log('Step 2', `Running Arborist.reify() in ${TEST_DIR}...`);

  const startTime = Date.now();
  try {
    const arb = new Arborist({
      path: TEST_DIR,
      // Use the default npm registry
      registry: 'https://registry.npmjs.org',
    });

    const tree = await arb.reify();
    const elapsed = Date.now() - startTime;
    log('Step 2', `✅ Arborist.reify() completed in ${elapsed}ms`);
    log('Step 2', `Tree root: ${tree?.path || '(n/a)'}`);
    log('Step 2', `Children count: ${tree?.children?.size || 0}`);

    const nodeModulesPath = join(TEST_DIR, 'node_modules');
    if (existsSync(nodeModulesPath)) {
      const dirs = readdirSync(nodeModulesPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      log('Step 2', `node_modules contains: ${dirs.join(', ')}`);
    } else {
      fail('Step 2', 'node_modules directory was not created');
    }
  } catch (err: unknown) {
    fail('Step 2', 'Arborist.reify() failed:', err);
  }

  // ── Step 3: Import the installed tool ──
  log('Step 3', 'Importing tool module from installed directory...');

  const toolJsPath = join(TEST_DIR, 'tool.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolModule: any;
  try {
    toolModule = await import(toolJsPath);
    log('Step 3', '✅ Tool module imported successfully');
    log('Step 3', `  definition: ${JSON.stringify(toolModule.definition)}`);
    log('Step 3', `  execute type: ${typeof toolModule.execute}`);
  } catch (err: unknown) {
    fail('Step 3', 'Failed to import tool module:', err);
  }

  // ── Step 4: Execute the tool ──
  log('Step 4', 'Executing tool with test input...');

  try {
    const result = await toolModule.execute({ text: 'Hello 🌍! How are you 😊? Great 🎉🎉🎉' });
    log('Step 4', '✅ Tool executed successfully!');
    log('Step 4', `  Result: ${JSON.stringify(result, null, 2)}`);

    if (result.success && result.result.count > 0) {
      log('Step 4', `  Found ${result.result.count} unique emoji(s): ${result.result.emojis.join(' ')}`);
    }
  } catch (err: unknown) {
    fail('Step 4', 'Tool execution failed:', err);
  }

  // ── Step 5: Test with a second dependency-heavy scenario ──
  log('Step 5', 'Verifying dependency module resolution from node_modules...');

  try {
    const emojiRegexPath = join(TEST_DIR, 'node_modules', 'emoji-regex');
    if (existsSync(emojiRegexPath)) {
      const importedDirectly = await import(emojiRegexPath);
      const regex = importedDirectly.default || importedDirectly;
      log('Step 5', `✅ emoji-regex resolved directly: ${typeof regex}`);
      log('Step 5', `  Regex test: ${regex().test('🎮')}`);
    } else {
      fail('Step 5', 'emoji-regex not found in node_modules');
    }
  } catch (err: unknown) {
    fail('Step 5', 'Direct dependency import failed:', err);
  }

  // ── Cleanup ──
  log('Cleanup', `Removing temp dir: ${TEST_DIR}`);
  rmSync(TEST_DIR, { recursive: true, force: true });

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ✅ SPIKE PASSED — All steps completed successfully');
  console.log('══════════════════════════════════════════════════════');
  console.log(`
  Summary:
  1. Fixture tool copied to temp dir           ✅
  2. Arborist.reify() installed dependencies   ✅
  3. Tool module imported from installed dir   ✅
  4. Tool executed with real npm dep           ✅
  5. Direct dep resolution verified            ✅

  Conclusions:
  - @npmcli/arborist can install tool deps from a temp dir
  - Bun can import installed modules from node_modules
  - The tool executes correctly with resolved deps
  `);
}

main().catch((err) => {
  console.error('Fatal spike error:', err);
  process.exit(1);
});
