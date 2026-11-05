import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerAssistantToolAccess, ToolAccessLoweringError } from '../assistant-tool-access-lowering.js';

test('tool lowering is cold-safe and sends the site capability without caller identity fields', async () => {
  let calls = 0;
  await lowerAssistantToolAccess({ agentIds: ['claude'] }, { isReady: () => false, send: async () => { calls++; throw new Error(); } });
  assert.equal(calls, 0);
  await lowerAssistantToolAccess({ serverIds: ['mail'] }, { isReady: () => true, token: () => 'test-capability', daemonUrl: () => 'http://daemon/s/site', send: async (url, options) => {
    calls++; assert.equal(url, 'http://daemon/s/site/api/tool-access/lower');
    assert.equal((options?.headers as Record<string,string>).authorization, 'Bearer test-capability');
    assert.deepEqual(JSON.parse(options?.body as string), { serverIds: ['mail'] });
    return Response.json({ ok: true });
  } });
  assert.equal(calls, 1);
});

test('failed cleanup or unreachable control remains a visible error without secret details', async () => {
  for (const send of [async () => Response.json({ ok: false }, { status: 503 }), async () => { throw new Error('sentinel-token'); }]) {
    await assert.rejects(lowerAssistantToolAccess({ agentIds: ['claude'] }, { isReady: () => true, token: () => 'secret', send }), error => error instanceof ToolAccessLoweringError && !error.message.includes('sentinel'));
  }
});
