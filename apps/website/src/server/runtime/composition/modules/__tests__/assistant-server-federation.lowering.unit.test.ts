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

test('a discovery reload that fails after a confirmed Stop is logged once by error type and never fails the lowering', async t => {
  resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests();
  t.after(() => { resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests(); });
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  let failed!: () => void; const reloadFailed = new Promise<void>(resolve => { failed = resolve; });
  const runtime = createAssistantServerFederation({ toolSurface: {
    readFederationAdmissions: async () => { queueMicrotask(failed); throw new Error('roster read failed'); },
    awaitFederation: async () => ({ settled: true }), federation: undefined,
    daemonCalls: { listToolsFor: async () => [], executor: { execute: async () => ({ status: 'cancelled', executionId: 'unused' }), cancel: () => {}, resumeConfirmation: () => {}, getAuditRecord: () => null } },
  } }, { lowerLocal: async () => {} });
  runtime.registerRosterListener({}, {});
  await notifyExternalMcpRosterChanged({ lowered: { serverIds: ['mail'] }, waitMs: 100 });
  await reloadFailed;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(logged, [['[assistant] Could not reload the tool federation', 'Error']], 'logged by error type only, never its message');
});
