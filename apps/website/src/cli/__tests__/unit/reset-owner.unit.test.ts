import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runResetOwnerCommand } from '../../commands/reset-owner.js';

test('reset command passes the hidden password and explicit env username without assuming admin', async () => {
  const inputs = ['private-password', 'private-password'];
  const calls: unknown[] = [], output: string[] = [];
  await runResetOwnerCommand({ dir: '/disposable/site' }, {
    env: {}, prompt: async () => inputs.shift()!,
    reset: async input => { calls.push(input); return 'renamed-owner'; },
    print: text => output.push(text),
  });
  assert.deepEqual(calls, [{ dir: '/disposable/site', password: 'private-password' }]);
  assert.ok(output.join('').includes('renamed-owner'));
  assert.ok(!output.join('').includes('private-password'));
});

test('mismatching confirmation never opens a writable store', async () => {
  let resets = 0;
  const inputs = ['first', 'different'];
  await assert.rejects(runResetOwnerCommand({ dir: '/disposable/site' }, {
    env: {}, prompt: async () => inputs.shift()!, reset: async () => { resets++; return ''; }, print: () => {},
  }));
  assert.equal(resets, 0);
});


test('CLI preserves the specific redacted cause without exposing the supplied password or Tovu keys', async () => {
  const password = 'private-password';
  await assert.rejects(runResetOwnerCommand({ dir: '/missing/site' }, {
    env: { TOVU_ADMIN_RESET_PASSWORD: password },
    reset: async () => { throw new Error(`The site directory does not exist ${password} tovu_ak_012345abcdef.HOST_SECRET_CANARY_abcdefghijklmnop`); },
  }), error => {
    const text = String(error);
    assert.match(text, /The site directory does not exist/);
    assert.match(text, /\[REDACTED:tovu_api_key\]/);
    assert.ok(!text.includes(password));
    assert.ok(!text.includes('HOST_SECRET_CANARY'));
    return true;
  });
});
