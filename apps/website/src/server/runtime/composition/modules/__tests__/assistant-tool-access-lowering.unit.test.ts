import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerAssistantToolAccess } from '../assistant-tool-access-lowering.js';
import { ToolAccessLoweringError } from '@jini-ai/core/tool-access-change';

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

test('with no injected ports a cold site resolves its own readiness and never contacts a daemon', async () => {
  assert.equal(await lowerAssistantToolAccess({ agentIds: ['claude'] }), undefined);
});

test('an oversized change, a missing credential and a non-true ok answer are refused before or after the single send', async () => {
  const sent: string[] = [];
  const send = async (url: string | URL | Request) => { sent.push(String(url)); return Response.json({ ok: 'yes' }); };
  const isRefusal = (error: unknown) => error instanceof ToolAccessLoweringError;
  await assert.rejects(lowerAssistantToolAccess({ agentIds: ['a'.repeat(1100)] }, { isReady: () => true, token: () => 'tok-a', daemonUrl: () => 'http://d', send }), isRefusal);
  await assert.rejects(lowerAssistantToolAccess({ agentIds: ['claude'] }, { isReady: () => true, token: () => undefined, daemonUrl: () => 'http://d', send }), isRefusal);
  assert.deepEqual(sent, []);
  await assert.rejects(lowerAssistantToolAccess({ agentIds: ['claude'] }, { isReady: () => true, token: () => 'tok-a', daemonUrl: () => 'http://d', send }), isRefusal);
  assert.deepEqual(sent, ['http://d/api/tool-access/lower']);
});

test('without an injected sender or token the default fetch carries the environment daemon token to the site-chosen url', async () => {
  const { createServer } = await import('node:http');
  const seen: Array<{ url?: string; auth?: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { seen.push({ url: req.url, auth: req.headers.authorization, body }); res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.TOVU_AGENT_DAEMON_TOKEN;
  process.env.TOVU_AGENT_DAEMON_TOKEN = 'tok-env';
  try {
    const { port } = server.address() as { port: number };
    await lowerAssistantToolAccess({ serverIds: ['mail'] }, { isReady: () => true, daemonUrl: () => `http://127.0.0.1:${port}` });
    assert.deepEqual(seen, [{ url: '/api/tool-access/lower', auth: 'Bearer tok-env', body: '{"serverIds":["mail"]}' }]);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_DAEMON_TOKEN; else process.env.TOVU_AGENT_DAEMON_TOKEN = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
