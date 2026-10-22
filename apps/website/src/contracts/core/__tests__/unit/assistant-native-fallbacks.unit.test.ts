import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAssistantNativeFallbacks, isHostedAssistantRuntime } from '../../assistant-native-fallbacks.js';
import { resolveAgentPermissionMode } from '../../agent-permission-mode.js';

/** Owner decision 2026-10-17: local-owner native fallback grant, forced off on hosted runtimes. */
test('local owner defaults ON; other principals and the off switch stay locked', () => {
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: {} }, {}), true);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: false, env: {} }, {}), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: false, env: { TOVU_AGENT_NATIVE_FALLBACKS: '1' } }, {}), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_NATIVE_FALLBACKS: '0' } }, {}), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_FORBID_BASH: '1' } }, {}), false);
  assert.equal(isHostedAssistantRuntime({ env: { TOVU_AGENT_NATIVE_FALLBACKS: '0' } }, {}), false);
});

for (const hosted of [
  { TOVU_RUNTIME_MODE: 'production' }, { TOVU_HOSTED: '1' }, { TOVU_HOSTED: 'true' },
  { TOVU_PUBLIC_URL: 'https://tovu.dev' },
  { TOVU_PUBLIC_URL: 'https://owner.tovu.dev/' },
]) test(`hosted signal ${JSON.stringify(hosted)} overrides owner opt-ins and permission bypass`, () => {
  const env = { ...hosted, TOVU_AGENT_NATIVE_FALLBACKS: '1', TOVU_AGENT_PERMISSION_MODE: 'bypass' };
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env }, {}), false);
  assert.equal(resolveAgentPermissionMode({ env }, {}), 'restricted');
});

test('Full CLI access is a single owner setting, with a reversible legacy environment alias', () => {
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: {}, setting: false }), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_FULL_CLI_ACCESS: '0' }, setting: true }), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_FULL_CLI_ACCESS: '1', TOVU_AGENT_NATIVE_FALLBACKS: '0' }, setting: true }), false);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_FULL_CLI_ACCESS: '1' }, setting: true }), true);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env: { TOVU_AGENT_PERMISSION_MODE: 'restricted' }, setting: true }), false);
});

test('injected native restrictions override owner grants and granular capability choices', () => {
  const hostSignals = { hosted: false, nativeToolsRestricted: true, labels: [] };
  const env = { TOVU_AGENT_PERMISSION_MODE: 'bypass', TOVU_AGENT_FULL_CLI_ACCESS: '1' };
  assert.equal(isHostedAssistantRuntime({ env }, { hostSignals }), true);
  assert.equal(resolveAssistantNativeFallbacks({ isOwner: true, env }, { hostSignals }), false);
  assert.equal(resolveAgentPermissionMode({ env }, { hostSignals }), 'restricted');
});
