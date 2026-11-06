import assert from 'node:assert/strict';
import test from 'node:test';
import type { ElectronApplication } from '@playwright/test';
import { executionEvidence } from '../../e2e/desktop/_assistant-release-gate.js';

const noKey = { kind: 'error', payload: { message: 'No model key', error: { code: 'RELEASE_GATE_NO_MODEL_KEY' } } };
const startupError = { kind: 'error', payload: { message: 'Execution could not start', error: { code: 'STARTUP_FAILED', stage: 'CLI launch', cause: 'fixture launch refused' } } };

/** Run the actual serialized SSE reader against a finite authenticated-session response. */
async function readEvidence(frames: readonly unknown[]) {
  const state = globalThis as typeof globalThis & { __assistantGateSites?: unknown[] };
  const previous = state.__assistantGateSites;
  state.__assistantGateSites = [{ origin: 'http://127.0.0.1:1234', runId: 'run-1', session: {
    fetch: async () => new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')),
  } }];
  const app = { evaluate: async (fn: () => unknown) => fn() } as unknown as ElectronApplication;
  try { return await executionEvidence({ app }); }
  finally {
    if (previous === undefined) delete state.__assistantGateSites;
    else state.__assistantGateSites = previous;
  }
}

for (const ending of ['end frame', 'stream close'] as const) {
  test(`premature ${ending} reports the original startup error frame`, async () => {
    await assert.rejects(readEvidence([startupError, ...(ending === 'end frame' ? [{ kind: 'end', payload: {} }] : [])]), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(JSON.stringify(startupError)), error.message);
      assert.match(error.message, /Run ended before CLI scope evidence/);
      return true;
    });
  });
}

test('the expected refusal alone still cannot satisfy CLI evidence', async () => {
  await assert.rejects(readEvidence([noKey]), /Run ended before CLI scope evidence/);
});

test('a child, session and the expected refusal are all required', async () => {
  const [evidence] = await readEvidence([{ kind: 'status', payload: { type: 'status', childPid: 123, sessionId: 'gate:site:123' } }, noKey]);
  assert.equal(evidence?.childPid, 123);
  assert.equal(evidence?.sessionId, 'gate:site:123');
  assert.equal(evidence?.reason, 'No model key');
  await assert.rejects(readEvidence([{ kind: 'status', payload: { type: 'status', childPid: 123, sessionId: 'gate:site:123' } }, startupError]), /Run ended before CLI scope evidence/);
});
