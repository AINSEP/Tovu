/** The private bridge uses the same buildServeEnv path in source and compiled desktop launches. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServeEnv } from './tovu-server.ts';

test('desktop capture capabilities are explicitly injected, never reused from a parent site', () => {
  const stale = { JINI_DESKTOP_RENDER_URL: 'http://127.0.0.1:4000/capture', JINI_DESKTOP_RENDER_TOKEN: 'old' };
  const fresh = { JINI_DESKTOP_RENDER_URL: 'http://127.0.0.1:5000/capture', JINI_DESKTOP_RENDER_TOKEN: 'new' };
  const absent = buildServeEnv({ repoRoot: process.cwd(), baseEnv: stale });
  assert.equal(absent.JINI_DESKTOP_RENDER_URL, undefined);
  assert.equal(absent.JINI_DESKTOP_RENDER_TOKEN, undefined);
  const injected = buildServeEnv({ repoRoot: process.cwd(), baseEnv: stale, nodeToolchainEnv: fresh });
  assert.equal(injected.JINI_DESKTOP_RENDER_URL, fresh.JINI_DESKTOP_RENDER_URL);
  assert.equal(injected.JINI_DESKTOP_RENDER_TOKEN, fresh.JINI_DESKTOP_RENDER_TOKEN);
  assert.deepEqual(stale, { JINI_DESKTOP_RENDER_URL: 'http://127.0.0.1:4000/capture', JINI_DESKTOP_RENDER_TOKEN: 'old' });
});
