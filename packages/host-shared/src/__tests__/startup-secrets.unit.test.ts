import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeStartupSecrets, startupSecretEnvironment, STARTUP_SECRET_KEYS } from '../startup-secrets.js';

/**
 * @file Pins the launch-credential surface of `startup-secrets.ts`: the key list is an installation
 * compatibility surface (a launcher in an older install still sends exactly these names), the module
 * consumes launch credentials once per process, and a scoped environment never receives them.
 */

test('the credential key list is the installed launchers\' compatibility surface, name for name', () => {
  assert.deepEqual([...STARTUP_SECRET_KEYS], ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN',
    'TOVU_ADMIN_PASSWORD', 'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN']);
});

test('initializeStartupSecrets consumes launch credentials once: a second call returns the SAME promise', async () => {
  const first = initializeStartupSecrets();
  const second = initializeStartupSecrets();
  assert.equal(second, first);
  await first;
});

test('a custom environment never receives a launch credential', async () => {
  await initializeStartupSecrets();
  const scoped = startupSecretEnvironment({ env: {} });
  for (const key of STARTUP_SECRET_KEYS) assert.equal(key in scoped, false, `${key} must not appear in a scoped environment`);
});
