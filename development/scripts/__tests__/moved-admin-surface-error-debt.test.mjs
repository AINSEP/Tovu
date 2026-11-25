import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('every Tovu error-debt row names a file that exists', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const debt = JSON.parse(readFileSync(new URL('../error-gate-debt.json', import.meta.url), 'utf8'));
  // The moved frame hook and other files moved to Jini or deleted cannot retain host debt allowances.
  const missing = debt.filter(({ file }) => !existsSync(resolve(root, file))).map(({ file }) => file);
  assert.deepEqual(missing, []);
});
