import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCliEnv } from './tovu-server.ts';

test('init, plugin tokens, owner-store and move-site CLI children never inherit daemon, tool or render authority', () => {
  const keys = ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN'];
  const parent = Object.fromEntries(keys.flatMap(key => [[key, 'host-secret'], [key.toLowerCase(), 'host-secret']]));
  const child = buildCliEnv({ baseEnv: { ...parent, PATH: '/bin' } }, { warn: () => {} });
  for (const key of Object.keys(parent)) assert.equal(key in child, false, key);
  assert.equal(child.PATH, '/bin');
});
