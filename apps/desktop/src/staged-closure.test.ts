import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('desktop checks the real archive after packaging without staging a second closure', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts.stage, 'node scripts/stage-payload.ts && node scripts/stage-website-shared.ts');
  assert.equal(manifest.scripts['check:staged-closure'], undefined);
  assert.ok(!manifest.scripts.package.includes('check:staged-closure'));
  assert.ok(!existsSync(new URL('../scripts/stage-desktop-closure.ts', import.meta.url)));
  const verification = readFileSync(new URL('../scripts/verify-package.ts', import.meta.url), 'utf8');
  // Release 0.1.26 only: the audit is not spawned (see verify-package.ts); main still runs it.
  assert.match(verification, /Release 0\.1\.26 only: the staged-closure audit \(scripts\/verify-staged-closure\.ts/);
  assert.doesNotMatch(verification, /spawnSync/);
  assert.ok(manifest.scripts.package.indexOf('scripts/verify-package.ts') > manifest.scripts.package.indexOf('electron-builder'));
  const workflow = readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('check:staged-closure'));
});
