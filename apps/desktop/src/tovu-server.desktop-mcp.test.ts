import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServeEnv, buildCliEnv } from './tovu-server.ts';

const capability = { TOVU_DESKTOP_MCP_URL: 'http://127.0.0.1:4111/mcp', TOVU_DESKTOP_MCP_TOKEN: 'a'.repeat(64), TOVU_DESKTOP_MCP_HANDOFF_TOKEN: 'b'.repeat(64) };

test('only the spawning main can supply a desktop capability to a site server', () => {
  const inherited = buildServeEnv({ repoRoot: '/missing-repo', baseEnv: { ...capability } });
  assert.equal(inherited.TOVU_DESKTOP_MCP_URL, undefined);
  assert.equal(inherited.TOVU_DESKTOP_MCP_TOKEN, undefined);
  assert.equal(inherited.TOVU_DESKTOP_MCP_HANDOFF_TOKEN, undefined);
  const owned = buildServeEnv({ repoRoot: '/missing-repo', baseEnv: { ...capability, TOVU_DESKTOP_MCP_TOKEN: 'stale' }, desktopMcpEnv: capability });
  assert.equal(owned.TOVU_DESKTOP_MCP_URL, capability.TOVU_DESKTOP_MCP_URL);
  assert.equal(owned.TOVU_DESKTOP_MCP_TOKEN, capability.TOVU_DESKTOP_MCP_TOKEN);
});

test('unrelated desktop CLI children never inherit the desktop capability', () => {
  const env = buildCliEnv({ baseEnv: { ...capability } }, { warn: () => {} });
  assert.equal(env.TOVU_DESKTOP_MCP_URL, undefined);
  assert.equal(env.TOVU_DESKTOP_MCP_TOKEN, undefined);
  assert.equal(env.TOVU_DESKTOP_MCP_HANDOFF_TOKEN, undefined);
});
