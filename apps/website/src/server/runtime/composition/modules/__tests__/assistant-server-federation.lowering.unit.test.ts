import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistantServerFederation } from '../assistant-server-federation.js';
import { notifyExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from '#src/assistant/external-mcp-roster-change';
import { resetAssistantDaemonSingletonForTests } from '#src/server/runtime/lifecycle/daemon-supervisor';

test('confirmed Stop is acknowledged without waiting for optional discovery reload', async t => {
  resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests();
  t.after(() => { resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests(); });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let stopped = false;
  const runtime = createAssistantServerFederation({ toolSurface: {
    readFederationAdmissions: async () => { await held; return { connections: [], configFailures: [] }; },
    awaitFederation: async () => ({ settled: true }), federation: undefined,
    daemonCalls: { listToolsFor: async () => [], executor: { execute: async () => ({ status: 'cancelled', executionId: 'unused' }), cancel: () => {}, resumeConfirmation: () => {}, getAuditRecord: () => null } },
  } }, { lowerLocal: async change => { assert.deepEqual(change, { serverIds: ['mail'] }); stopped = true; } });
  runtime.registerRosterListener({}, {});
  try { await notifyExternalMcpRosterChanged({ lowered: { serverIds: ['mail'] }, waitMs: 100 }); }
  finally { release(); }
  assert.equal(stopped, true);
});
