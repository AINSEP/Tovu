import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantCliPermissions, fullCliEnvLock, resolveAssistantCliPermissions, resolveFullCliAccess } from '../../assistant-native-fallbacks.js';
import { resolveAgentPermissionMode } from '../../agent-permission-mode.js';

/** Env-schema design §2.4a: the four switches that deny local CLI access on their own.
 * Access defaults ON when a switch is absent, so removing, renaming or re-wording one of these
 * turns CLI access on for an install that had it off. Each row is tested with exactly that one
 * switch set and nothing else, at the outcomes only it protects. The list is an inline literal
 * on purpose: a migration step may not derive it from the code it pins. */
const DENY_SWITCHES = [
  { name: 'TOVU_AGENT_PERMISSION_MODE', denies: ['restricted'] },
  { name: 'TOVU_AGENT_FORBID_BASH', denies: ['1'] },
  { name: 'TOVU_AGENT_FULL_CLI_ACCESS', denies: ['0', 'false'] },
  { name: 'TOVU_AGENT_NATIVE_FALLBACKS', denies: ['0', 'false'] },
] as const;

/** Words an operator might try. Only the `denies` words above may deny; every other word here
 * leaves access on, exactly as today (no trimming, no case folding, no extra spellings). */
const HOSTILE_WORDS = ['', ' ', '0', '1', 'false', 'true', 'FALSE', 'TRUE', 'False', ' 0', '0 ', 'no', 'off', 'yes', 'on',
  'restricted', 'RESTRICTED', 'bypass', 'abc', '-1', 'x'.repeat(4096)] as const;

const everyCapabilityOn = assistantCliPermissions({ enabled: true });
const everyCapabilityOff = assistantCliPermissions({ enabled: false });

test('deny-switch pin: with no switch set a local owner has Full CLI access and no lock', () => {
  assert.equal(resolveFullCliAccess({ isOwner: true, env: {} }), true);
  assert.equal(fullCliEnvLock({ env: {} }), undefined);
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings: everyCapabilityOn }), everyCapabilityOn);
});

for (const { name, denies } of DENY_SWITCHES) {
  for (const word of denies) {
    test(`deny-switch pin: ${name}=${word} alone turns Full CLI access off and names itself as the lock`, () => {
      const env = { [name]: word };
      assert.equal(resolveFullCliAccess({ isOwner: true, env }), false);
      assert.equal(resolveFullCliAccess({ isOwner: true, env, setting: true }), false, 'a saved owner grant must not beat the switch');
      assert.equal(fullCliEnvLock({ env }), name);
      assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env, settings: everyCapabilityOn }), everyCapabilityOff);
    });
  }

  test(`deny-switch pin: ${name} denies for exactly ${JSON.stringify(denies)} and for no other word`, () => {
    const denied = HOSTILE_WORDS.filter(word => !resolveFullCliAccess({ isOwner: true, env: { [name]: word } }));
    const locked = HOSTILE_WORDS.filter(word => fullCliEnvLock({ env: { [name]: word } }) === name);
    assert.deepEqual(denied, [...denies].sort((a, b) => HOSTILE_WORDS.indexOf(a) - HOSTILE_WORDS.indexOf(b)));
    assert.deepEqual(locked, denied);
  });
}

test('deny-switch pin: an install that only ever set a legacy switch stays locked', () => {
  for (const env of [{ TOVU_AGENT_NATIVE_FALLBACKS: '0' }, { TOVU_AGENT_NATIVE_FALLBACKS: 'false' }, { TOVU_AGENT_FORBID_BASH: '1' }]) {
    assert.equal(resolveFullCliAccess({ isOwner: true, env, setting: true }), false, JSON.stringify(env));
    assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env, settings: everyCapabilityOn }), everyCapabilityOff, JSON.stringify(env));
  }
});

test('deny-switch pin: an ON word on one switch never cancels a deny word on another', () => {
  const on = { TOVU_AGENT_PERMISSION_MODE: 'bypass', TOVU_AGENT_FORBID_BASH: '0', TOVU_AGENT_FULL_CLI_ACCESS: '1', TOVU_AGENT_NATIVE_FALLBACKS: '1' };
  assert.equal(resolveFullCliAccess({ isOwner: true, env: on }), true);
  for (const { name, denies } of DENY_SWITCHES) for (const word of denies) {
    assert.equal(resolveFullCliAccess({ isOwner: true, env: { ...on, [name]: word }, setting: true }), false, `${name}=${word}`);
  }
});

test('deny-switch pin: the lock shown to the owner is the first set switch in a fixed order', () => {
  const all = { TOVU_AGENT_PERMISSION_MODE: 'restricted', TOVU_AGENT_FORBID_BASH: '1', TOVU_AGENT_FULL_CLI_ACCESS: '0', TOVU_AGENT_NATIVE_FALLBACKS: '0' };
  const order = DENY_SWITCHES.map(({ name }) => name);
  const reported = order.map((_, index) => fullCliEnvLock({ env: Object.fromEntries(Object.entries(all).filter(([key]) => order.indexOf(key as typeof order[number]) >= index)) }));
  assert.deepEqual(reported, order);
});

test('deny-switch pin: TOVU_AGENT_PERMISSION_MODE=restricted also keeps the agent permission mode restricted', () => {
  assert.equal(resolveAgentPermissionMode({ env: {} }), 'bypass');
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: 'restricted' } }), 'restricted');
  const restricted = HOSTILE_WORDS.filter(word => resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: word } }) === 'restricted');
  assert.deepEqual(restricted, ['restricted']);
});
