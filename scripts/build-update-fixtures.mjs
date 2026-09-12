/**
 * Builds two labeled production variants of the app for the update-flow e2e:
 *  - .e2e/fixtures/a — VITE_BUILD_LABEL=a
 *  - .e2e/fixtures/b — VITE_BUILD_LABEL=b
 *
 * The e2e serves variant `a`, swaps the served directory to `b`, and drives
 * the deferred update controller through its quiet-window gate. Run:
 *   node scripts/build-update-fixtures.mjs
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = resolve(root, '.e2e', 'fixtures');
const distDir = resolve(root, 'dist');

for (const label of ['a', 'b']) {
  execSync('pnpm exec vite build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BUILD_LABEL: label },
  });
  const dest = resolve(fixturesDir, label);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(distDir, dest, { recursive: true });
  console.log(`fixture ${label} -> ${dest}`);
}

console.log('update-flow fixtures ready');
