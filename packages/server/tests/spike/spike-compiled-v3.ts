/**
 * Phase 1 Feasibility Spike — Compiled Binary Variant v3
 *
 * Tests whether Arborist works when statically imported and bundled via
 * `bun build --compile`. Places the temp script inside the server package
 * so node_modules resolution works during compilation.
 *
 * Run:  bun packages/server/tests/spike/spike-compiled-v3.ts
 */

import { mkdirSync, cpSync, rmSync, writeFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// ── Configuration ──────────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(import.meta.dir, 'fixtures', 'smile-tool');
const TEST_DIR = join(tmpdir(), `jean2-spike-compiled-v3-${Date.now()}`);
const COMPILED_BIN = join(tmpdir(), `jean2-spike-bin-v3-${Date.now()}`);
const SERVER_DIR = resolve(import.meta.dir, '../../');  // packages/server

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
  console.log('  Phase 1 Spike — Arborist from Compiled Binary (v3)');
  console.log('══════════════════════════════════════════════════════');

  // ── Step 1: Copy fixture into a temp install directory ──
  log('Step 1', `Copying fixture to ${TEST_DIR}`);
  mkdirSync(TEST_DIR, { recursive: true });
  cpSync(FIXTURE_DIR, TEST_DIR, { recursive: true });

  // ── Step 2: Write install script INSIDE packages/server ──
  const installScriptPath = join(SERVER_DIR, `spike-install-v3-temp.ts`);
  const installScriptContent = `
import Arborist from '@npmcli/arborist';
import { join } from 'path';

const TEST_DIR = ${JSON.stringify(TEST_DIR)};

async function main() {
  console.log('Arborist loaded from static import');
  console.log('Creating Arborist instance...');
  const arb = new Arborist({ path: TEST_DIR });

  console.log('Running reify...');
  const tree = await arb.reify();
  console.log('reify completed. path:', tree?.path);

  // Now import and execute the tool
  const toolPath = join(TEST_DIR, 'tool.js');
  console.log('Importing tool from:', toolPath);
  const tool = await import(toolPath);
  const result = await tool.execute({ text: 'Test 🚀 compiled binary' });
  console.log('Result:', JSON.stringify(result));
}

main().catch(e => { console.error(e); process.exit(1); });
`;

  writeFileSync(installScriptPath, installScriptContent);
  log('Step 2', `Install script written to ${installScriptPath}`);

  // ── Step 3: Compile the script into a standalone binary ──
  log('Step 3', `Compiling binary to ${COMPILED_BIN}...`);

  try {
    const proc = Bun.spawn([
      'bun', 'build', '--compile',
      '--outfile', COMPILED_BIN,
      installScriptPath,
    ], {
      cwd: SERVER_DIR,  // packages/server — where node_modules lives
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      log('Step 3', `Build failed (exit ${exitCode})`);
      log('Step 3', `stdout: ${stdout}`);
      log('Step 3', `stderr: ${stderr}`);
      fail('Step 3', 'Cannot compile Arborist into a standalone binary');
    }
    log('Step 3', `✅ Compiled binary created. Size: ${statSync(COMPILED_BIN).size} bytes`);
  } catch (err: unknown) {
    fail('Step 3', 'Compilation failed:', err);
  }

  // ── Step 4: Run the compiled binary ──
  log('Step 4', 'Running compiled binary...');
  
  try {
    const proc = Bun.spawn([COMPILED_BIN], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    log('Step 4', `Exit code: ${exitCode}`);
    log('Step 4', `stdout: ${stdout}`);
    if (stderr) {
      log('Step 4', `stderr: ${stderr}`);
    }

    if (exitCode === 0) {
      console.log('\n══════════════════════════════════════════════════════');
      console.log('  ✅ COMPILED BINARY SPIKE PASSED');
      console.log('══════════════════════════════════════════════════════');
    } else {
      console.log('\n══════════════════════════════════════════════════════');
      console.log('  ⚠️  COMPILED BINARY SPIKE FAILED (exit code ' + exitCode + ')');
      console.log('══════════════════════════════════════════════════════');
    }
  } catch (err: unknown) {
    fail('Step 4', 'Failed to run compiled binary:', err);
  }

  // ── Cleanup ──
  log('Cleanup', `Removing temp files...`);
  rmSync(TEST_DIR, { recursive: true, force: true });
  try { rmSync(COMPILED_BIN, { force: true }); } catch { /* already removed */ }
  try { rmSync(installScriptPath, { force: true }); } catch { /* already removed */ }
}

main().catch((err) => {
  console.error('Fatal spike error:', err);
  process.exit(1);
});
