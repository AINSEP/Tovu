/**
 * @file Coverage for `root-key-banner.ts` — every rule and every word of the shell's "no root key"
 * banner.
 *
 * `RootKeyBanner.tsx` itself is not exercised here and cannot be: this package has no React
 * renderer (no jsdom, no testing-library, no react-test-renderer — `expanded-mode.test.ts`'s
 * header records the verification). That is precisely why all of the decisions live in plain
 * functions. The JSX shell's own wiring is asserted as source text in
 * `root-key-banner-wiring.test.ts`.
 *
 * The failure mode these tests exist for: a Tovu with no root key that says nothing, so the
 * operator finds out hours later from an opaque 500 on a deploy. The two assertions that matter
 * most are "a missing key SHOWS the banner" and "a present key does NOT" — the second because a
 * banner that cries wolf is one the operator learns to scroll past.
 *
 * No key material appears anywhere below: `RootKeyStatusDto` has no field that can hold any.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchRootKeyStatus,
  rootKeyBannerCopy,
  shouldShowRootKeyBanner,
} from './root-key-banner.js';
import type { RootKeyStatusDto } from '../contracts/root-key.js';

const KEY_FILE = '/Users/someone/.tovu/integrations-root-key.hex';
const ENV_VAR = 'TOVU_INTEGRATIONS_ROOT_KEY';

function status(over: Partial<RootKeyStatusDto> = {}): RootKeyStatusDto {
  return { present: false, source: 'none', keyFilePath: KEY_FILE, envVarName: ENV_VAR, ...over };
}

// ---------------------------------------------------------------------------------------------
// shouldShowRootKeyBanner — shown when it must be, silent when it must be
// ---------------------------------------------------------------------------------------------

test('no usable root key shows the banner', () => {
  assert.equal(shouldShowRootKeyBanner(status()), true);
});

test('a key from the env var does NOT show the banner', () => {
  assert.equal(shouldShowRootKeyBanner(status({ present: true, source: 'env', fingerprint: 'aabbccddeeff' })), false);
});

test('a key from a key file does NOT show the banner', () => {
  assert.equal(shouldShowRootKeyBanner(status({ present: true, source: 'file', fingerprint: 'aabbccddeeff' })), false);
});

test('a configured-but-broken key still shows the banner', () => {
  assert.equal(shouldShowRootKeyBanner(status({ invalid: true, source: 'file', reason: 'not-hex' })), true);
});

test('an unknown status stays silent rather than guessing', () => {
  assert.equal(shouldShowRootKeyBanner(null), false);
});

// ---------------------------------------------------------------------------------------------
// rootKeyBannerCopy — it has to say what to DO
// ---------------------------------------------------------------------------------------------

test('the banner names the launcher that loads .env, and where to run it', () => {
  const copy = rootKeyBannerCopy(status());
  assert.equal(copy.launcherCommand, 'npm run desktop');
  assert.match(copy.launcherHint, /repo root/i);
  assert.match(copy.launcherHint, /\.env/);
});

test('the banner explains that apps/desktop’s own dev script is the trap', () => {
  const copy = rootKeyBannerCopy(status());
  assert.match(copy.launcherHint, /apps\/desktop/);
  assert.match(copy.launcherHint, /does not load \.env/i);
});

test('the banner names the env var and the key file path, from the status', () => {
  const copy = rootKeyBannerCopy(status());
  const remedies = copy.remedies.join('\n');
  assert.ok(remedies.includes(ENV_VAR), 'the env var is a remedy, so it must be named');
  assert.ok(remedies.includes(KEY_FILE), 'the key file path is a remedy, so it must be named');
});

test('the paths in the copy come from the status, never from a literal in the copy module', () => {
  const copy = rootKeyBannerCopy(status({ keyFilePath: '/elsewhere/key.hex', envVarName: 'SOME_OTHER_VAR' }));
  const all = [copy.cause, ...copy.remedies].join('\n');
  assert.ok(all.includes('/elsewhere/key.hex'));
  assert.ok(all.includes('SOME_OTHER_VAR'));
  assert.equal(all.includes(KEY_FILE), false, 'a hardcoded path would point the operator at the wrong file');
});

test('nothing configured says exactly that', () => {
  const copy = rootKeyBannerCopy(status());
  assert.match(copy.cause, /is not set/);
  assert.match(copy.cause, /no key file/);
});

test('a broken env var is described as broken, not as missing', () => {
  const copy = rootKeyBannerCopy(status({ invalid: true, source: 'env', reason: 'too-short' }));
  assert.match(copy.cause, /not usable/);
  assert.ok(copy.cause.includes(ENV_VAR));
  assert.match(copy.cause, /too short/i);
});

test('a broken key FILE points at the file, not at the env var', () => {
  const copy = rootKeyBannerCopy(status({ invalid: true, source: 'file', reason: 'not-hex' }));
  assert.ok(copy.cause.includes(KEY_FILE));
  assert.match(copy.cause, /not hex digits/);
});

test('every rejection reason has a sentence — no blank banner', () => {
  for (const reason of ['empty', 'not-hex', 'odd-length', 'too-short', 'unreadable'] as const) {
    const copy = rootKeyBannerCopy(status({ invalid: true, source: 'file', reason }));
    assert.match(copy.cause, /is not usable: \S/, `no sentence for ${reason}`);
  }
});

test('the banner warns that a new key does not recover old credentials', () => {
  assert.match(rootKeyBannerCopy(status()).caveat, /does not recover/i);
});

test('the banner says why this matters later, not just that it is wrong now', () => {
  assert.match(rootKeyBannerCopy(status()).consequence, /credential/i);
});

test('the headline says what is wrong in one line', () => {
  assert.match(rootKeyBannerCopy(status()).headline, /root key/i);
});

// ---------------------------------------------------------------------------------------------
// fetchRootKeyStatus — a broken bridge must never break the page
// ---------------------------------------------------------------------------------------------

test('the status is read across the bridge', async () => {
  const served = status({ present: true, source: 'env', fingerprint: 'aabbccddeeff' });
  assert.deepEqual(await fetchRootKeyStatus({ rootKeyStatus: async () => served }), served);
});

test('an absent bridge yields an unknown status, not a crash', async () => {
  assert.equal(await fetchRootKeyStatus({}), null);
});

test('a rejecting bridge yields an unknown status, not a crash', async () => {
  assert.equal(
    await fetchRootKeyStatus({
      rootKeyStatus: async () => {
        throw new Error('no handler');
      },
    }),
    null
  );
});

test('an unknown status keeps the banner hidden end to end', async () => {
  assert.equal(shouldShowRootKeyBanner(await fetchRootKeyStatus({})), false);
});

test('a bridge that is not there at all yields an unknown status, not a crash', async () => {
  assert.equal(await fetchRootKeyStatus(undefined), null);
});

test('a bridge that resolves nothing yields an unknown status', async () => {
  assert.equal(
    await fetchRootKeyStatus({ rootKeyStatus: async () => undefined as unknown as RootKeyStatusDto }),
    null
  );
});
