import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryEventLog, createRunLifecycle } from '@jini-ai/daemon';
import { failRunBeforeStart } from '#src/assistant/agent-session-preset';
import { captureDaemonRun } from './helpers/daemon-source.js';

test('onStarted saves the preparation stage and cause on a pre-spawn rejection', async () => {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  await lifecycle.rehydrate({});
  await lifecycle.start({ contextRef: 'startup-cause' }, { runId: 'daemon-test-run' });
  const events: { kind: string; payload: unknown }[] = [];
  await lifecycle.stream({ runId: 'daemon-test-run', onEvent: event => { events.push(event); } });
  await assert.rejects(captureDaemonRun({ prompt: 'Continue' }, {
    lifecycle, terminalFailure: true,
    bindings: {
      failRunBeforeStart,
      console: { error() {}, warn() {}, log() {} },
      runOwners: { record() {}, forget() {} }, runCredentials: { revoke() {} }, RUN_OWNER_RETENTION_MS: 0,
      attachmentStore: undefined,
      setTimeout: () => ({ unref() { return this; } }),
      resolveAttachmentRunFields: async () => { throw new Error('attachment store unavailable; password=private-value'); },
    },
  }), /onStarted failed the run before executor dispatch/);
  const error = events.find(event => event.kind === 'error');
  assert.ok(error);
  const message = (error.payload as { message: string }).message;
  assert.match(message, /Startup stage: attachment preparation/);
  assert.match(message, /attachment store unavailable/);
  assert.ok(!message.includes('private-value'));
  assert.ok(Buffer.byteLength(message) <= 2048);
});
