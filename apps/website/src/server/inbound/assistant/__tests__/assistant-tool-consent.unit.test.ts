import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantToolConsentSpec } from '../assistant-tool-consent.js';

const snapshot = { permissions: { enabled: true, capabilities: { userMcp: false } }, revisionSeq: 3, allowed: true };

test('personal MCP consent discloses the project list, inherited run key and external settings write', () => {
  const card = buildAssistantToolConsentSpec({ def: { id: 'antigravity', name: 'Antigravity', externalMcpInjection: 'env-passthrough' }, keys: ['userMcp'], snapshot, stale: false });
  assert.equal(card.toolId, 'settings_set_value');
  assert.equal(card.confirmLabel, 'Allow for Antigravity');
  assert.match(card.warning!, /this project/);
  assert.match(card.warning!, /doesn't approve or log/);
  assert.match(card.warning!, /run key/);
  assert.match(card.warning!, /outside Tovu/);
  assert.match(card.warning!, /backed up first/);
  assert.match(card.warning!, /other chats on this site/);
  assert.equal(card.details[0]?.label, 'Tools provided here');
  assert.deepEqual(card.alternatives, undefined);
});

test('stale cards say so and only the supplied qualified alternatives are offered', () => {
  const card = buildAssistantToolConsentSpec({ def: { id: 'claude', name: 'Claude' }, keys: ['shell'], snapshot, stale: true },
    { alternatives: [{ agentId: 'pi', name: 'pi' }] });
  assert.match(card.description!, /This changed since I asked/);
  assert.deepEqual(card.alternatives, [{ id: 'agent-0', label: 'Use pi', choice: 'pi' }]);
  assert.doesNotMatch(card.warning!, /run key|outside Tovu/);
});
