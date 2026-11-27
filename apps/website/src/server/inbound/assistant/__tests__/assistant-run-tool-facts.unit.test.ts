import assert from 'node:assert/strict';
import test from 'node:test';
import { getAgentDef } from '@jini-ai/agent-runtime';
import { resolveNativeToolPolicy } from '@jini-ai/agent-runtime/native-tool-policy';
import { assistantCliPermissions } from '@tovu/contracts/assistant-native-fallbacks';
import { assistantRunToolFacts } from '../assistant-run-tool-facts.js';

test('run facts preserve selected launch settings, per-agent disabling and unique server ownership', () => {
  const registered = getAgentDef({ id: 'claude' });
  assert.ok(registered, 'Claude must be in the runtime registry');
  const def = { ...registered, mcpIsolation: { perRun: 'fixture' } };
  const effective = assistantCliPermissions({ enabled: true, capabilities: { shell: false, web: true } });
  const settings = { ...effective, byAgent: { claude: { enabled: true, capabilities: { shell: false } } } };
  const result = assistantRunToolFacts({
    agentId: 'claude', model: 'review-model', effort: 'high',
    snapshot: { def, effective, isOwner: true, settings, settingsSource: 'site', lock: undefined,
      nativeCapabilities: effective.capabilities, policy: resolveNativeToolPolicy({ def, policy: {} }) },
    plan: { verdict: 'RUN', bridged: true, loadsOwn: false },
    tools: [
      { id: 'mcp__mail__inbox', metadata: { mcpSource: { id: 'mail', host: 'mail.example:8443' } } },
      { id: 'content_read' },
      { id: 'mcp__mail__drafts', metadata: { mcpSource: { id: 'mail', host: 'mail.example:8443' } } },
      { id: 'mcp__calendar__week', metadata: { mcpSource: { id: 'calendar', host: 'calendar.example' } } },
    ],
  });
  assert.equal(result.agent, 'claude');
  assert.equal(result.model, 'review-model');
  assert.equal(result.effort, 'high');
  assert.equal(result.isolation, 'perRun');
  assert.equal(result.capabilities.shell, false);
  assert.equal(result.capabilities.web, true);
  assert.deepEqual([result.sources.enabled, result.sources.shell, result.sources.web], ['byAgent', 'byAgent', 'site']);
  assert.deepEqual(result.toolIds, ['mcp__mail__inbox', 'content_read', 'mcp__mail__drafts', 'mcp__calendar__week']);
  assert.deepEqual(result.servers, [{ id: 'mail', host: 'mail.example' }, { id: 'calendar', host: 'calendar.example' }]);
});

test('a host lock takes precedence over stored per-agent preferences in run facts', () => {
  const settings = assistantCliPermissions({ enabled: true, byAgent: { claude: { enabled: true } } });
  const effective = assistantCliPermissions({ enabled: false });
  const result = assistantRunToolFacts({
    agentId: 'claude',
    snapshot: { def: null, effective, isOwner: true, settings, settingsSource: 'site', lock: 'hosted',
      nativeCapabilities: effective.capabilities, policy: resolveNativeToolPolicy({ def: {}, policy: {} }) },
    plan: { verdict: 'SETUP', reason: 'host_locked', lock: 'hosted', keys: ['shell'] }, tools: [],
  });
  assert.deepEqual(result, {
    agent: 'claude', model: null, effort: null, enabled: false,
    capabilities: { shell: false, fileWrite: false, userMcp: false, subagents: false, userSettings: false, web: false, workflows: false, loginEnvironment: false },
    sources: { enabled: 'host_locked', shell: 'host_locked', fileWrite: 'host_locked', userMcp: 'host_locked', subagents: 'host_locked',
      userSettings: 'host_locked', web: 'host_locked', workflows: 'host_locked', loginEnvironment: 'host_locked' },
    source: 'provided', isolation: 'none', verdict: 'SETUP', keys: ['shell'], reason: 'host_locked',
    toolIds: [], servers: [], truncated: false,
  });
});
